#!/bin/bash
# Usage: ./tools/release.sh -t patch -m "Commit message" -c "Changelog message" -b "dev"
cd "$(dirname "$0")/.." || exit 1

# --- Colors ---
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

# --- Defaults ---
ADDON_DIR="ha-addon"
BUMP_TYPE=""
NEW_VERSION=""
COMMIT_MESSAGE=""
CHANGELOG_MESSAGE=""
TARGET_BRANCH="dev" # Default target branch
AUTO_CONFIRM=false
SKIP_BUMP=false
SHOW_HELP=false

# --- Function: Display Help ---
display_help() {
    echo -e "${BLUE}GestureVision Release Tool${NC}"
    echo "Automates version bumping, changelog updating, git commit, and pushing to a specific branch."
    echo
    echo "Usage: $0 [options]"
    echo
    echo "Options:"
    echo "  -h, --help               Show this help message and exit."
    echo "  -t, --type <type>        Bump type: 'patch', 'minor', or 'major'."
    echo "  -v, --version <ver>      Set an explicit version number (e.g., 4.5.0)."
    echo "  -m, --message <msg>      Git commit message (required if not using -n)."
    echo "                           If -c is not provided, this is also used for the Changelog."
    echo "  -c, --changelog <msg>    (Optional) Specific text for the CHANGELOG.md file."
    echo "                           Supports multiple lines using '\n'. e.g., \"- Fix A\n- Fix B\""
    echo "  -b, --branch <name>      Target git branch to push to. Defaults to 'dev'."
    echo "  -n, --no-bump            Skip version bumping and file updates. Only commit and push."
    echo "  -y, --yes                Bypass confirmation prompts."
    echo
    echo "Examples:"
    echo "  1. Standard patch release to 'dev':"
    echo "     $0 -t patch -m \"Fix navigation bug\""
    echo
    echo "  2. Release to 'main' with multi-line changelog:"
    echo "     $0 -t minor -b main -m \"v1.2.0 Release\" -c \"## Features\n- Added Dashboard\n- Fixed Nginx\""
    echo
}

# --- Argument Parsing ---
while [[ $# -gt 0 ]]; do
    case $1 in
        -h|--help) SHOW_HELP=true; shift ;;
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

if [ "$SHOW_HELP" = true ]; then
    display_help
    exit 0
fi

# --- Helper Functions ---
get_current_version() {
    if [ -f "package.json" ]; then
        grep '"version":' package.json | head -1 | awk -F: '{ print $2 }' | sed 's/[",]//g' | tr -d '[[:space:]]'
    else
        echo "0.0.0"
    fi
}

calculate_next_version() {
    local type=$1
    local v=$(get_current_version)
    if [[ ! "$v" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
        echo "INVALID_VERSION_FORMAT"
        return
    fi
    local major=$(echo $v | cut -d. -f1)
    local minor=$(echo $v | cut -d. -f2)
    local patch=$(echo $v | cut -d. -f3)
    case $type in
        major) major=$((major + 1)); minor=0; patch=0 ;;
        minor) minor=$((minor + 1)); patch=0 ;;
        patch) patch=$((patch + 1)) ;;
    esac
    echo "${major}.${minor}.${patch}"
}

# --- Validation ---
if [ ! -d "$ADDON_DIR" ]; then
    echo -e "${RED}Error: Directory '$ADDON_DIR' not found.${NC}"
    exit 1
fi

# --- Main Logic ---

if [ "$SKIP_BUMP" = false ]; then
    # 1. Calculate Version
    if [ -n "$BUMP_TYPE" ]; then
        if [[ ! "$BUMP_TYPE" =~ ^(patch|minor|major)$ ]]; then
             echo -e "${RED}Error: Invalid type '$BUMP_TYPE'. Use patch, minor, or major.${NC}"
             exit 1
        fi
        NEW_VERSION=$(calculate_next_version "$BUMP_TYPE")
        if [ "$NEW_VERSION" == "INVALID_VERSION_FORMAT" ]; then
            echo -e "${RED}Error: Current version in package.json is corrupt.${NC}"
            exit 1
        fi
    elif [ -z "$NEW_VERSION" ]; then
        echo -e "${RED}Error: Must provide -t (type) or -v (version).${NC}"
        display_help
        exit 1
    fi

    echo -e "${BLUE}Bumping to version: $NEW_VERSION${NC}"

    # 2. Update package.json
    if [ -f "package.json" ]; then
        sed -i.bak "s/\"version\": \".*\"/\"version\": \"$NEW_VERSION\"/" package.json
        rm package.json.bak
        echo "✔ Updated package.json"
    else
        echo -e "${RED}Error: package.json not found.${NC}"
        exit 1
    fi

    # 3. Update Add-on Config
    CONFIG_FILE="$ADDON_DIR/config.yaml"
    if [ -f "$CONFIG_FILE" ]; then
        sed -i.bak "s/^version: \".*\"/version: \"$NEW_VERSION\"/" "$CONFIG_FILE"
        rm "${CONFIG_FILE}.bak"
        echo "✔ Updated $CONFIG_FILE"
    fi

    # 4. Update Changelog
    CHANGELOG_FILE="$ADDON_DIR/CHANGELOG.md"
    DATE=$(date +%Y-%m-%d)
    
    # Determine what text goes into the changelog
    # If -c was provided, use it (interpreted with echo -e). Otherwise fallback to commit message.
    LOG_TEXT=""
    if [ -n "$CHANGELOG_MESSAGE" ]; then
        LOG_TEXT="$CHANGELOG_MESSAGE"
    else
        LOG_TEXT="${COMMIT_MESSAGE:-Maintenance release.}"
    fi

    if [ ! -f "$CHANGELOG_FILE" ]; then echo "# Changelog" > "$CHANGELOG_FILE"; fi

    # Check if entry already exists to avoid duplicates
    if ! grep -q "## $NEW_VERSION" "$CHANGELOG_FILE"; then
        # Create temp file with new entry
        echo -e "## $NEW_VERSION ($DATE)\n$LOG_TEXT\n" > "$CHANGELOG_FILE.tmp"
        # Append existing content
        cat "$CHANGELOG_FILE" >> "$CHANGELOG_FILE.tmp"
        # Move back
        mv "$CHANGELOG_FILE.tmp" "$CHANGELOG_FILE"
        echo "✔ Updated $CHANGELOG_FILE"
    else
        echo "⚠ Changelog already has entry for $NEW_VERSION, skipping."
    fi
fi

# 5. Generate Icon/Logo if missing (Optional helper)
if command -v ffmpeg &> /dev/null; then
    if [ ! -f "$ADDON_DIR/icon.png" ]; then
        ffmpeg -i packages/frontend/public/icons/icon-maskable-512.webp "$ADDON_DIR/icon.png" -y -v quiet
        echo "✔ Generated icon.png"
    fi
    if [ ! -f "$ADDON_DIR/logo.png" ]; then
        # Just use icon as logo for now if missing
        ffmpeg -i packages/frontend/public/icons/icon-maskable-512.webp "$ADDON_DIR/logo.png" -y -v quiet
        echo "✔ Generated logo.png"
    fi
fi

# 6. Git Commit & Push
FULL_MSG="chore: release v${NEW_VERSION:-update} - ${COMMIT_MESSAGE:-Maintenance}"
echo
echo -e "${YELLOW}Staging files...${NC}"
git add -A
git commit -m "$FULL_MSG"

echo -e "${YELLOW}Target Branch: ${TARGET_BRANCH}${NC}"

if [ "$AUTO_CONFIRM" = false ]; then
    read -r -p "Push to origin/${TARGET_BRANCH}? (Y/n) [Y]: " confirm
    [[ ! "${confirm:-Y}" =~ ^[Yy]$ ]] && exit 0
fi

# FIX: Check if git push actually succeeds before reporting success
if git push origin HEAD:"$TARGET_BRANCH"; then
    echo -e "${GREEN}Success! Pushed changes to $TARGET_BRANCH.${NC}"
else
    echo -e "${RED}Error: Failed to push to $TARGET_BRANCH.${NC}"
    echo -e "${YELLOW}Hint: If the remote contains work you do not have locally, run 'git pull --rebase origin $TARGET_BRANCH' and try pushing again.${NC}"
    exit 1
fi