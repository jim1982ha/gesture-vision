#!/bin/bash
# --- docker-entrypoint.sh --- (complete version) ---

# This script acts as the gateway for the container.
# It detects if running as a Home Assistant Add-on and configures the environment accordingly.

CONFIG_FILE="/app/config.json"
DATA_CONFIG_FILE="/data/config.json"
PLUGINS_DIR="/app/extensions/plugins"
HA_PLUGIN_ID="gesture-vision-plugin-home-assistant"
HA_PLUGIN_REPO="https://github.com/jim1982ha/gesture-vision-plugin-home-assistant.git"
HA_PLUGIN_CONFIG_FILE="$PLUGINS_DIR/$HA_PLUGIN_ID/config.home-assistant.json"

echo "----------------------------------------------------------------"
echo "GestureVision Container Starting..."
echo "----------------------------------------------------------------"

# --- 1. Detect Home Assistant Environment ---
if [ -n "$SUPERVISOR_TOKEN" ]; then
    echo "[HA Mode] Home Assistant Supervisor detected."

    # --- 2. Auto-Install Home Assistant Plugin ---
    if [ ! -d "$PLUGINS_DIR/$HA_PLUGIN_ID" ]; then
        echo "[HA Mode] HA Plugin not found. Auto-installing..."
        mkdir -p "$PLUGINS_DIR"
        git clone --depth 1 "$HA_PLUGIN_REPO" "$PLUGINS_DIR/$HA_PLUGIN_ID"
        
        # Copy frontend assets
        WEBROOT_PLUGIN_DIR="/usr/share/nginx/html/plugins/$HA_PLUGIN_ID"
        if [ -d "$PLUGINS_DIR/$HA_PLUGIN_ID/frontend" ]; then
            mkdir -p "$WEBROOT_PLUGIN_DIR"
            cp -r "$PLUGINS_DIR/$HA_PLUGIN_ID/frontend" "$WEBROOT_PLUGIN_DIR/"
            if [ -d "$PLUGINS_DIR/$HA_PLUGIN_ID/locales" ]; then cp -r "$PLUGINS_DIR/$HA_PLUGIN_ID/locales" "$WEBROOT_PLUGIN_DIR/"; fi
            echo "[HA Mode] Plugin assets deployed."
        fi
    else
        echo "[HA Mode] HA Plugin already installed."
    fi

    # --- 3. Auto-Configure Home Assistant Plugin ---
    echo "[HA Mode] Configuring Plugin with Supervisor Token..."
    cat > "$HA_PLUGIN_CONFIG_FILE" <<EOF
{
  "haUrl": "http://supervisor/core",
  "longLivedAccessToken": "$SUPERVISOR_TOKEN",
  "debug": false
}
EOF
    echo "[HA Mode] $HA_PLUGIN_CONFIG_FILE generated."

    # --- 4. Persistent Configuration Management ---
    # Ensure config.json exists in /data (persistent storage)
    if [ ! -f "$DATA_CONFIG_FILE" ]; then
        echo "[HA Mode] Initializing persistent config in /data..."
        if [ -f "$CONFIG_FILE" ]; then
            cp "$CONFIG_FILE" "$DATA_CONFIG_FILE"
        else
            echo "{}" > "$DATA_CONFIG_FILE"
        fi
    fi

    # --- 5. Apply HA Options to Config ---
    # Read options.json injected by Supervisor
    if [ -f "/data/options.json" ]; then
        echo "[HA Mode] Syncing Add-on Options..."
        
        # Extract specific options using jq
        # 1. MTX ICE Host: Needed for WebRTC to work across networks
        ICE_HOST=$(jq -r '.mtx_ice_host // empty' /data/options.json)
        
        if [ -n "$ICE_HOST" ]; then
            echo "[HA Mode] Setting ICE Host to: $ICE_HOST"
            export MTX_WEBRTC_ADDITIONAL_HOSTS="$ICE_HOST"
        fi
        
        # 2. Log Level (Example of mapping to env var)
        LOG_LEVEL=$(jq -r '.log_level // "info"' /data/options.json)
        export MTX_LOGLEVEL="$LOG_LEVEL"
        
        # Future: You can use jq here to modify $DATA_CONFIG_FILE directly if options map to JSON keys
        # Example: jq --arg val "$VAL" '.someKey = $val' $DATA_CONFIG_FILE > tmp.json && mv tmp.json $DATA_CONFIG_FILE
    fi

    # Symlink the app config location to the persistent data location
    # We do this LAST to ensure the file exists
    if [ ! -L "$CONFIG_FILE" ]; then
        echo "[HA Mode] Linking config.json to /data..."
        rm -f "$CONFIG_FILE"
        ln -s "$DATA_CONFIG_FILE" "$CONFIG_FILE"
    fi

else
    echo "[Standalone Mode] Running in standard Docker environment."
fi

# --- 6. Start Application ---
echo "Starting Application..."
exec "$@"