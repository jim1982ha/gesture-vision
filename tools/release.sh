#!/bin/bash
# --- tools/release.sh --- (complete version) ---
# Usage: ./tools/release.sh -t patch -m "Description"

cd "$(dirname "$0")/.." || exit 1

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

ADDON_DIR="ha-addon"
BUMP_TYPE=""
NEW_VERSION=""
COMMIT_MESSAGE=""
AUTO_CONFIRM=false
SKIP_BUMP=false
SHOW_HELP=false

while [[ $# -gt 0 ]]; do
    case $1 in
        -h|--help) SHOW_HELP=true; shift ;;
        -t|--type) BUMP_TYPE="$2"; shift 2 ;;
        -v|--version) NEW_VERSION="$2"; shift 2 ;;
        -m|--message) COMMIT_MESSAGE="$2"; shift 2 ;;
        -y|--yes) AUTO_CONFIRM=true; shift ;;
        -n|--no-bump) SKIP_BUMP=true; shift ;;
        *) echo "Unknown argument: $1"; exit 1 ;;
    esac
done

if [ "$SHOW_HELP" = true ]; then
    echo "Usage: ./tools/release.sh [options]"
    exit 0
fi

get_current_version() {
    if [ -f "package.json" ]; then
        grep '"version":' package.json | head -1 | awk -F: '{ print $2 }' | sed 's/[",]//g' | tr -d '[[:space:]]'
    else echo "0.0.0"; fi
}

calculate_next_version() {
    local type=$1
    local v=$(get_current_version)
    if [[ ! "$v" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then echo "INVALID_VERSION_FORMAT"; return; fi
    local major=$(echo $v | cut -d. -f1); local minor=$(echo $v | cut -d. -f2); local patch=$(echo $v | cut -d. -f3)
    case $type in
        major) major=$((major + 1)); minor=0; patch=0 ;;
        minor) minor=$((minor + 1)); patch=0 ;;
        patch) patch=$((patch + 1)) ;;
    esac
    echo "${major}.${minor}.${patch}"
}

if [ ! -d "$ADDON_DIR" ]; then echo -e "${RED}Error: $ADDON_DIR not found.${NC}"; exit 1; fi

if [ "$SKIP_BUMP" = false ]; then
    if [ -n "$BUMP_TYPE" ]; then
        NEW_VERSION=$(calculate_next_version "$BUMP_TYPE")
        if [ "$NEW_VERSION" == "INVALID_VERSION_FORMAT" ]; then echo -e "${RED}Invalid version in package.json.${NC}"; exit 1; fi
    elif [ -z "$NEW_VERSION" ]; then
        echo -e "${RED}Error: Must provide -t or -v.${NC}"; exit 1
    fi
    echo -e "${BLUE}Bumping to version: $NEW_VERSION${NC}"
    
    sed -i.bak "s/\"version\": \".*\"/\"version\": \"$NEW_VERSION\"/" package.json
    rm package.json.bak
    echo "✔ Updated package.json"

    CONFIG_FILE="$ADDON_DIR/config.yaml"
    if [ -f "$CONFIG_FILE" ]; then
        sed -i.bak "s/^version: \".*\"/version: \"$NEW_VERSION\"/" "$CONFIG_FILE"
        rm "${CONFIG_FILE}.bak"
        echo "✔ Updated $CONFIG_FILE"
    fi

    CHANGELOG_FILE="$ADDON_DIR/CHANGELOG.md"
    DATE=$(date +%Y-%m-%d)
    DESC=${COMMIT_MESSAGE:-"Maintenance release."}
    if [ ! -f "$CHANGELOG_FILE" ]; then echo "# Changelog" > "$CHANGELOG_FILE"; fi
    if ! grep -q "## $NEW_VERSION" "$CHANGELOG_FILE"; then
        echo -e "## $NEW_VERSION ($DATE)\n- $DESC\n" > "$CHANGELOG_FILE.tmp"
        cat "$CHANGELOG_FILE" >> "$CHANGELOG_FILE.tmp"
        mv "$CHANGELOG_FILE.tmp" "$CHANGELOG_FILE"
        echo "✔ Updated $CHANGELOG_FILE"
    fi
fi

# Icon/Logo Gen
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

FULL_MSG="chore: release v${NEW_VERSION:-update} - ${COMMIT_MESSAGE:-Maintenance}"
echo; echo -e "${YELLOW}Staging files...${NC}"
git add -A
git commit -m "$FULL_MSG"
current_branch=$(git symbolic-ref --short HEAD)

if [ "$AUTO_CONFIRM" = false ]; then
    read -r -p "Push to $current_branch? (Y/n) [Y]: " confirm
    [[ ! "${confirm:-Y}" =~ ^[Yy]$ ]] && exit 0
fi

git push origin "$current_branch"
echo -e "${GREEN}Success! v${NEW_VERSION:-update} pushed.${NC}"