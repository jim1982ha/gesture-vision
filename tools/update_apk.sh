#!/bin/bash
# FILE: tools/update_apk.sh
# Prepares web assets and syncs with Capacitor for Android APK build.

# Navigate to the project root (parent directory of this script)
cd "$(dirname "$0")/.." || exit 1

# --- Configuration ---
APP_NAME_PLACEHOLDER="YourAppName"
APP_ID_PLACEHOLDER="com.example.yourappid"
FRONTEND_DIR="packages/frontend" # This path is now correct relative to project root
APP_VERSION=$(node -p "require('./package.json').version" 2>/dev/null || echo "unknown")
SCRIPT_CWD=$(pwd)
RESOURCES_DIR="${SCRIPT_CWD}/${FRONTEND_DIR}/resources"

# --- Helper Functions ---
confirm_action() {
    local prompt_message="$1"
    local default_choice="${2:-Y}"
    local choice
    read -p "$prompt_message [${default_choice}]: " choice
    choice=${choice:-$default_choice}
    [[ "$choice" =~ ^[Yy]$ ]]
}

display_help() {
    local script_name
    script_name=$(basename "$0")
    echo "Usage: ./tools/${script_name} [options]"
    echo
    echo "This script prepares web assets (from '${FRONTEND_DIR}/') and syncs them"
    echo "with the Capacitor Android project (expected in '${FRONTEND_DIR}/android/')"
    echo "to facilitate building an Android APK or App Bundle."
    echo
    echo "Options:"
    echo "  -h, --help          Display this help message and exit."
    echo "  -y, --yes           Bypass interactive confirmation prompts (uses defaults or 'no' for safety)."
    echo "  --no-assets         Skip the native asset generation step (icons/splash screens)."
    echo
    echo "Workflow:"
    echo "  1. Checks prerequisites (Node, npm, npx)."
    echo "  2. IMPORTANT: ENSURE you have a '${FRONTEND_DIR}/capacitor.config.json' file correctly configured"
    echo "     with YOUR 'appId', 'appName', and 'server.allowNavigation' settings."
    echo "  3. Ensures the Android platform is added to the Capacitor project within '${FRONTEND_DIR}/'."
    echo "     If '${FRONTEND_DIR}/capacitor.config.json' doesn't exist when adding platform,"
    echo "     Capacitor init might be called with placeholders."
    echo "     YOU MUST HAVE YOUR OWN CONFIG FOR A PROPER BUILD."
    echo "  4. Optionally regenerates native Android icons and splash screens."
    echo "     Source images are expected in '${RESOURCES_DIR}/'."
    echo "  5. Builds the web assets in 'apk' mode (npm run build:apk, which cds into '${FRONTEND_DIR}')."
    echo "  6. Syncs the '${FRONTEND_DIR}/dist/' folder to the Android native project (runs capacitor sync from '${FRONTEND_DIR}/')."
    echo
    echo "After running, you can open the project in Android Studio:"
    echo "  (cd ${FRONTEND_DIR} && npx capacitor open android)"
    echo
}

# --- Argument Parsing ---
AUTO_YES_FLAG=false
SKIP_NATIVE_ASSETS=false

while [[ $# -gt 0 ]]; do
    key="$1"
    case $key in
        -h|--help) display_help; exit 0 ;;
        -y|--yes) AUTO_YES_FLAG=true; shift ;;
        --no-assets) SKIP_NATIVE_ASSETS=true; shift ;;
        *) echo "Unknown option: $1" >&2; display_help; exit 1 ;;
    esac
done


# --- Start Script ---
clear
echo "================================================================"
echo "== GestureVision APK Asset Preparation Script (Packages Mode) =="
echo "== App Version: $APP_VERSION =="
echo "================================================================"
echo
echo "IMPORTANT: Ensure '${FRONTEND_DIR}/capacitor.config.json' is correctly configured."
echo

# --- Prerequisites Check ---
echo "[Step 1/6] Checking prerequisites..."
if ! command -v node &> /dev/null; then echo "ERROR: Node.js is not installed."; exit 1; fi
if ! command -v npm &> /dev/null; then echo "ERROR: npm is not installed."; exit 1; fi
if ! command -v npx &> /dev/null; then echo "ERROR: npx is not installed."; exit 1; fi
if [ ! -f "${SCRIPT_CWD}/package.json" ]; then echo "ERROR: package.json not found. Run from project root."; exit 1; fi
if [ ! -d "${SCRIPT_CWD}/${FRONTEND_DIR}" ]; then echo "ERROR: Frontend directory '${FRONTEND_DIR}' not found."; exit 1; fi

# --- MODIFIED: Change directory for Capacitor operations ---
echo "Changing directory to '${FRONTEND_DIR}' for Capacitor operations..."
cd "${SCRIPT_CWD}/${FRONTEND_DIR}" || { echo "ERROR: Failed to cd into ${FRONTEND_DIR}. Aborting."; exit 1; }

if [ ! -f "capacitor.config.json" ]; then
    echo "ERROR: 'capacitor.config.json' NOT FOUND in '${FRONTEND_DIR}/'."
    echo "       Please create it (e.g., from 'capacitor.config.example.json')"
    echo "       and configure it with your specific App ID and allowNavigation settings."
    if [ "$AUTO_YES_FLAG" = true ]; then
        echo "       Attempting 'npx capacitor init' with placeholders due to -y flag. YOU MUST EDIT THE GENERATED FILE."
        npx capacitor init "$APP_NAME_PLACEHOLDER" "$APP_ID_PLACEHOLDER" --web-dir "dist"
        if [ $? -ne 0 ]; then echo "ERROR: Failed to initialize Capacitor in '${FRONTEND_DIR}'. Aborting."; cd "$SCRIPT_CWD"; exit 1; fi
    else
        if confirm_action "Initialize Capacitor in '${FRONTEND_DIR}' using placeholders? (Y/n)" "N"; then
            echo "INFO: Running 'npx capacitor init' with placeholders. You MUST edit capacitor.config.json afterwards."
            npx capacitor init "$APP_NAME_PLACEHOLDER" "$APP_ID_PLACEHOLDER" --web-dir "dist"
            if [ $? -ne 0 ]; then echo "ERROR: Failed to initialize Capacitor in '${FRONTEND_DIR}'. Aborting."; cd "$SCRIPT_CWD"; exit 1; fi
            echo "IMPORTANT: 'capacitor.config.json' created with placeholders. Please edit it now."
            if ! $AUTO_YES_FLAG; then read -p "Press Enter to continue after editing, or Ctrl+C to abort..."; fi
        else
            echo "ERROR: capacitor.config.json is required. Please create it. Aborting."; cd "$SCRIPT_CWD"; exit 1;
        fi
    fi
else
    echo "INFO: 'capacitor.config.json' found in '${FRONTEND_DIR}/'."
fi
echo "Prerequisites check passed."
echo

# --- Add Android Platform ---
echo "[Step 2/6] Checking Android platform (in '${FRONTEND_DIR}/')..."
if [ ! -d "android" ]; then # Path relative to current dir (packages/frontend)
    echo "INFO: Android platform not found."
    if [ "$AUTO_YES_FLAG" = true ] || confirm_action "Add Android platform? (Y/n)"; then
        npx capacitor add android
        if [ $? -ne 0 ]; then echo "ERROR: Failed to add Android platform. Aborting."; cd "$SCRIPT_CWD"; exit 1; fi
    else
        echo "ERROR: Android platform required. Aborting."; cd "$SCRIPT_CWD"; exit 1;
    fi
else
    echo "Android platform already exists."
fi
echo

# --- Regenerate Native Assets (Icons/Splash) ---
echo "[Step 3/6] Native Asset Generation (Icons & Splash Screens)..."
REGEN_ASSETS=false
if [ "$SKIP_NATIVE_ASSETS" = true ]; then
    echo "Skipping native asset generation due to --no-assets flag."
else
    # Check for @capacitor/assets in the root project's node_modules
    if npm list --depth=0 --prefix "${SCRIPT_CWD}" @capacitor/assets > /dev/null 2>&1; then
        echo "INFO: @capacitor/assets tool is installed in project root."
        DEFAULT_ASSET_CHOICE="N"
        if [ "$AUTO_YES_FLAG" = true ]; then DEFAULT_ASSET_CHOICE="Y"; fi
        
        # Resources path is now relative to packages/frontend (current CWD)
        if confirm_action "Regenerate native icons and splash screens (uses 'resources/icon.png' & 'resources/splash.png')? (Y/n)" "$DEFAULT_ASSET_CHOICE"; then
            REGEN_ASSETS=true
        fi
    else
        echo "INFO: @capacitor/assets tool NOT installed in project root. Skipping native asset regeneration."
        echo "      To auto-generate, run from project root: npm install -D @capacitor/assets"
        echo "      Ensure 'icon.png' (min 1024x1024) and 'splash.png' (min 2732x2732) are in '${FRONTEND_DIR}/resources/'."
    fi
fi

if [ "$REGEN_ASSETS" = true ]; then
    MASTER_ICON_PATH="resources/icon.png" # Relative to current dir (packages/frontend)
    MASTER_SPLASH_PATH="resources/splash.png"

    if [ ! -d "resources" ]; then
        echo "ERROR: 'resources/' directory not found in '${FRONTEND_DIR}'. It's required by @capacitor/assets."
        echo "Please create it and add 'icon.png' and 'splash.png'."
        REGEN_ASSETS=false 
    fi

    if [ "$REGEN_ASSETS" = true ]; then 
        if [ ! -f "$MASTER_ICON_PATH" ]; then
            echo "WARNING: Master icon '$MASTER_ICON_PATH' not found. Icon generation may fail or use defaults."
        fi
        if [ ! -f "$MASTER_SPLASH_PATH" ]; then
            echo "WARNING: Master splash screen '$MASTER_SPLASH_PATH' not found. Splash generation may fail or use defaults."
        fi
        
        echo "Running: npx capacitor-assets generate --android (from '${FRONTEND_DIR}')"
        npx capacitor-assets generate --android # capacitor-assets should use resources/ within current dir
        if [ $? -ne 0 ]; then
            echo "WARNING: capacitor-assets generation command failed. Native icons/splash screens might not be updated."
        else
            echo "Native icons and splash screens generation command executed."
        fi
    fi
else
    if [ "$SKIP_NATIVE_ASSETS" = false ]; then
      echo "Skipping native asset regeneration as per user choice or missing tool."
    fi
fi
echo

# --- Build Web Assets for APK ---
# The `npm run build:apk` script itself already `cd`s into packages/frontend
echo "[Step 4/6] Building web assets for APK (mode: apk)..."
echo "Running: npm run build:apk (from project root: ${SCRIPT_CWD})"
(cd "${SCRIPT_CWD}" && npm run build:apk) # Run from project root
if [ $? -ne 0 ]; then echo "ERROR: 'npm run build:apk' failed. Aborting."; cd "$SCRIPT_CWD"; exit 1; fi
echo "Web assets for APK built successfully (output to ${FRONTEND_DIR}/dist/)."
echo

# --- Sync with Capacitor ---
# Already in packages/frontend directory
echo "[Step 5/6] Syncing web assets (from dist/) to Android platform..."
echo "Running: npx capacitor sync android (from '${FRONTEND_DIR}')"
npx capacitor sync android
if [ $? -ne 0 ]; then
    echo "ERROR: 'npx capacitor sync android' failed. Please check the output."
else
    echo "Capacitor sync completed successfully. Web assets copied to Android project."
fi
echo

# --- Return to original directory ---
cd "$SCRIPT_CWD" || { echo "ERROR: Failed to cd back to ${SCRIPT_CWD}."; exit 1; }

# --- Final Instructions ---
echo "[Step 6/6] APK Preparation Complete!"
echo "--------------------------------------------------"
echo "Next Steps:"
echo "1. Open the Android project in Android Studio (from '${FRONTEND_DIR}/'):"
echo "   cd ${FRONTEND_DIR} && npx capacitor open android"
echo "   (or use the command from root: npm run cap:open:android)"
echo "2. Build the APK/AAB from Android Studio (Build > Build Bundle(s) / APK(s))."
echo "--------------------------------------------------"
echo

exit 0