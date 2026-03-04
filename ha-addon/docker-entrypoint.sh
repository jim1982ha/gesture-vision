#!/bin/bash
# --- ha-addon/docker-entrypoint.sh --- (complete version) ---

CONFIG_FILE="/app/config.json"
DEFAULT_CONFIG_FILE="/app/config.default.json"
DATA_CONFIG_FILE="/data/config.json"

# Plugin paths
PLUGINS_DIR="/app/extensions/plugins"
HA_PLUGIN_ID="gesture-vision-plugin-home-assistant"
HA_PLUGIN_DIR="$PLUGINS_DIR/$HA_PLUGIN_ID"
HA_PLUGIN_CONFIG_FILE="$HA_PLUGIN_DIR/config.home-assistant.json"

echo "--- GestureVision HA Add-on Starting ---"

if [ -n "$SUPERVISOR_TOKEN" ]; then
    echo "[HA Mode] Supervisor detected."

    # 1. Configure HA Plugin
    if [ ! -d "$HA_PLUGIN_DIR" ]; then
        echo "[HA Mode] ERROR: Plugin directory $HA_PLUGIN_DIR does not exist!"
    else
        echo "[HA Mode] Configuring Home Assistant Plugin for Zero-Config..."
        
        # We use the internal supervisor proxy URL.
        # This routes requests like 'http://supervisor/core/api/...' directly to HA.
        # The 'longLivedAccessToken' here is actually the Supervisor Token, which works interchangeably for Add-ons.
        cat > "$HA_PLUGIN_CONFIG_FILE" <<EOF
{
  "haUrl": "http://supervisor/core",
  "longLivedAccessToken": "$SUPERVISOR_TOKEN",
  "debug": false
}
EOF
        if [ -f "$HA_PLUGIN_CONFIG_FILE" ]; then
            echo "[HA Mode] Plugin config written successfully."
            chmod 644 "$HA_PLUGIN_CONFIG_FILE"
        else
            echo "[HA Mode] ERROR: Failed to write plugin config."
        fi
    fi

    # 2. Persistent Config Logic (Main App)
    if [ ! -f "$DATA_CONFIG_FILE" ]; then
        echo "[HA Mode] Initializing persistent config in /data..."
        if [ -f "$DEFAULT_CONFIG_FILE" ]; then
            cp "$DEFAULT_CONFIG_FILE" "$DATA_CONFIG_FILE"
        elif [ -f "$CONFIG_FILE" ]; then 
            cp "$CONFIG_FILE" "$DATA_CONFIG_FILE"
        else 
            echo "{}" > "$DATA_CONFIG_FILE"
        fi
    fi

    # 3. Apply Options from HA UI
    if [ -f "/data/options.json" ]; then
        echo "[HA Mode] Reading Add-on Options..."
        ICE_HOST=$(jq -r '.mtx_ice_host // empty' /data/options.json)
        if [ -n "$ICE_HOST" ]; then
            echo "[HA Mode] Setting ICE Host to: $ICE_HOST"
            export MTX_WEBRTC_ADDITIONAL_HOSTS="$ICE_HOST"
        fi
        
        LOG_LEVEL=$(jq -r '.log_level // "info"' /data/options.json)
        export MTX_LOGLEVEL="$LOG_LEVEL"
    fi

    # 4. Link Config
    if [ ! -L "$CONFIG_FILE" ]; then
        echo "[HA Mode] Linking config.json to persistent /data..."
        rm -f "$CONFIG_FILE"
        ln -s "$DATA_CONFIG_FILE" "$CONFIG_FILE"
    fi
fi

echo "Starting Application..."
exec "$@"