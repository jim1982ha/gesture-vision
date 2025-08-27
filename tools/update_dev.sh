#!/bin/bash
# FILE: tools/update_dev.sh
# updating development docker container with more options

# Navigate to the project root (parent directory of this script)
cd "$(dirname "$0")/.." || exit 1

# --- Helper Functions ---
get_env_var() {
    local var_name="$1"; local env_file="$2";
    if [ ! -f "$env_file" ]; then echo ""; return; fi
    local line
    line=$(grep -E "^\s*${var_name}\s*=" "$env_file" | grep -v '^\s*#' | tail -n 1)
    if [ -n "$line" ]; then
        local value
        value=$(echo "$line" | sed -e "s/^[^=]*=//")
        value=$(echo "$value" | sed -e "s/^[[:space:]]*//" -e "s/[[:space:]]*$//")
        if [[ "$value" == \"*\" && "$value" == *\" ]]; then
            value=$(echo "$value" | sed -e 's/^"//' -e 's/"$//')
        elif [[ "$value" == \'*\' && "$value" == *\' ]]; then
            value=$(echo "$value" | sed -e "s/^'//" -e "s/'$//")
        fi
        echo "$value"
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

display_help() {
    local script_name
    script_name=$(basename "$0")
    echo "Usage: ./tools/${script_name} [options]"
    echo
    echo "This script builds and runs the GestureVision development environment."
    echo
    echo "Options:"
    echo "  -h, --help              Display this help message and exit."
    echo "  -y, --yes               Bypass interactive confirmation prompts (uses defaults)."
    echo "  --build                 Force image build (default behavior). Combine with --no-cache if needed."
    echo "  --run-only              Skip image build, try to run existing image based on tag."
    echo "  --no-cache              When building, build without using cache."
    echo "  --tag <image_name:tag>  Specify the image name and tag to build or run."
    echo "                          Example: gesturevision-dev:my-feature"
    echo "  --detached <true|false> Run container in detached mode (true) or attached (false)."
    echo "                          Default for dev is attached (false)."
    echo
}

DOCKER_COMPOSE_CMD=""
if docker compose version &> /dev/null; then
    DOCKER_COMPOSE_CMD="docker compose"
elif command -v docker-compose &> /dev/null; then
    echo "INFO: Using 'docker-compose' (V1). Consider upgrading to Docker Compose V2 for 'docker compose'."
    DOCKER_COMPOSE_CMD="docker-compose"
else
    echo "ERROR: Neither 'docker compose' (V2) nor 'docker-compose' (V1) found. Aborting." >&2;
    exit 1
fi

BYPASS_INTERACTIVE=false
ACTION_BUILD="ask"
SPECIFIED_TAG=""
FORCE_DETACHED="ask"
NO_CACHE_BUILD=false

while [[ $# -gt 0 ]]; do
    key="$1"
    case $key in
        -h|--help) display_help; exit 0 ;;
        -y|--yes) BYPASS_INTERACTIVE=true; shift ;;
        --build) ACTION_BUILD="yes"; shift ;;
        --run-only) ACTION_BUILD="no"; shift ;;
        --no-cache) NO_CACHE_BUILD=true; shift ;;
        --tag)
            if [[ -n "$2" && "$2" != -* ]]; then SPECIFIED_TAG="$2"; shift 2;
            else echo "Error: Argument for --tag is missing" >&2; display_help; exit 1; fi ;;
        --detached)
            if [[ "$2" == "true" ]]; then FORCE_DETACHED="yes";
            elif [[ "$2" == "false" ]]; then FORCE_DETACHED="no";
            else echo "Error: Invalid value for --detached. Use 'true' or 'false'." >&2; display_help; exit 1; fi
            shift 2 ;;
        *) echo "Unknown option: $1" >&2; display_help; exit 1 ;;
    esac
done

clear
echo "================================================================"
echo "== GestureVision Development Environment Update Script =="
echo "================================================================"; echo

echo "[Step 1/7] Initial checks and environment setup..."
# FIX: Point to the correct file locations inside the config/ directory
ENV_FILE="config/.env.dev"
EXAMPLE_ENV_FILE="config/.env.dev.example"
DOCKER_COMPOSE_FILE="docker-compose.dev.yaml"
PROJECT_NAME="gesturevision_dev_project"

if [ ! -f "$EXAMPLE_ENV_FILE" ]; then echo "ERROR: '$EXAMPLE_ENV_FILE' not found." >&2; exit 1; fi
if [ ! -f "$ENV_FILE" ]; then echo "INFO: '$ENV_FILE' not found. Copying from '$EXAMPLE_ENV_FILE'."; cp "$EXAMPLE_ENV_FILE" "$ENV_FILE"; fi
if [ ! -f "$DOCKER_COMPOSE_FILE" ]; then echo "ERROR: '$DOCKER_COMPOSE_FILE' not found." >&2; exit 1; fi
echo "Initial checks passed. Using '$DOCKER_COMPOSE_CMD'."
echo

echo "[Step 2/7] Determining application version and image tag..."
APP_VERSION=$(node -p "require('./package.json').version" 2>/dev/null || echo "unknown")
if [ "$APP_VERSION" == "unknown" ]; then echo "Warning: Could not read version from package.json. Using 'unknown'."; fi
echo "App Version: $APP_VERSION"

FINAL_IMAGE_TAG=""
if [ -n "$SPECIFIED_TAG" ]; then
    FINAL_IMAGE_TAG="$SPECIFIED_TAG"
    echo "Using specified tag from command line: $FINAL_IMAGE_TAG"
else
    TEMPLATE_IMAGE_NAME=$(get_env_var "DEV_IMAGE_NAME" "$ENV_FILE")
    FINAL_IMAGE_TAG=$(eval echo "$TEMPLATE_IMAGE_NAME")
    echo "Evaluated image tag from .env.dev: $FINAL_IMAGE_TAG"
fi

export DEV_IMAGE_NAME="$FINAL_IMAGE_TAG"
echo "Using image name for this session: $DEV_IMAGE_NAME (exported to environment)"
echo

echo "[Step 3/7] Pruning Docker resources..."
if $BYPASS_INTERACTIVE || confirm_action "Prune dangling Docker images and all unused volumes? (Recommended for dev)"; then
    $DOCKER_COMPOSE_CMD -p "$PROJECT_NAME" -f "$DOCKER_COMPOSE_FILE" --env-file "$ENV_FILE" down -v --remove-orphans --rmi local 2>/dev/null || echo "No active project instances or nothing to prune."
    docker system prune -f --volumes 2>/dev/null || echo "System prune already minimal or failed."
    echo "Pruning complete."
else echo "Pruning skipped by user."; fi; echo

echo "[Step 4/7] Stopping existing development container (if any)..."
$DOCKER_COMPOSE_CMD -p "$PROJECT_NAME" -f "$DOCKER_COMPOSE_FILE" --env-file "$ENV_FILE" down -v || echo "No previous dev instance or already stopped."
echo

if [ "$ACTION_BUILD" == "ask" ]; then
    if $BYPASS_INTERACTIVE; then ACTION_BUILD="yes"; echo "Defaulting to build image (-y flag).";
    elif confirm_action "Build Docker image '$FINAL_IMAGE_TAG'? (n=use existing)"; then ACTION_BUILD="yes";
    else ACTION_BUILD="no"; echo "Skipping build. Will attempt to run existing image: $FINAL_IMAGE_TAG"; fi
fi; echo

if [ "$ACTION_BUILD" == "yes" ]; then
    echo "[Step 5/7] Building development image: $FINAL_IMAGE_TAG..."
    BUILD_ARGS_DEV=""
    if $NO_CACHE_BUILD; then BUILD_ARGS_DEV="--no-cache"; echo "Building with --no-cache flag."; fi
    # shellcheck disable=SC2086
    if $DOCKER_COMPOSE_CMD -p "$PROJECT_NAME" -f "$DOCKER_COMPOSE_FILE" --env-file "$ENV_FILE" build $BUILD_ARGS_DEV; then
        echo "Build successful for image: $FINAL_IMAGE_TAG"
    else echo "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!"; echo "!! DOCKER BUILD FAILED - Aborting update    !!"; echo "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!"; exit 1; fi
else echo "[Step 5/7] Skipping image build as requested."; fi; echo

FINAL_DETACHED_FLAG_DEV=""
if [ "$FORCE_DETACHED" == "yes" ]; then FINAL_DETACHED_FLAG_DEV="-d"; echo "Running in detached mode (forced).";
elif [ "$FORCE_DETACHED" == "no" ]; then FINAL_DETACHED_FLAG_DEV=""; echo "Running in attached mode (forced).";
elif $BYPASS_INTERACTIVE; then FINAL_DETACHED_FLAG_DEV=""; echo "Defaulting to attached mode (-y flag).";
elif confirm_action "Run container in detached mode (background)? (Y/n) [N for dev logs]" "N"; then FINAL_DETACHED_FLAG_DEV="-d";
else FINAL_DETACHED_FLAG_DEV=""; fi; echo

echo "[Step 6/7] Starting development container: $FINAL_IMAGE_TAG..."
# shellcheck disable=SC2086
$DOCKER_COMPOSE_CMD -p "$PROJECT_NAME" -f "$DOCKER_COMPOSE_FILE" --env-file "$ENV_FILE" up $FINAL_DETACHED_FLAG_DEV
EXIT_CODE=$?

if [ $EXIT_CODE -eq 0 ]; then
    echo "--------------------------------------------------"; echo "GestureVision Development Environment Started!"; echo "Image: $FINAL_IMAGE_TAG"
    if [ "$FINAL_DETACHED_FLAG_DEV" == "-d" ]; then echo "Running detached. Logs: $DOCKER_COMPOSE_CMD -p \"$PROJECT_NAME\" logs -f gesturevision-dev";
    else echo "Running attached. Press Ctrl+C to stop."; fi
    echo "Access UI at: https://localhost:$(get_env_var DEV_VITE_PORT "$ENV_FILE" || echo "8001")"; echo "--------------------------------------------------"
elif [ $EXIT_CODE -eq 130 ]; then
    echo "--------------------------------------------------";
    echo "GestureVision Development Environment was interrupted by user (Ctrl+C)."
    echo "Image: $FINAL_IMAGE_TAG"
    echo "--------------------------------------------------"
else
    echo "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!";
    echo "!! DOCKER COMPOSE UP FAILED (Exit Code: $EXIT_CODE) - Check logs above    !!";
    echo "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!";
    exit $EXIT_CODE;
fi; echo

echo "[Step 7/7] Script finished."; exit 0