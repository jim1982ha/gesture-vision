#!/bin/bash
# --- tools/bump_version.sh --- (complete version) ---

if [ -z "$1" ]; then
  echo "Usage: ./tools/bump_version.sh <new_version>"
  echo "Example: ./tools/bump_version.sh 4.2.0"
  exit 1
fi

NEW_VERSION="$1"

# 1. Update package.json
# Using temp file for cross-platform sed compatibility
sed -i.bak "s/\"version\": \".*\"/\"version\": \"$NEW_VERSION\"/" package.json
rm package.json.bak

# 2. Update ha-addon/config.yaml
sed -i.bak "s/^version: \".*\"/version: \"$NEW_VERSION\"/" ha-addon/config.yaml
rm ha-addon/config.yaml.bak

echo "✅ Version bumped to $NEW_VERSION"
echo "   - package.json updated"
echo "   - ha-addon/config.yaml updated"
echo "   - Dockerfile uses build args (no update needed)"