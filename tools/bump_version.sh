#!/bin/bash
# --- tools/bump_version.sh --- (complete version) ---
# Usage: ./tools/bump_version.sh -t patch
#        ./tools/bump_version.sh -v 4.3.0

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
SHOW_HELP=false

# --- Argument Parsing ---
while [[ $# -gt 0 ]]; do
    case $1 in
        -h|--help) SHOW_HELP=true; shift ;;
        -t|--type) BUMP_TYPE="$2"; shift 2 ;;
        -v|--version) NEW_VERSION="$2"; shift 2 ;;
        *) echo "Unknown argument: $1"; exit 1 ;;
    esac
done

if [ "$SHOW_HELP" = true ]; then
    echo -e "${BLUE}GestureVision Version Bumper${NC}"
    echo "Updates package.json, Add-on config, and Changelog without committing."
    echo
    echo "Usage: ./tools/bump_version.sh [options]"
    echo
    echo "Options:"
    echo "  -h, --help               Show this help message"
    echo "  -t, --type <type>        Bump type: patch, minor, major"
    echo "  -v, --version <ver>      Set explicit version (e.g. 1.2.3)"
    echo
    echo "Examples:"
    echo "  ./tools/bump_version.sh -t patch"
    echo "  ./tools/bump_version.sh -v 4.5.0"
    echo
    exit 0
fi

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

# 1. Determine Add-on Directory
if [ ! -d "$ADDON_DIR" ]; then
    echo -e "${RED}Error: Add-on directory '$ADDON_DIR' not found.${NC}"
    exit 1
fi

# 2. Determine Version
if [ -n "$BUMP_TYPE" ]; then
    if [[ ! "$BUMP_TYPE" =~ ^(patch|minor|major)$ ]]; then
        echo -e "${RED}Error: Invalid type. Use patch, minor, or major.${NC}"
        exit 1
    fi
    NEW_VERSION=$(calculate_next_version "$BUMP_TYPE")
    if [ "$NEW_VERSION" == "INVALID_VERSION_FORMAT" ]; then
        echo -e "${RED}Error: Current version in package.json is corrupt. Fix it manually.${NC}"
        exit 1
    fi
elif [ -z "$NEW_VERSION" ]; then
    echo -e "${RED}Error: Must provide -t (type) or -v (version).${NC}"
    echo "Use -h for help."
    exit 1
fi

echo -e "${BLUE}Bumping version to $NEW_VERSION...${NC}"

# 3. Update package.json
if [ -f "package.json" ]; then
    sed -i.bak "s/\"version\": \".*\"/\"version\": \"$NEW_VERSION\"/" package.json
    rm package.json.bak
    echo "✔ Updated package.json"
else
    echo -e "${RED}Error: package.json not found.${NC}"
    exit 1
fi

# 4. Update Add-on Config
CONFIG_FILE="$ADDON_DIR/config.yaml"
if [ -f "$CONFIG_FILE" ]; then
    sed -i.bak "s/^version: \".*\"/version: \"$NEW_VERSION\"/" "$CONFIG_FILE"
    rm "${CONFIG_FILE}.bak"
    echo "✔ Updated $CONFIG_FILE"
else
    echo -e "${YELLOW}⚠ Warning: $CONFIG_FILE not found.${NC}"
fi

# 5. Update Changelog
CHANGELOG_FILE="$ADDON_DIR/CHANGELOG.md"
DATE=$(date +%Y-%m-%d)
DEFAULT_MSG="Maintenance release."

if [ ! -f "$CHANGELOG_FILE" ]; then echo "# Changelog" > "$CHANGELOG_FILE"; fi

# Check if entry already exists to avoid duplicates
if ! grep -q "## $NEW_VERSION" "$CHANGELOG_FILE"; then
    echo -e "## $NEW_VERSION ($DATE)\n- $DEFAULT_MSG\n" > "$CHANGELOG_FILE.tmp"
    cat "$CHANGELOG_FILE" >> "$CHANGELOG_FILE.tmp"
    mv "$CHANGELOG_FILE.tmp" "$CHANGELOG_FILE"
    echo "✔ Updated $CHANGELOG_FILE"
else
    echo "⚠ Changelog already has entry for $NEW_VERSION, skipping."
fi

echo
echo -e "${GREEN}Version bump complete.${NC}"