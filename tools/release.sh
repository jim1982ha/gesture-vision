#!/bin/bash
# --- tools/release.sh --- (complete version) ---

# Navigate to project root
cd "$(dirname "$0")/.." || exit 1

# --- Colors ---
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# --- Variables ---
CURRENT_VERSION=""
NEW_VERSION=""
COMMIT_MESSAGE=""
SKIP_BUMP=false
AUTO_CONFIRM=false
BUMP_TYPE="" # patch, minor, major

# --- Helper Functions ---

display_help() {
    echo -e "${BLUE}GestureVision Release Helper${NC}"
    echo "Automates version bumping, git staging, committing, and pushing."
    echo
    echo -e "${YELLOW}Usage:${NC} ./tools/release.sh [options]"
    echo
    echo "Options:"
    echo "  -h, --help               Show this help message."
    echo "  -v, --version <version>  Explicitly set the new version (e.g., 4.2.0)."
    echo "  -t, --type <type>        Auto-bump type: 'patch', 'minor', or 'major'."
    echo "  -m, --message <msg>      Specify the commit message."
    echo "  -n, --no-bump            Skip version bumping (only commit and push)."
    echo "  -y, --yes                Skip confirmation prompts (requires -m if not bumping, or defaults apply)."
    echo
    echo "Examples:"
    echo "  ./tools/release.sh                               # Interactive mode"
    echo "  ./tools/release.sh -t patch -m \"Fix bugs\" -y     # Auto-increment patch, commit, push"
    echo "  ./tools/release.sh -v 5.0.0 -m \"Major release\"   # Set specific version"
    echo "  ./tools/release.sh --no-bump -m \"Update docs\"    # Just commit and push"
}

get_current_version() {
    if [ -f "package.json" ]; then
        # Try using node if available (more reliable), else grep
        if command -v node &> /dev/null; then
            CURRENT_VERSION=$(node -p "require('./package.json').version")
        else
            CURRENT_VERSION=$(grep '"version":' package.json | head -1 | awk -F: '{ print $2 }' | sed 's/[",]//g' | tr -d '[[:space:]]')
        fi
    else
        echo -e "${RED}Error: package.json not found.${NC}"
        exit 1
    fi
}

calculate_next_version() {
    local type=$1
    local v=$CURRENT_VERSION
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

update_files() {
    local ver=$1
    echo -e "${BLUE}Updating files to version $ver...${NC}"

    # Update package.json
    sed -i.bak "s/\"version\": \".*\"/\"version\": \"$ver\"/" package.json
    rm package.json.bak
    echo "  ✔ package.json updated"

    # Update ha-addon/config.yaml
    if [ -f "ha-addon/config.yaml" ]; then
        sed -i.bak "s/^version: \".*\"/version: \"$ver\"/" ha-addon/config.yaml
        rm ha-addon/config.yaml.bak
        echo "  ✔ ha-addon/config.yaml updated"
    else
        echo -e "  ${YELLOW}⚠ ha-addon/config.yaml not found, skipping.${NC}"
    fi
}

# --- Argument Parsing ---
while [[ $# -gt 0 ]]; do
    case $1 in
        -h|--help) display_help; exit 0 ;;
        -v|--version) NEW_VERSION="$2"; shift 2 ;;
        -t|--type) BUMP_TYPE="$2"; shift 2 ;;
        -m|--message) COMMIT_MESSAGE="$2"; shift 2 ;;
        -n|--no-bump) SKIP_BUMP=true; shift ;;
        -y|--yes) AUTO_CONFIRM=true; shift ;;
        *) echo -e "${RED}Unknown argument: $1${NC}"; display_help; exit 1 ;;
    esac
done

# --- Main Logic ---

get_current_version
echo -e "Current Version: ${GREEN}$CURRENT_VERSION${NC}"

# 1. Determine New Version
if [ "$SKIP_BUMP" = false ]; then
    if [ -n "$NEW_VERSION" ]; then
        echo -e "Target Version:  ${BLUE}$NEW_VERSION${NC}"
    elif [ -n "$BUMP_TYPE" ]; then
        if [[ ! "$BUMP_TYPE" =~ ^(patch|minor|major)$ ]]; then
            echo -e "${RED}Error: Invalid bump type '$BUMP_TYPE'. Use patch, minor, or major.${NC}"
            exit 1
        fi
        NEW_VERSION=$(calculate_next_version $BUMP_TYPE)
        echo -e "Target Version:  ${BLUE}$NEW_VERSION${NC} (Auto-calculated from $BUMP_TYPE)"
    else
        # Interactive Prompt
        echo "Select bump type:"
        echo "  1) Patch ($(calculate_next_version patch))"
        echo "  2) Minor ($(calculate_next_version minor))"
        echo "  3) Major ($(calculate_next_version major))"
        echo "  4) Manual Input"
        echo "  5) Skip Bump"
        read -r -p "Choice [1]: " choice
        choice=${choice:-1}

        case $choice in
            1) NEW_VERSION=$(calculate_next_version patch) ;;
            2) NEW_VERSION=$(calculate_next_version minor) ;;
            3) NEW_VERSION=$(calculate_next_version major) ;;
            4) read -r -p "Enter version: " NEW_VERSION ;;
            5) SKIP_BUMP=true ;;
            *) echo -e "${RED}Invalid choice.${NC}"; exit 1 ;;
        esac
    fi
fi

# 2. Update Files (if bumping)
if [ "$SKIP_BUMP" = false ] && [ -n "$NEW_VERSION" ]; then
    update_files "$NEW_VERSION"
    # Auto-generate default commit message if missing
    if [ -z "$COMMIT_MESSAGE" ]; then
        COMMIT_MESSAGE="chore: bump version to $NEW_VERSION"
    fi
fi

# 3. Git Operations
echo
echo -e "${BLUE}Preparing Git Operations...${NC}"

# Check for changes
if [ -z "$(git status --porcelain)" ]; then 
  echo -e "${YELLOW}No changes to commit.${NC}"
  # If we just bumped versions, there SHOULD be changes.
  if [ "$SKIP_BUMP" = false ]; then
      echo -e "${RED}Something went wrong, version files were not modified?${NC}"
      exit 1
  fi
  exit 0
fi

# Interactive Message Prompt
if [ -z "$COMMIT_MESSAGE" ]; then
    read -r -p "Enter commit message: " input_msg
    if [ -z "$input_msg" ]; then
        echo -e "${RED}Commit message required.${NC}"
        exit 1
    fi
    COMMIT_MESSAGE="$input_msg"
fi

echo -e "Commit Message:  ${YELLOW}$COMMIT_MESSAGE${NC}"

# Final Confirmation
if [ "$AUTO_CONFIRM" = false ]; then
    read -r -p "Proceed with Stage, Commit, and Push? (Y/n) [Y]: " confirm
    confirm=${confirm:-Y}
    if [[ ! "$confirm" =~ ^[Yy]$ ]]; then
        echo "Aborted."
        exit 0
    fi
fi

# Execute
echo
echo "1. Staging files..."
git add -A

echo "2. Committing..."
git commit -m "$COMMIT_MESSAGE"

echo "3. Pushing to origin..."
current_branch=$(git symbolic-ref --short HEAD)
git push origin "$current_branch"

echo
echo -e "${GREEN}Success! Code pushed to branch '$current_branch'.${NC}"
if [ "$SKIP_BUMP" = false ]; then
    echo -e "${GREEN}Version is now $NEW_VERSION.${NC}"
fi