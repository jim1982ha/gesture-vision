#!/bin/bash
# --- tools/release.sh --- (complete version) ---
# Usage: ./tools/release.sh -t patch -m "Description"

# Navigate to project root
cd "$(dirname "$0")/.." || exit 1

# --- Colors ---
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

# --- Defaults ---
BUMP_TYPE=""
NEW_VERSION=""
COMMIT_MESSAGE=""
AUTO_CONFIRM=false
SKIP_BUMP=false

# --- Argument Parsing ---
while [[ $# -gt 0 ]]; do
    case $1 in
        -t|--type) BUMP_TYPE="$2"; shift 2 ;;
        -v|--version) NEW_VERSION="$2"; shift 2 ;;
        -m|--message) COMMIT_MESSAGE="$2"; shift 2 ;;
        -y|--yes) AUTO_CONFIRM=true; shift ;;
        -n|--no-bump) SKIP_BUMP=true; shift ;;
        *) echo "Unknown argument: $1"; exit 1 ;;
    esac
done

# --- Functions ---
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

# --- Main Logic ---

if [ "$SKIP_BUMP" = false ]; then
    if [ -n "$BUMP_TYPE" ]; then
        NEW_VERSION=$(calculate_next_version "$BUMP_TYPE")
    elif [ -z "$NEW_VERSION" ]; then
        echo -e "${RED}Error: Must provide -t (type) or -v (version).${NC}"
        exit 1
    fi
    echo -e "${BLUE}Bumping to version: $NEW_VERSION${NC}"
    
    # 1. Update package.json
    sed -i.bak "s/\"version\": \".*\"/\"version\": \"$NEW_VERSION\"/" package.json
    rm package.json.bak
    echo "✔ Updated package.json"

    # 2. Update Add-on Config
    ADDON_DIR=""
    [ -d "gesturevision" ] && ADDON_DIR="gesturevision"
    [ -d "ha-addon" ] && ADDON_DIR="ha-addon"

    if [ -n "$ADDON_DIR" ]; then
        CONFIG_FILE="$ADDON_DIR/config.yaml"
        if [ -f "$CONFIG_FILE" ]; then
            sed -i.bak "s/^version: \".*\"/version: \"$NEW_VERSION\"/" "$CONFIG_FILE"
            rm "${CONFIG_FILE}.bak"
            echo "✔ Updated $CONFIG_FILE"
        fi

        # 3. Update Changelog with Commit Message
        CHANGELOG_FILE="$ADDON_DIR/CHANGELOG.md"
        DATE=$(date +%Y-%m-%d)
        DESC=${COMMIT_MESSAGE:-"Maintenance release."}
        
        if [ ! -f "$CHANGELOG_FILE" ]; then echo "# Changelog" > "$CHANGELOG_FILE"; fi
        
        # Prepend new entry
        echo -e "## $NEW_VERSION ($DATE)\n- $DESC\n" > "$CHANGELOG_FILE.tmp"
        cat "$CHANGELOG_FILE" >> "$CHANGELOG_FILE.tmp"
        mv "$CHANGELOG_FILE.tmp" "$CHANGELOG_FILE"
        echo "✔ Updated $CHANGELOG_FILE with message: $DESC"
    fi
fi

# 4. Git Operations
FULL_MSG="chore: release v$NEW_VERSION - ${COMMIT_MESSAGE:-Maintenance}"
echo
echo -e "${YELLOW}Staging files...${NC}"
git add -A
git commit -m "$FULL_MSG"
current_branch=$(git symbolic-ref --short HEAD)
git push origin "$current_branch"

echo -e "${GREEN}Success! v$NEW_VERSION pushed.${NC}"