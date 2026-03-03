#!/bin/bash
# --- ha-addon/docker-entrypoint.sh --- (complete version) ---

CONFIG_FILE="/app/config.json"
DATA_CONFIG_FILE="/data/config.json"
PLUGINS_DIR="/app/extensions/plugins"
HA_PLUGIN_ID="gesture-vision-plugin-home-assistant"
HA_PLUGIN_CONFIG_FILE="$PLUGINS_DIR/$HA_PLUGIN_ID/config.home-assistant.json"

echo "--- GestureVision HA Add-on Starting ---"

if [ -n "$SUPERVISOR_TOKEN" ]; then
    echo "[HA Mode] Supervisor detected."

    # 1. Configure HA Plugin
    # We assume the plugin files were copied during Docker build (see Dockerfile)
    echo "[HA Mode] Configuring Plugin..."
    cat > "$HA_PLUGIN_CONFIG_FILE" <<EOF
{
  "haUrl": "http://supervisor/core",
  "longLivedAccessToken": "$SUPERVISOR_TOKEN",
  "debug": false
}
EOF

    # 2. Persistent Config Logic
    if [ ! -f "$DATA_CONFIG_FILE" ]; then
        echo "[HA Mode] Initializing persistent config..."
        if [ -f "$CONFIG_FILE" ]; then cp "$CONFIG_FILE" "$DATA_CONFIG_FILE"; else echo "{}" > "$DATA_CONFIG_FILE"; fi
    fi

    # 3. Apply Options
    if [ -f "/data/options.json" ]; then
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
        rm -f "$CONFIG_FILE"
        ln -s "$DATA_CONFIG_FILE" "$CONFIG_FILE"
    fi
fi

echo "Starting Application..."
exec "$@"