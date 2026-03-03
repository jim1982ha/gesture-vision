#!/bin/bash
# --- tools/bump_version.sh --- (complete version) ---

if [ -z "$1" ]; then
  echo "Usage: ./tools/bump_version.sh <new_version>"
  exit 1
fi

NEW_VERSION="$1"

# 1. Update package.json
# Using a temporary file to ensure sed works consistently on Linux/macOS
sed -i.bak "s/\"version\": \".*\"/\"version\": \"$NEW_VERSION\"/" package.json
rm package.json.bak

# 2. Update ha-addon/config.yaml
sed -i.bak "s/version: \".*\"/version: \"$NEW_VERSION\"/" ha-addon/config.yaml
rm ha-addon/config.yaml.bak

echo "Bumped version to $NEW_VERSION in package.json and ha-addon/config.yaml"
echo "Note: The Dockerfile uses build args to inherit this, so it does not need changing."