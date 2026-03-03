#!/bin/bash
# --- tools/bump_version.sh --- (complete version) ---
# Usage: ./tools/bump_version.sh 4.1.0

if [ -z "$1" ]; then
  echo "Usage: ./tools/bump_version.sh <new_version>"
  exit 1
fi

NEW_VERSION="$1"
echo "Bumping version to $NEW_VERSION..."

# 1. Update package.json
# We use a temp file to ensure compatibility between MacOS (BSD sed) and Linux (GNU sed)
sed -i.bak "s/\"version\": \".*\"/\"version\": \"$NEW_VERSION\"/" package.json
rm package.json.bak
echo "✔ Updated package.json"

# 2. Update ha-addon/config.yaml
# Matches: version: "X.X.X"
sed -i.bak "s/^version: \".*\"/version: \"$NEW_VERSION\"/" ha-addon/config.yaml
rm ha-addon/config.yaml.bak
echo "✔ Updated ha-addon/config.yaml"

echo "------------------------------------------------"
echo "Done! Commit these changes and push to GitHub."
echo "Home Assistant will pick up the new version from config.yaml."