#!/bin/bash
# --- ha-addon/docker-entrypoint.sh --- (complete version) ---

CONFIG_FILE="/app/config.json"
DEFAULT_CONFIG_FILE="/app/config.default.json"
DATA_CONFIG_FILE="/data/config.json"
PLUGINS_DIR="/app/extensions/plugins"
HA_PLUGIN_ID="gesture-vision-plugin-home-assistant"
HA_PLUGIN_DIR="$PLUGINS_DIR/$HA_PLUGIN_ID"
HA_PLUGIN_CONFIG_FILE="$HA_PLUGIN_DIR/config.home-assistant.json"

echo "--- GestureVision HA Add-on Starting ---"

if [ -n "$SUPERVISOR_TOKEN" ]; then
    echo "[HA Mode] Supervisor detected."

    # Ensure plugin directory exists
    if [ ! -d "$HA_PLUGIN_DIR" ]; then
        echo "[HA Mode] WARNING: HA Plugin directory missing at $HA_PLUGIN_DIR. Creating..."
        mkdir -p "$HA_PLUGIN_DIR"
    fi

    # 1. Configure HA Plugin
    echo "[HA Mode] Configuring Plugin..."
    cat > "$HA_PLUGIN_CONFIG_FILE" <<EOF
{
  "haUrl": "http://supervisor/core",
  "longLivedAccessToken": "$SUPERVISOR_TOKEN",
  "debug": false
}
EOF
    
    if [ -f "$HA_PLUGIN_CONFIG_FILE" ]; then
        echo "[HA Mode] Plugin config created successfully."
    else
        echo "[HA Mode] ERROR: Failed to create plugin config."
    fi

    # 2. Persistent Config Logic
    if [ ! -f "$DATA_CONFIG_FILE" ]; then
        echo "[HA Mode] Initializing persistent config..."
        # Copy from the default file we baked into the image
        if [ -f "$DEFAULT_CONFIG_FILE" ]; then
            cp "$DEFAULT_CONFIG_FILE" "$DATA_CONFIG_FILE"
        elif [ -f "$CONFIG_FILE" ]; then 
            cp "$CONFIG_FILE" "$DATA_CONFIG_FILE"
        else 
            echo "{}" > "$DATA_CONFIG_FILE"
        fi
    fi

    # 3. Apply Options
    if [ -f "/data/options.json" ]; then
        ICE_HOST=$(jq -r '.mtx_ice_host // empty' /data/options.json)
        if [ -n "$ICE_HOST" ]; then
            echo "[HA Mode] Setting ICE Host to: $ICE_HOST"
            export MTX_WEBRTC_ADDITIONAL_HOSTS="$ICE_HOST"
        fi
        
        LOG_LEVEL=$(jq -r '.log_level // "info"' /data/options.json)
        echo "[HA Mode] Setting Log Level to: $LOG_LEVEL"
        export MTX_LOGLEVEL="$LOG_LEVEL"
    fi

    # 4. Link Config
    # Remove existing link or file if it exists to ensure clean link
    if [ -L "$CONFIG_FILE" ] || [ -f "$CONFIG_FILE" ]; then
        rm -f "$CONFIG_FILE"
    fi
    ln -s "$DATA_CONFIG_FILE" "$CONFIG_FILE"
fi

echo "Starting Application..."
# Using exec ensures the process receives signals correctly
exec "$@"