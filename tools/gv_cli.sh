#!/bin/bash
# FILE: tools/gv_cli.sh
# Unified CLI for GestureVision operations

set -e # Strict mode: fail on error (when untrapped)

# ---------------------------------------------------------
# Prerequisites & Globals
# ---------------------------------------------------------
if [ -z "$BASH_VERSION" ]; then
    if command -v bash >/dev/null 2>&1; then
        exec bash "$0" "$@"
    else
        echo "Error: This script requires 'bash'." >&2
        exit 1
    fi
fi

cd "$(dirname "$0")/.." || exit 1

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'
ADDON_DIR="ha-addon"

# ---------------------------------------------------------
# Shared Functions
# ---------------------------------------------------------

get_current_version() {
    if [ -f "package.json" ]; then
        node -p "require('./package.json').version" 2>/dev/null || echo "0.0.0"
    else
        echo "0.0.0"
    fi
}

calculate_next_version() {
    local type=$1
    local v
    v=$(get_current_version)
    if [[ ! "$v" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
        echo "INVALID_VERSION_FORMAT"
        return
    fi
    local major minor patch
    major=$(echo "$v" | cut -d. -f1)
    minor=$(echo "$v" | cut -d. -f2)
    patch=$(echo "$v" | cut -d. -f3)

    case $type in
        major) major=$((major + 1)); minor=0; patch=0 ;;
        minor) minor=$((minor + 1)); patch=0 ;;
        patch) patch=$((patch + 1)) ;;
        *) echo "INVALID_TYPE"; return ;;
    esac
    echo "${major}.${minor}.${patch}"
}

get_docker_compose_cmd() {
    if docker compose version &> /dev/null; then
        echo "docker compose"
    elif command -v docker-compose &> /dev/null; then
        echo "docker-compose"
    else
        echo ""
    fi
}

confirm_action() {
    local prompt_message="$1"
    local default_choice="${2:-Y}"
    local choice
    read -r -p "$prompt_message [${default_choice}]: " choice
    choice=${choice:-$default_choice}
    [[ "$choice" =~ ^[Yy]$ ]]
}

sync_lockfile() {
    echo "--------------------------------------------------"
    echo "Checking package-lock.json consistency..."
    if command -v npm &> /dev/null; then
        if npm install --package-lock-only --no-audit --no-fund; then
            echo -e "${GREEN}✔ package-lock.json synchronized.${NC}"
        else
            echo -e "${YELLOW}⚠ Warning: Failed to sync lockfile.${NC}"
        fi
    else
        echo -e "${YELLOW}⚠ Warning: 'npm' not found on host. Skipping lockfile sync.${NC}"
    fi
    echo "--------------------------------------------------"
}

get_env_var() {
    local var_name="$1"
    local env_file="$2"
    if [ ! -f "$env_file" ]; then echo ""; return; fi
    awk -F "=" -v key="$var_name" '
    $1 ~ "^\\s*" key "\\s*$" {
        val=substr($0, index($0, "=") + 1);
        gsub(/^[ \t]+|[ \t]+$/, "", val);
        if ((substr(val, 1, 1) == "\"" && substr(val, length(val), 1) == "\"") || 
            (substr(val, 1, 1) == "\047" && substr(val, length(val), 1) == "\047")) {
            val=substr(val, 2, length(val)-2);
        }
        print val;
        exit;
    }' "$env_file"
}

perform_bump() {
    local new_version="$1"
    local changelog_text="$2"

    echo -e "${BLUE}Bumping to version: $new_version${NC}"

    if [ -f "package.json" ]; then
        if command -v npm >/dev/null 2>&1; then
            npm version "$new_version" --no-git-tag-version --allow-same-version >/dev/null 2>&1
            echo "✔ Updated package.json and package-lock.json smoothly"
        else
            sed -i.bak "s/\"version\": \".*\"/\"version\": \"$new_version\"/" package.json
            rm -f package.json.bak
            echo "✔ Updated package.json using sed (npm not found)"
        fi
    else
        echo -e "${RED}Error: package.json not found.${NC}"
        exit 1
    fi

    local config_file="$ADDON_DIR/config.yaml"
    if [ -f "$config_file" ]; then
        sed -i.bak "s/^version: \".*\"/version: \"$new_version\"/" "$config_file"
        rm -f "${config_file}.bak"
        echo "✔ Updated $config_file"
    else
        echo -e "${YELLOW}⚠ Warning: $config_file not found.${NC}"
    fi

    local changelog_file="$ADDON_DIR/CHANGELOG.md"
    local date_str
    date_str=$(date +%Y-%m-%d)
    
    if [ ! -f "$changelog_file" ]; then echo "# Changelog" > "$changelog_file"; fi

    if ! grep -q "## $new_version" "$changelog_file"; then
        echo -e "## $new_version ($date_str)\n$changelog_text\n" > "${changelog_file}.tmp"
        cat "$changelog_file" >> "${changelog_file}.tmp"
        mv "${changelog_file}.tmp" "$changelog_file"
        echo "✔ Updated $changelog_file"
    else
        echo "⚠ Changelog already has entry for $new_version, skipping."
    fi
}

save_config_to_env() {
    local target_file="$1"
    declare -n config_to_save="$2"
    local source_file_for_structure="$3"
    declare -n specific_keys="${4:-}"
    
    echo "Saving configuration to '$target_file'..."
    if [ -f "$target_file" ]; then cp "$target_file" "${target_file}.bak"; echo "Backup: ${target_file}.bak"; fi
    local temp_output_file="${target_file}.tmp"
    echo "# Config generated by script on $(date)" > "$temp_output_file"; echo "" >> "$temp_output_file"
    
    declare -A processed_keys_output
    local all_managed_keys=( "PROD_IMAGE_NAME" )
    if [[ -n "$4" ]]; then
        all_managed_keys+=( "${!specific_keys[@]}" )
    fi
    
    mapfile -t unique_managed_keys < <(printf "%s\n" "${all_managed_keys[@]}" | sort -u)
    for key in "${unique_managed_keys[@]}"; do if [[ ! -v config_to_save["$key"] ]]; then config_to_save["$key"]=""; fi; done
    
    if [ -f "$source_file_for_structure" ]; then
        while IFS= read -r line || [[ -n "$line" ]]; do
            if [[ "$line" =~ ^[[:space:]]*([A-Za-z_][A-Za-z0-9_]*)[[:space:]]*= ]]; then
                local key="${BASH_REMATCH[1]}"
                if [[ -v config_to_save["$key"] ]]; then
                     local value_to_write="${config_to_save["$key"]}"
                     if [[ "$value_to_write" == *" "* ]]; then echo "$key=\"$value_to_write\"" >> "$temp_output_file"
                     else echo "$key=$value_to_write" >> "$temp_output_file"; fi
                     processed_keys_output["$key"]=1
                 else echo "$line" >> "$temp_output_file"; fi
            else echo "$line" >> "$temp_output_file"; fi
        done < "$source_file_for_structure"
    fi
    for key in "${unique_managed_keys[@]}"; do
         if [[ -z "${processed_keys_output["$key"]-}" ]]; then
             local value_to_write="${config_to_save["$key"]}"
             if [[ "$value_to_write" == *" "* ]]; then echo "$key=\"$value_to_write\"" >> "$temp_output_file"
             else echo "$key=$value_to_write" >> "$temp_output_file"; fi
         fi
    done
    mv "$temp_output_file" "$target_file"; echo "Successfully saved to '$target_file'."
}

# ---------------------------------------------------------
# Subcommands
# ---------------------------------------------------------

cmd_bump() {
    local BUMP_TYPE=""
    local NEW_VERSION=""
    while [[ $# -gt 0 ]]; do
        case $1 in
            -h|--help)
                echo "Usage: gv_cli.sh bump [options]"
                echo "  -t, --type <type>        Bump type: patch, minor, major"
                echo "  -v, --version <ver>      Set explicit version (e.g. 1.2.3)"
                exit 0 ;;
            -t|--type) BUMP_TYPE="$2"; shift 2 ;;
            -v|--version) NEW_VERSION="$2"; shift 2 ;;
            *) echo "Unknown argument: $1"; exit 1 ;;
        esac
    done

    if [ ! -d "$ADDON_DIR" ]; then echo -e "${RED}Error: Add-on directory '$ADDON_DIR' not found.${NC}"; exit 1; fi

    if [ -n "$BUMP_TYPE" ]; then
        NEW_VERSION=$(calculate_next_version "$BUMP_TYPE")
        if [ "$NEW_VERSION" == "INVALID_VERSION_FORMAT" ] || [ "$NEW_VERSION" == "INVALID_TYPE" ]; then
            echo -e "${RED}Error: Invalid type or version format.${NC}"; exit 1
        fi
    elif [ -z "$NEW_VERSION" ]; then
        echo -e "${RED}Error: Must provide -t (type) or -v (version).${NC}"; exit 1
    fi

    perform_bump "$NEW_VERSION" "- Maintenance release."
    echo -e "${GREEN}Version bump complete.${NC}"
}

cmd_release() {
    local BUMP_TYPE=""
    local NEW_VERSION=""
    local COMMIT_MESSAGE=""
    local CHANGELOG_MESSAGE=""
    local TARGET_BRANCH="dev"
    local AUTO_CONFIRM=false
    local SKIP_BUMP=false
    while [[ $# -gt 0 ]]; do
        case $1 in
            -h|--help)
                echo "Usage: gv_cli.sh release [options]"
                echo "  -t, --type <type>        Bump type: patch, minor, major"
                echo "  -v, --version <ver>      Explicit version (e.g. 1.2.3)"
                echo "  -m, --message <msg>      Git commit message"
                echo "  -c, --changelog <msg>    Git changelog body"
                echo "  -b, --branch <name>      Target git branch. Defaults to 'dev'"
                echo "  -y, --yes                Bypass confirmations"
                echo "  -n, --no-bump            Skip version bump. Only commit & push"
                exit 0 ;;
            -t|--type) BUMP_TYPE="$2"; shift 2 ;;
            -v|--version) NEW_VERSION="$2"; shift 2 ;;
            -m|--message) COMMIT_MESSAGE="$2"; shift 2 ;;
            -c|--changelog) CHANGELOG_MESSAGE="$2"; shift 2 ;;
            -b|--branch) TARGET_BRANCH="$2"; shift 2 ;;
            -y|--yes) AUTO_CONFIRM=true; shift ;;
            -n|--no-bump) SKIP_BUMP=true; shift ;;
            *) echo "Unknown argument: $1"; exit 1 ;;
        esac
    done

    if [ ! -d "$ADDON_DIR" ]; then echo -e "${RED}Error: Directory '$ADDON_DIR' not found.${NC}"; exit 1; fi

    if [ "$SKIP_BUMP" = false ]; then
        if [ -n "$BUMP_TYPE" ]; then
            NEW_VERSION=$(calculate_next_version "$BUMP_TYPE")
            if [ "$NEW_VERSION" == "INVALID_VERSION_FORMAT" ] || [ "$NEW_VERSION" == "INVALID_TYPE" ]; then
                echo -e "${RED}Error: Invalid type or format.${NC}"; exit 1
            fi
        elif [ -z "$NEW_VERSION" ]; then
            echo -e "${RED}Error: Must provide -t or -v.${NC}"; exit 1
        fi
        
        local log_text="${CHANGELOG_MESSAGE:-${COMMIT_MESSAGE:-Maintenance release.}}"
        perform_bump "$NEW_VERSION" "$log_text"
    fi

    if command -v ffmpeg &> /dev/null; then
        if [ ! -f "$ADDON_DIR/icon.png" ]; then ffmpeg -i packages/frontend/public/icons/icon-maskable-512.webp "$ADDON_DIR/icon.png" -y -v quiet; echo "✔ Generated icon.png"; fi
        if [ ! -f "$ADDON_DIR/logo.png" ]; then ffmpeg -i packages/frontend/public/icons/icon-maskable-512.webp "$ADDON_DIR/logo.png" -y -v quiet; echo "✔ Generated logo.png"; fi
    fi

    local full_msg="chore: release v${NEW_VERSION:-update} - ${COMMIT_MESSAGE:-Maintenance}"
    echo; echo -e "${YELLOW}Staging files...${NC}"
    git add -A
    git commit -m "$full_msg" || echo "No changes to commit."

    echo -e "${YELLOW}Target Branch: ${TARGET_BRANCH}${NC}"
    if [ "$AUTO_CONFIRM" = false ]; then
        if ! confirm_action "Push to origin/${TARGET_BRANCH}?" "Y"; then exit 0; fi
    fi

    if git push origin HEAD:"$TARGET_BRANCH"; then
        echo -e "${GREEN}Success! Pushed to $TARGET_BRANCH.${NC}"
    else
        echo -e "${RED}Error: Failed to push to $TARGET_BRANCH.${NC}"
        echo -e "${YELLOW}Hint: Try 'git pull --rebase origin $TARGET_BRANCH' and push again.${NC}"
        exit 1
    fi
}

cmd_dev() {
    local DOCKER_COMPOSE_CMD
    DOCKER_COMPOSE_CMD=$(get_docker_compose_cmd)
    if [ -z "$DOCKER_COMPOSE_CMD" ]; then echo "ERROR: docker compose not found." >&2; exit 1; fi

    local BYPASS_INTERACTIVE=false
    local ACTION_BUILD="ask"
    local SPECIFIED_TAG=""
    local FORCE_DETACHED="ask"
    local NO_CACHE_BUILD=false

    while [[ $# -gt 0 ]]; do
        case $1 in
            -h|--help)
                echo "Usage: gv_cli.sh dev [options]"
                echo "  -y, --yes               Bypass interactive confirmation"
                echo "  --build                 Force image build"
                echo "  --run-only              Skip image build"
                echo "  --no-cache              Build without cache"
                echo "  --tag <tag>             Specify image tag"
                echo "  --detached <true|false> Run container attached or detached"
                exit 0 ;;
            -y|--yes) BYPASS_INTERACTIVE=true; shift ;;
            --build) ACTION_BUILD="yes"; shift ;;
            --run-only) ACTION_BUILD="no"; shift ;;
            --no-cache) NO_CACHE_BUILD=true; shift ;;
            --tag) if [[ -n "$2" && "$2" != -* ]]; then SPECIFIED_TAG="$2"; shift 2; else echo "Error: --tag missing arg" >&2; exit 1; fi ;;
            --detached) if [[ "$2" == "true" ]]; then FORCE_DETACHED="yes"; elif [[ "$2" == "false" ]]; then FORCE_DETACHED="no"; else echo "Error" >&2; exit 1; fi; shift 2 ;;
            *) echo "Unknown option: $1" >&2; exit 1 ;;
        esac
    done

    clear
    echo "================================================================"
    echo "== GestureVision Development Environment Update =="
    echo "================================================================"; echo

    local ENV_FILE="config/.env.dev"
    local EXAMPLE_ENV_FILE="config/.env.dev.example"
    local DOCKER_COMPOSE_FILE="docker-compose.dev.yaml"
    local PROJECT_NAME="gesturevision_dev_project"
    local CONFIG_DEV_FILE="config/config.dev.json"
    local CONFIG_EXAMPLE_FILE="config/gesturevision.example.json"

    if [ ! -f "$EXAMPLE_ENV_FILE" ]; then echo "ERROR: '$EXAMPLE_ENV_FILE' not found." >&2; exit 1; fi
    if [ ! -f "$ENV_FILE" ]; then echo "INFO: '$ENV_FILE' not found. Copying from example."; cp "$EXAMPLE_ENV_FILE" "$ENV_FILE"; fi
    if [ ! -f "$DOCKER_COMPOSE_FILE" ]; then echo "ERROR: '$DOCKER_COMPOSE_FILE' not found." >&2; exit 1; fi

    if [ -d "$CONFIG_DEV_FILE" ]; then echo "ERROR: '$CONFIG_DEV_FILE' is a directory! Run 'sudo rm -rf $CONFIG_DEV_FILE'" >&2; exit 1; fi
    if [ ! -f "$CONFIG_DEV_FILE" ]; then
        if [ -f "$CONFIG_EXAMPLE_FILE" ]; then cp "$CONFIG_EXAMPLE_FILE" "$CONFIG_DEV_FILE"
        else echo "ERROR: Could not create '$CONFIG_DEV_FILE'." >&2; exit 1; fi
    fi

    local APP_VERSION
    APP_VERSION=$(get_current_version)
    echo "App Version: $APP_VERSION"

    local FINAL_IMAGE_TAG=""
    if [ -n "$SPECIFIED_TAG" ]; then
        FINAL_IMAGE_TAG="$SPECIFIED_TAG"
    else
        local TEMPLATE_IMAGE_NAME
        TEMPLATE_IMAGE_NAME=$(get_env_var "DEV_IMAGE_NAME" "$ENV_FILE")
        FINAL_IMAGE_TAG=$(eval echo "$TEMPLATE_IMAGE_NAME") 
    fi
    export DEV_IMAGE_NAME="$FINAL_IMAGE_TAG"

    echo "[Step 3/7] Pruning Docker resources..."
    if $BYPASS_INTERACTIVE || confirm_action "Prune dangling Docker images and all unused volumes?"; then
        $DOCKER_COMPOSE_CMD -p "$PROJECT_NAME" -f "$DOCKER_COMPOSE_FILE" --env-file "$ENV_FILE" down -v --remove-orphans --rmi local 2>/dev/null || true
        docker system prune -f --volumes 2>/dev/null || true
    fi

    echo "[Step 4/7] Stopping existing container..."
    $DOCKER_COMPOSE_CMD -p "$PROJECT_NAME" -f "$DOCKER_COMPOSE_FILE" --env-file "$ENV_FILE" down -v || true

    if [ "$ACTION_BUILD" == "ask" ]; then
        if $BYPASS_INTERACTIVE; then ACTION_BUILD="yes"
        elif confirm_action "Build Docker image (n=use existing)?"; then ACTION_BUILD="yes"
        else ACTION_BUILD="no"; fi
    fi

    if [ "$ACTION_BUILD" == "yes" ]; then
        sync_lockfile
        echo "[Step 5/7] Building dev image: $FINAL_IMAGE_TAG..."
        local BUILD_ARGS_DEV=()
        if $NO_CACHE_BUILD; then BUILD_ARGS_DEV+=("--no-cache"); fi
        if ! $DOCKER_COMPOSE_CMD -p "$PROJECT_NAME" -f "$DOCKER_COMPOSE_FILE" --env-file "$ENV_FILE" build "${BUILD_ARGS_DEV[@]}"; then
            echo "!! DOCKER BUILD FAILED !!" >&2; exit 1
        fi
    fi

    local FINAL_DETACHED_FLAG_DEV=""
    if [ "$FORCE_DETACHED" == "yes" ]; then FINAL_DETACHED_FLAG_DEV="-d"
    elif [ "$FORCE_DETACHED" == "no" ]; then FINAL_DETACHED_FLAG_DEV=""
    elif $BYPASS_INTERACTIVE; then FINAL_DETACHED_FLAG_DEV="-d"
    elif confirm_action "Run container detached? [N]" "N"; then FINAL_DETACHED_FLAG_DEV="-d"
    fi

    echo "[Step 6/7] Starting container..."
    set +e
    $DOCKER_COMPOSE_CMD -p "$PROJECT_NAME" -f "$DOCKER_COMPOSE_FILE" --env-file "$ENV_FILE" up $FINAL_DETACHED_FLAG_DEV
    local EXIT_CODE=$?
    set -e
    if [ $EXIT_CODE -eq 0 ] || [ $EXIT_CODE -eq 130 ]; then
        echo "GestureVision Dev Environment Started or Interrupted cleanly!"
    else
        echo "!! DOCKER COMPOSE UP FAILED !! Code: $EXIT_CODE" >&2; exit $EXIT_CODE
    fi
}

cmd_prod() {
    local DOCKER_COMPOSE_CMD
    DOCKER_COMPOSE_CMD=$(get_docker_compose_cmd)
    if [ -z "$DOCKER_COMPOSE_CMD" ]; then echo "ERROR: docker compose not found." >&2; exit 1; fi

    local BYPASS_SERVER_INTERACTIVE=false
    local FORCE_SERVER_BUILD="ask"
    local FORCE_SERVER_DETACHED="ask"
    local SPECIFIED_SERVER_TAG=""
    local DO_APK_PREP=false
    local APK_ONLY_MODE=false
    local NO_CACHE_BUILD=false

    while [[ $# -gt 0 ]]; do
        case $1 in
            -h|--help)
                echo "Usage: gv_cli.sh prod [options]"
                echo "  -y, --yes           Bypass all interactive prompts"
                echo "  --build             Force image build"
                echo "  --run-only          Skip image build"
                echo "  --no-cache          Build without cache"
                echo "  --tag <image:tag>   Specify image tag"
                echo "  --detached <true|false> Run attached/detached"
                echo "  --apk               Also prepare APK assets"
                echo "  --apk-only          ONLY prepare APK assets"
                exit 0 ;;
            -y|--yes) BYPASS_SERVER_INTERACTIVE=true; shift ;;
            --build) FORCE_SERVER_BUILD="yes"; shift ;;
            --run-only) FORCE_SERVER_BUILD="no"; shift ;;
            --no-cache) NO_CACHE_BUILD=true; shift ;;
            --tag) if [[ -n "$2" && "$2" != -* ]]; then SPECIFIED_SERVER_TAG="$2"; shift 2; else echo "Error: --tag missing arg" >&2; exit 1; fi ;;
            --detached) if [[ "$2" == "true" ]]; then FORCE_SERVER_DETACHED="yes"; elif [[ "$2" == "false" ]]; then FORCE_SERVER_DETACHED="no"; else echo "Error" >&2; exit 1; fi; shift 2 ;;
            --apk) DO_APK_PREP=true; shift ;;
            --apk-only) DO_APK_PREP=true; APK_ONLY_MODE=true; shift ;;
            *) echo "Unknown option: $1" >&2; exit 1 ;;
        esac
    done

    echo "================================================================"
    echo "== GestureVision Production Deployment =="
    echo "================================================================"; echo
    
    local ENV_FILE="config/.env.prod"
    local EXAMPLE_ENV_FILE="config/.env.prod.example"
    local DOCKER_COMPOSE_FILE="docker-compose.yaml"
    local PROJECT_NAME="gesturevision_prod"

    declare -A ENV_VARS_TO_REVIEW=(
        ["APP_EXTERNAL_URL"]="Req:Full HTTPS URL"
        ["NPM_NETWORK_NAME"]="Req:Docker network name used by NPM"
        ["MTX_ICE_HOST"]="Req:Externally accessible IP of this Docker host"
        ["MTX_PROD_WEBRTC_PORT"]="Opt:Host port if direct WHEP access needed"
        ["MTX_PROD_WEBRTC_PORT_INTERNAL"]="Req:Internal WHEP port for MediaMTX"
        ["MTX_PROD_ICE_UDP_PORT"]="Opt:Host UDP port for WebRTC ICE"
        ["MTX_PROD_ICE_UDP_PORT_INTERNAL"]="Req:Internal UDP port for ICE"
        ["MTX_PROD_RTMP_PORT"]="Opt:Host port if direct RTMP access needed"
        ["MTX_PROD_RTMP_PORT_INTERNAL"]="Opt:Internal RTMP port"
        ["MTX_PROD_RTSP_PORT"]="Opt:Host port if direct RTSP access needed"
        ["MTX_PROD_RTSP_PORT_INTERNAL"]="Opt:Internal RTSP port"
        ["MTX_PROD_LOGLEVEL"]="Opt:MediaMTX log level"
        ["MTX_PROD_HLS_ADDRESS"]="Opt:MediaMTX HLS Address"
        ["MTX_API"]="Req:Enable MediaMTX API?"
        ["MTX_APIADDRESS_INTERNAL"]="Req:MediaMTX API Listen Address"
        ["BACKEND_API_PORT_INTERNAL"]="Req:Internal port for Backend API (Nginx proxies to this)"
        ["VITE_PROD_HA_DEFAULT_URL"]="Opt:Default Home Assistant URL for UI"
        ["VITE_PROD_HA_DEFAULT_TOKEN"]="Opt:Default Home Assistant Token for UI"
    )

    if [ ! -f "$EXAMPLE_ENV_FILE" ]; then echo "Error: '$EXAMPLE_ENV_FILE' not found." >&2; exit 1; fi
    if [ ! -f "$ENV_FILE" ]; then echo "Info: '$ENV_FILE' not found. Copying."; cp "$EXAMPLE_ENV_FILE" "$ENV_FILE"; fi

    if $DO_APK_PREP; then
        if [ ! -f "config/.env.apk" ]; then echo "Error: 'config/.env.apk' not found." >&2; exit 1; fi
        if ! command -v npm &> /dev/null; then echo "Error: npm missing." >&2; exit 1; fi
    fi

    if ! $APK_ONLY_MODE; then
        if [ ! -f "$DOCKER_COMPOSE_FILE" ]; then echo "Error: '$DOCKER_COMPOSE_FILE' not found." >&2; exit 1; fi
        local CONFIG_PROD_FILE="config/config.prod.json"
        local CONFIG_EXAMPLE_FILE="config/gesturevision.example.json"
        if [ -d "$CONFIG_PROD_FILE" ]; then echo "ERROR: '$CONFIG_PROD_FILE' is a directory! rm it." >&2; exit 1; fi
        if [ ! -f "$CONFIG_PROD_FILE" ]; then
            if [ -f "$CONFIG_EXAMPLE_FILE" ]; then cp "$CONFIG_EXAMPLE_FILE" "$CONFIG_PROD_FILE"
            else echo "ERROR: Could not create '$CONFIG_PROD_FILE'." >&2; exit 1; fi
        fi
    fi
    
    declare -A current_env_values
    local APP_VERSION
    APP_VERSION=$(get_current_version)
    export APP_VERSION
    
    local ALL_KEYS_TO_LOAD=( "PROD_IMAGE_NAME" "${!ENV_VARS_TO_REVIEW[@]}" )
    mapfile -t UNIQUE_KEYS < <(printf "%s\n" "${ALL_KEYS_TO_LOAD[@]}" | sort -u)
    for key in "${UNIQUE_KEYS[@]}"; do current_env_values["$key"]=$(get_env_var "$key" "$ENV_FILE"); done

    local SUGGESTED_SERVER_TAG="gesturevision:${APP_VERSION}"
    local DEFAULT_SERVER_IMAGE_PROMPT="${SPECIFIED_SERVER_TAG:-${current_env_values["PROD_IMAGE_NAME"]:-$SUGGESTED_SERVER_TAG}}"
    if [ -n "$SPECIFIED_SERVER_TAG" ]; then current_env_values["PROD_IMAGE_NAME"]="$SPECIFIED_SERVER_TAG"; fi

    local DO_SERVER_DEPLOY="yes"
    if $APK_ONLY_MODE; then
        DO_SERVER_DEPLOY="no"
    elif $DO_APK_PREP && [[ "$FORCE_SERVER_BUILD" != "yes" && -z "$SPECIFIED_SERVER_TAG" && -z "${current_env_values["PROD_IMAGE_NAME"]}" ]] ; then
        if $BYPASS_SERVER_INTERACTIVE; then DO_SERVER_DEPLOY="no"
        elif [ "$FORCE_SERVER_BUILD" == "ask" ]; then
            if ! confirm_action "The --apk flag is set. Proceed with server deployment?" "Y"; then DO_SERVER_DEPLOY="no"; fi
        fi
    fi

    if [ "$DO_SERVER_DEPLOY" == "yes" ]; then
        local DO_SERVER_BUILD_ACTION="$FORCE_SERVER_BUILD"
        local CHOSEN_SERVER_IMAGE_TAG="${current_env_values["PROD_IMAGE_NAME"]}"
        local SERVER_DETACHED_FLAG_CHOICE="$FORCE_SERVER_DETACHED"
        
        declare -A updated_env_values_server
        for key in "${!current_env_values[@]}"; do updated_env_values_server["$key"]="${current_env_values[$key]}"; done
        local CONFIG_SERVER_CHANGED=false
        local SAVE_SERVER_NEEDED=false

        if $BYPASS_SERVER_INTERACTIVE; then
            if [[ "$FORCE_SERVER_BUILD" == "ask" ]]; then DO_SERVER_BUILD_ACTION="yes"; fi
            CHOSEN_SERVER_IMAGE_TAG=${SPECIFIED_SERVER_TAG:-${updated_env_values_server["PROD_IMAGE_NAME"]:-$SUGGESTED_SERVER_TAG}}
            updated_env_values_server["PROD_IMAGE_NAME"]="$CHOSEN_SERVER_IMAGE_TAG"
            if [[ "$CHOSEN_SERVER_IMAGE_TAG" != "${current_env_values["PROD_IMAGE_NAME"]}" ]]; then SAVE_SERVER_NEEDED=true; fi
            if [[ "$FORCE_SERVER_DETACHED" == "ask" ]]; then SERVER_DETACHED_FLAG_CHOICE="yes"; fi
        else
            echo; echo "Step 1: Server Image Strategy"
            if [ "$DO_SERVER_BUILD_ACTION" == "ask" ]; then
                if confirm_action "Build server image from source? (Y/n)" "Y"; then DO_SERVER_BUILD_ACTION="yes"
                else DO_SERVER_BUILD_ACTION="no"; fi
            fi

            echo; echo "Step 2: Server Image Name/Tag"
            if [ -z "$CHOSEN_SERVER_IMAGE_TAG" ] && [ -z "$SPECIFIED_SERVER_TAG" ]; then
                local PROMPT_TEXT_S="Enter server image tag to RUN [Current: '${DEFAULT_SERVER_IMAGE_PROMPT}']: "
                read -r -p "$PROMPT_TEXT_S" tag_input_s
                CHOSEN_SERVER_IMAGE_TAG=${tag_input_s:-$DEFAULT_SERVER_IMAGE_PROMPT}
            elif [ -n "$SPECIFIED_SERVER_TAG" ]; then 
                CHOSEN_SERVER_IMAGE_TAG="$SPECIFIED_SERVER_TAG" 
            fi
            if [[ "${updated_env_values_server[PROD_IMAGE_NAME]}" != "$CHOSEN_SERVER_IMAGE_TAG" ]]; then updated_env_values_server["PROD_IMAGE_NAME"]="$CHOSEN_SERVER_IMAGE_TAG"; SAVE_SERVER_NEEDED=true; fi

            echo; echo "Step 3: Review/Configure Server Environment"
            while true; do
                echo "Num  |  Variable Name                 |  Current Value"
                echo "--------------------------------------------------------"
                declare -a req_keys_hint_s=() opt_keys_hint_s=()
                mapfile -t sorted_keys_s < <(printf "%s\n" "${!ENV_VARS_TO_REVIEW[@]}" | sort)
                declare -A num_to_key_map_s
                local item_num_s=1
                for key_s in "${sorted_keys_s[@]}"; do
                    local display_val_s="${updated_env_values_server["$key_s"]}"
                    if [[ "$key_s" == "VITE_PROD_HA_DEFAULT_TOKEN" && -n "$display_val_s" ]]; then display_val_s="********"; fi
                    printf "[%2d] %-30s | %-s\n" "$item_num_s" "$key_s" "$display_val_s"
                    num_to_key_map_s[$item_num_s]="$key_s"
                    ((item_num_s++))
                done
                local max_num_s=$((item_num_s - 1))
                read -r -p "Enter number (1-$max_num_s) to change, or 0 to continue: " user_choice_s
                if [[ "$user_choice_s" == "0" ]]; then break; fi
                if [[ "$user_choice_s" =~ ^[0-9]+$ && "$user_choice_s" -le "$max_num_s" && "$user_choice_s" -ge 1 ]]; then
                     local var_to_change_s="${num_to_key_map_s[$user_choice_s]}"
                     read -r -p "NEW value for ${var_to_change_s}: " new_val_s
                     if [[ "${updated_env_values_server["$var_to_change_s"]}" != "$new_val_s" ]]; then
                         updated_env_values_server["$var_to_change_s"]="$new_val_s"
                         CONFIG_SERVER_CHANGED=true; SAVE_SERVER_NEEDED=true
                     fi
                fi
            done
            if $CONFIG_SERVER_CHANGED; then
                if ! confirm_action "Save changes? (Y/n)" "Y"; then echo "Aborting."; exit 1; fi
            fi

            echo; echo "Step 4: Server Run Options"
            if [ "$SERVER_DETACHED_FLAG_CHOICE" == "ask" ]; then
                if confirm_action "Run server detached? [Y]" "Y"; then SERVER_DETACHED_FLAG_CHOICE="yes"; else SERVER_DETACHED_FLAG_CHOICE="no"; fi
            fi
        fi

        if [[ -z "${updated_env_values_server[MTX_PROD_WEBRTC_PORT_INTERNAL]}" ]]; then updated_env_values_server[MTX_PROD_WEBRTC_PORT_INTERNAL]="8888"; SAVE_SERVER_NEEDED=true; fi
        if [[ -z "${updated_env_values_server[MTX_PROD_ICE_UDP_PORT_INTERNAL]}" ]]; then updated_env_values_server[MTX_PROD_ICE_UDP_PORT_INTERNAL]="8189"; SAVE_SERVER_NEEDED=true; fi
        if [[ -z "${updated_env_values_server[MTX_API]}" ]]; then updated_env_values_server[MTX_API]="yes"; SAVE_SERVER_NEEDED=true; fi
        if [[ -z "${updated_env_values_server[MTX_APIADDRESS_INTERNAL]}" ]]; then updated_env_values_server[MTX_APIADDRESS_INTERNAL]="0.0.0.0:9997"; SAVE_SERVER_NEEDED=true; fi
        if [[ -z "${updated_env_values_server[BACKEND_API_PORT_INTERNAL]}" ]]; then updated_env_values_server[BACKEND_API_PORT_INTERNAL]="9001"; SAVE_SERVER_NEEDED=true; fi
        
        if $SAVE_SERVER_NEEDED; then save_config_to_env "$ENV_FILE" updated_env_values_server "$EXAMPLE_ENV_FILE" ENV_VARS_TO_REVIEW; fi

        local FINAL_SERVER_IMAGE_TAG="${updated_env_values_server[PROD_IMAGE_NAME]}"
        local FINAL_SERVER_DETACHED_FLAG=$([[ "$SERVER_DETACHED_FLAG_CHOICE" == "yes" ]] && echo "-d" || echo "")

        echo "[ACTION] Stopping server instance..."
        $DOCKER_COMPOSE_CMD -p "$PROJECT_NAME" --env-file "$ENV_FILE" -f "$DOCKER_COMPOSE_FILE" down -v || true

        if [ "$DO_SERVER_BUILD_ACTION" == "yes" ]; then
            sync_lockfile
            local BUILD_ARGS_PROD=()
            if $NO_CACHE_BUILD; then BUILD_ARGS_PROD+=("--no-cache"); fi
            
            if ! $DOCKER_COMPOSE_CMD -p "$PROJECT_NAME" -f "$DOCKER_COMPOSE_FILE" --env-file "$ENV_FILE" build \
                --build-arg VITE_PROD_WHEP_BASE_URL="${updated_env_values_server[APP_EXTERNAL_URL]}" \
                --build-arg VITE_PROD_HA_DEFAULT_URL="${updated_env_values_server[VITE_PROD_HA_DEFAULT_URL]}" \
                --build-arg VITE_PROD_HA_DEFAULT_TOKEN="${updated_env_values_server[VITE_PROD_HA_DEFAULT_TOKEN]}" \
                "${BUILD_ARGS_PROD[@]}"; then
                 echo "!! DOCKER SERVER BUILD FAILED !!" >&2; exit 1
            fi
            docker image prune -f --filter "label=project=gesturevision" || true
        fi

        echo "[ACTION] Starting Production Server..."
        set +e
        $DOCKER_COMPOSE_CMD -p "$PROJECT_NAME" -f "$DOCKER_COMPOSE_FILE" --env-file "$ENV_FILE" up $FINAL_SERVER_DETACHED_FLAG
        local START_EXIT_CODE=$?
        set -e
        if [ $START_EXIT_CODE -ne 0 ] && [ $START_EXIT_CODE -ne 130 ]; then
            echo "!! SERVER DOCKER COMPOSE UP FAILED !!" >&2; exit $START_EXIT_CODE
        fi
        echo "GestureVision Server Deployment Complete!"
    fi

    if $DO_APK_PREP; then
        echo "=== APK Asset Preparation ==="
        if [ -f "./tools/update_apk.sh" ]; then
            chmod +x ./tools/update_apk.sh
            if $BYPASS_SERVER_INTERACTIVE; then ./tools/update_apk.sh -y; else ./tools/update_apk.sh; fi
        else echo "[ERROR] update_apk.sh script not found." >&2; exit 1; fi
        echo "APK Asset Preparation Complete!"
    fi
}

cmd_clean() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            -h|--help)
                echo "Usage: gv_cli.sh clean"
                echo "Removes build artifacts, dependencies, and rebuilds the project."
                exit 0 ;;
            *) echo "Unknown option: $1" >&2; exit 1 ;;
        esac
    done
    clear; echo "Setting ownership of project files to current user..."
    if [ "$(whoami)" != "root" ]; then
        if sudo -n true 2>/dev/null; then sudo chown -R "$(whoami)":"$(whoami)" .
        else
            echo "Please enter your password to set file permissions."
            sudo chown -R "$(whoami)":"$(whoami)" .
        fi
    fi
    echo "Cleaning up old build artifacts..."
    sudo rm -rf ./dist ./packages/*/dist ./packages/*/dist-* ./packages/*/dev-dist
    sudo rm -rf ./packages/frontend/public/wasm ./packages/frontend/public/models ./packages/frontend/public/local-bundles
    sudo find ./packages -name '*.tsbuildinfo' -type f -exec rm -f {} +
    sudo find . -name '*.tsbuildinfo' -type f -exec rm -f {} +
    echo "Removing root node_modules and package-lock.json..."
    sudo rm -rf node_modules package-lock.json
    echo "Running a clean npm install..."
    npm install
    echo "Building Backend and Prerequisites..."
    npm run copy:wasm
    npm run copy:models
    npm run build:backend
    echo "Cleanup and rebuild complete."
}

cmd_filesize() {
    local TARGET_DIR="./packages"
    while [[ $# -gt 0 ]]; do
        case $1 in
            -h|--help)
                echo "Usage: gv_cli.sh filesize [options]"
                echo "  -d, --directory <path>   Specify directory to scan."
                exit 0 ;;
            -d|--directory) if [[ -n "$2" && "$2" != -* ]]; then TARGET_DIR="$2"; shift 2; else echo "Error." >&2; exit 1; fi ;;
            *) echo "Unknown option: $1" >&2; exit 1 ;;
        esac
    done
    if [ ! -d "$TARGET_DIR" ]; then
        if [ "$TARGET_DIR" == "./packages" ]; then TARGET_DIR="."; else echo "Directory not found." >&2; exit 1; fi
    fi
    clear; echo "Scanning for .css, .js and .ts files in: $TARGET_DIR"; echo "--------------------------------------------------"
    find "$TARGET_DIR" \
        -type d \( -name "node_modules" -o -name "dist" -o -name "dist-*" -o -name ".git" -o -name "android" -o -name "ios" -o -name "coverage" \) -prune \
        -o -type f \( -name "*.js" -o -name "*.ts" -o -name "*.css" \) -print0 | \
    xargs -0 wc -l 2>/dev/null | grep -v ' total$' | sort -nr | awk '{ printf "%s => %d\n", $2, $1 }'
    echo "Scan complete."
}

cmd_images() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            -h|--help) echo "Usage: gv_cli.sh images"; exit 0 ;;
            *) echo "Unknown option." >&2; exit 1 ;;
        esac
    done
    
    local APP_VERSION
    APP_VERSION=$(get_current_version)
    if [ "$APP_VERSION" == "0.0.0" ]; then echo "Error: Could not read version." >&2; exit 1; fi
    
    local PROD_IMAGE_NAME="gesturevision:${APP_VERSION}"
    local DEV_IMAGE_NAME="gesturevision-dev:${APP_VERSION}"

    if ! docker image inspect "$PROD_IMAGE_NAME" &> /dev/null; then echo "Error: Production image not found." >&2
    else docker save "$PROD_IMAGE_NAME" -o "./gesturevision_prod.tar" && echo "Saved PROD Image."; fi

    if ! docker image inspect "$DEV_IMAGE_NAME" &> /dev/null; then echo "Error: Development image not found." >&2
    else docker save "$DEV_IMAGE_NAME" -o "./gesturevision_dev.tar" && echo "Saved DEV Image."; fi
}

cmd_check() {
    clear
    echo "Running 'npm run lint-and-check'..."
    npm run lint-and-check
}

display_global_help() {
    echo "GestureVision Unified CLI"
    echo "Usage: $0 <command> [options]"
    echo ""
    echo "Commands:"
    echo "  bump       Bump version (package.json, ha-addon/config.yaml, CHANGELOG.md)"
    echo "  release    Automate release (bump, changelog, commit, push)"
    echo "  dev        Build & run development environment"
    echo "  prod       Build & run production environment"
    echo "  clean      Clean build artifacts and run npm install"
    echo "  filesize   Analyze source file line counts"
    echo "  images     Save Docker SDK images to .tar archives"
    echo "  check      Run lint and check"
    echo ""
    echo "Run '$0 <command> --help' for command-specific options."
}

# ---------------------------------------------------------
# Routing
# ---------------------------------------------------------

if [ $# -eq 0 ]; then
    display_global_help
    exit 0
fi

COMMAND="$1"
shift

case "$COMMAND" in
    bump) cmd_bump "$@" ;;
    release) cmd_release "$@" ;;
    dev) cmd_dev "$@" ;;
    prod) cmd_prod "$@" ;;
    clean) cmd_clean "$@" ;;
    filesize) cmd_filesize "$@" ;;
    images) cmd_images "$@" ;;
    check) cmd_check "$@" ;;
    -h|--help) display_global_help ;;
    *) echo "Unknown command: $COMMAND" >&2; display_global_help; exit 1 ;;
esac
