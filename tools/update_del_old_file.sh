#!/bin/bash
# FILE: tools/update_del_old_file.sh

# --- Helper Function: Display Help ---
display_help() {
    local script_name
    script_name=$(basename "$0")
    echo "Usage: ./tools/${script_name} [-h|--help]"
    echo
    echo "This script is a powerful cleanup tool for the development environment."
    echo "It removes build artifacts, old dependencies, and rebuilds the project from scratch."
    echo
    echo "WARNING: This script uses 'sudo rm -rf' and will permanently delete the following:"
    echo "  - All 'dist', 'dist-*', and 'dev-dist' directories within './packages/'."
    echo "  - The root './dist' directory."
    echo "  - All '*.tsbuildinfo' files."
    echo "  - The root 'node_modules' directory and 'package-lock.json' file."
    echo
    echo "Workflow:"
    echo "  1. Sets file ownership of the project to the current user using 'sudo chown'."
    echo "  2. Deletes all specified build artifacts and old dependency files."
    echo "  3. Runs a clean 'npm install' at the project root."
    echo "  4. Rebuilds the backend TypeScript packages ('npm run build:backend')."
    echo
    echo "Options:"
    echo "  -h, --help    Display this help message and exit."
    echo
}

# --- Argument Parsing ---
if [[ "$1" == "-h" || "$1" == "--help" ]]; then
    display_help
    exit 0
fi

# Navigate to the project root (parent directory of this script)
cd "$(dirname "$0")/.." || exit 1

clear
echo "Setting ownership of project files to current user..."
# Use sudo to change ownership of the entire project directory to the current user.
# This ensures all subsequent commands have the correct permissions.
if [ "$(whoami)" != "root" ]; then
    if sudo -n true 2>/dev/null; then
        sudo chown -R "$(whoami)":"$(whoami)" .
    else
        echo "Please enter your password to set file permissions."
        sudo chown -R "$(whoami)":"$(whoami)" .
    fi
fi

echo "Cleaning up old build artifacts..."
# Use sudo to remove directories that might have been created by root (e.g., from Docker)
sudo rm -rf ./dist
sudo rm -rf ./packages/*/dist
sudo rm -rf ./packages/*/dist-*
sudo rm -rf ./packages/*/dev-dist
sudo find ./packages -name '*.tsbuildinfo' -type f -exec rm -f {} +
sudo find . -name '*.tsbuildinfo' -type f -exec rm -f {} +


# Clean up root node_modules and package-lock.json to ensure a fresh install
echo "Removing root node_modules and package-lock.json..."
sudo rm -rf node_modules
sudo rm -f package-lock.json

echo "Running a clean npm install..."
# Run npm install as the current user, NOT with sudo
npm install

echo "Building all TypeScript packages..."
npm run build:backend

echo "Cleanup and rebuild complete."