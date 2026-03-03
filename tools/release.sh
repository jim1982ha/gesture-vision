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
ADDON_DIR="ha-addon"
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
    
    # Validation: Ensure version is numeric X.Y.Z
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

# --- Main Logic ---

if [ ! -d "$ADDON_DIR" ]; then
    echo -e "${RED}Error: Add-on directory '$ADDON_DIR' not found.${NC}"
    exit 1
fi

if [ "$SKIP_BUMP" = false ]; then
    if [ -n "$BUMP_TYPE" ]; then
        NEW_VERSION=$(calculate_next_version "$BUMP_TYPE")
        if [ "$NEW_VERSION" == "INVALID_VERSION_FORMAT" ]; then
            echo -e "${RED}Error: Current version in package.json is corrupt. Please fix it manually to X.Y.Z${NC}"
            exit 1
        fi
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
    CONFIG_FILE="$ADDON_DIR/config.yaml"
    if [ -f "$CONFIG_FILE" ]; then
        sed -i.bak "s/^version: \".*\"/version: \"$NEW_VERSION\"/" "$CONFIG_FILE"
        rm "${CONFIG_FILE}.bak"
        echo "✔ Updated $CONFIG_FILE"
    fi

    # 3. Update Changelog
    CHANGELOG_FILE="$ADDON_DIR/CHANGELOG.md"
    DATE=$(date +%Y-%m-%d)
    DESC=${COMMIT_MESSAGE:-"Maintenance release."}
    
    if [ ! -f "$CHANGELOG_FILE" ]; then echo "# Changelog" > "$CHANGELOG_FILE"; fi
    
    # Check if entry already exists to avoid duplicates if re-running
    if ! grep -q "## $NEW_VERSION" "$CHANGELOG_FILE"; then
        echo -e "## $NEW_VERSION ($DATE)\n- $DESC\n" > "$CHANGELOG_FILE.tmp"
        cat "$CHANGELOG_FILE" >> "$CHANGELOG_FILE.tmp"
        mv "$CHANGELOG_FILE.tmp" "$CHANGELOG_FILE"
        echo "✔ Updated $CHANGELOG_FILE with message: $DESC"
    else
        echo "⚠ Changelog already has entry for $NEW_VERSION, skipping."
    fi
fi

# 4. Icon Generation Check
if [ ! -f "$ADDON_DIR/icon.png" ]; then
    echo -e "${BLUE}Generating Add-on icon.png from source...${NC}"
    if command -v ffmpeg &> /dev/null; then
        ffmpeg -i packages/frontend/public/icons/icon-maskable-512.webp "$ADDON_DIR/icon.png" -y -v quiet
        echo "✔ Generated $ADDON_DIR/icon.png"
    else
        echo -e "${YELLOW}⚠ ffmpeg not found. Cannot generate icon.png automatically.${NC}"
        echo "  Please manually save a PNG icon to $ADDON_DIR/icon.png for the HA Store."
    fi
fi

# 5. Git Operations
FULL_MSG="chore: release v${NEW_VERSION:-update} - ${COMMIT_MESSAGE:-Maintenance}"
echo
echo -e "${YELLOW}Staging files...${NC}"
git add -A
git commit -m "$FULL_MSG"
current_branch=$(git symbolic-ref --short HEAD)

if [ "$AUTO_CONFIRM" = false ]; then
    read -r -p "Push to origin/$current_branch? (Y/n) [Y]: " confirm
    confirm=${confirm:-Y}
    if [[ ! "$confirm" =~ ^[Yy]$ ]]; then
        echo "Aborted push."
        exit 0
    fi
fi

git push origin "$current_branch"
echo -e "${GREEN}Success! v${NEW_VERSION:-update} pushed.${NC}"