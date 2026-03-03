#!/bin/bash
# --- tools/release.sh --- (complete version) ---
# Usage: ./tools/release.sh 4.2.2

# Navigate to project root
cd "$(dirname "$0")/.." || exit 1

# --- Colors ---
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

if [ -z "$1" ]; then
  echo "Usage: ./tools/release.sh <new_version>"
  exit 1
fi

NEW_VERSION="$1"
echo -e "${BLUE}Preparing release $NEW_VERSION...${NC}"

# 1. Update package.json
if [ -f "package.json" ]; then
    sed -i.bak "s/\"version\": \".*\"/\"version\": \"$NEW_VERSION\"/" package.json
    rm package.json.bak
    echo "✔ Updated package.json"
fi

# 2. Find and Update Add-on Config
ADDON_DIR=""
if [ -d "gesturevision" ]; then
    ADDON_DIR="gesturevision"
elif [ -d "ha-addon" ]; then
    ADDON_DIR="ha-addon"
fi

if [ -n "$ADDON_DIR" ]; then
    # Update config.yaml
    CONFIG_FILE="$ADDON_DIR/config.yaml"
    if [ -f "$CONFIG_FILE" ]; then
        sed -i.bak "s/^version: \".*\"/version: \"$NEW_VERSION\"/" "$CONFIG_FILE"
        rm "$CONFIG_FILE.bak"
        echo "✔ Updated $CONFIG_FILE"
    fi

    # Update CHANGELOG.md (Prepend new version)
    CHANGELOG_FILE="$ADDON_DIR/CHANGELOG.md"
    DATE=$(date +%Y-%m-%d)
    
    # Check if changelog exists, if not create it
    if [ ! -f "$CHANGELOG_FILE" ]; then
        echo "# Changelog" > "$CHANGELOG_FILE"
    fi
    
    # Create temp file with new entry
    echo -e "## $NEW_VERSION ($DATE)\n- Maintenance release.\n" > "$CHANGELOG_FILE.tmp"
    cat "$CHANGELOG_FILE" >> "$CHANGELOG_FILE.tmp"
    mv "$CHANGELOG_FILE.tmp" "$CHANGELOG_FILE"
    echo "✔ Updated $CHANGELOG_FILE"
else
    echo -e "${RED}Error: Could not find 'gesturevision' or 'ha-addon' directory.${NC}"
    exit 1
fi

# 3. Git Operations
echo
echo -e "${YELLOW}Staging and Pushing...${NC}"
git add -A
git commit -m "chore: release v$NEW_VERSION"
current_branch=$(git symbolic-ref --short HEAD)
git push origin "$current_branch"

echo
echo -e "${GREEN}Success! v$NEW_VERSION pushed.${NC}"
echo "Go to Home Assistant -> Add-on Store -> Check for updates."