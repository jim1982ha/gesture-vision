#!/bin/bash
# FILE: tools/update_images.sh

# --- Helper Function: Display Help ---
display_help() {
    local script_name
    script_name=$(basename "$0")
    echo "Usage: ./tools/${script_name} [-h|--help]"
    echo
    echo "Saves the production and development Docker images to .tar archive files."
    echo "The image tags are automatically determined from the 'version' in 'package.json'."
    echo
    echo "Workflow:"
    echo "  1. Reads the current version from './package.json'."
    echo "  2. Constructs the image names (e.g., 'gesturevision:<version>' and 'gesturevision-dev:<version>')."
    echo "  3. Saves the production image to './gesturevision_prod.tar'."
    echo "  4. Saves the development image to './gesturevision_dev.tar'."
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

# --- Script Start ---
echo "Starting image saving process..."

# 1. Get the version from package.json
echo "Reading version from package.json..."
APP_VERSION=$(node -p "require('./package.json').version" 2>/dev/null) # Redirect node errors

# Check if version retrieval was successful
if [ -z "$APP_VERSION" ]; then
  echo "Error: Could not read version from package.json. Make sure Node.js is installed and package.json exists." >&2
  exit 1 # Exit if version couldn't be read
fi
echo "Detected App Version: $APP_VERSION"

# 2. Define Production Image details
PROD_IMAGE_REPO="gesturevision"
PROD_IMAGE_TAG="${APP_VERSION}" # Tag is just the version
PROD_IMAGE_NAME="${PROD_IMAGE_REPO}:${PROD_IMAGE_TAG}"
PROD_OUTPUT_FILE="./gesturevision_prod.tar" # Output file in the project root

# 3. Define Development Image details
DEV_IMAGE_REPO="gesturevision-dev"
DEV_IMAGE_TAG="${APP_VERSION}"
DEV_IMAGE_NAME="${DEV_IMAGE_REPO}:${DEV_IMAGE_TAG}"
DEV_OUTPUT_FILE="./gesturevision_dev.tar" # Output file in the project root

# --- Save Production Image ---
echo
echo "--- Processing Production Image ---"
# 4. Check if the production image actually exists locally
if ! docker image inspect "$PROD_IMAGE_NAME" &> /dev/null; then
  echo "Error: Production image '$PROD_IMAGE_NAME' not found locally. Skipping save." >&2
else
  # 5. Run the docker save command for production image
  echo "Saving production image '$PROD_IMAGE_NAME' to '$PROD_OUTPUT_FILE'..."
  docker save "$PROD_IMAGE_NAME" -o "$PROD_OUTPUT_FILE"

  # Check if the save command was successful
  if [ $? -eq 0 ]; then
    echo "Production image saved successfully to '$PROD_OUTPUT_FILE'"
  else
    echo "Error: Failed to save production image '$PROD_IMAGE_NAME'." >&2
  fi
fi

# --- Save Development Image ---
echo
echo "--- Processing Development Image ---"
# 6. Check if the development image actually exists locally
if ! docker image inspect "$DEV_IMAGE_NAME" &> /dev/null; then
  echo "Error: Development image '$DEV_IMAGE_NAME' not found locally. Skipping save." >&2
else
  # 7. Run the docker save command for development image
  echo "Saving development image '$DEV_IMAGE_NAME' to '$DEV_OUTPUT_FILE'..."
  docker save "$DEV_IMAGE_NAME" -o "$DEV_OUTPUT_FILE"

  # Check if the save command was successful
  if [ $? -eq 0 ]; then
    echo "Development image saved successfully to '$DEV_OUTPUT_FILE'"
  else
    echo "Error: Failed to save development image '$DEV_IMAGE_NAME'." >&2
  fi
fi

echo
echo "Image saving process complete."
exit 0