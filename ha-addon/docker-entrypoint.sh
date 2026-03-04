#!/bin/bash
# --- ha-addon/docker-entrypoint.sh --- (complete version) ---
CONFIG_FILE="/app/config.json"
DEFAULT_CONFIG_FILE="/app/config.default.json"
DATA_CONFIG_FILE="/data/config.json"
# Paths
APP_PLUGINS_DIR="/app/extensions/plugins"
DATA_PLUGINS_DIR="/data/plugins"
HA_PLUGIN_ID="gesture-vision-plugin-home-assistant"
echo "--- GestureVision HA Add-on Starting ---"
if [ -n "$SUPERVISOR_TOKEN" ]; then
    echo "[HA Mode] Supervisor detected."
    # --- 0. Setup Persistent Plugins Directory ---
    if [ ! -d "$DATA_PLUGINS_DIR" ]; then
        echo "[HA Mode] Initializing persistent plugins directory..."
        mkdir -p "$DATA_PLUGINS_DIR"
        # Copy built-in plugins from image to data
        if [ -d "$APP_PLUGINS_DIR" ]; then
            cp -r "$APP_PLUGINS_DIR/"* "$DATA_PLUGINS_DIR/"
        fi
    fi
    # CRITICAL FIX: Link app node_modules to data plugins so they can resolve dependencies
    # Node resolves modules by looking up the directory tree.
    # Plugin: /data/plugins/my-plugin/index.ts -> looks in /data/plugins/node_modules -> FOUND via symlink
    if [ -d "/app/node_modules" ]; then
        echo "[HA Mode] Linking node_modules for plugins..."
        rm -rf "$DATA_PLUGINS_DIR/node_modules" # Remove existing if any
        ln -s "/app/node_modules" "$DATA_PLUGINS_DIR/node_modules"
    fi
    # Symlink /app/extensions/plugins -> /data/plugins
    # This allows the backend (running in /app) to see the persistent plugins
    if [ -d "$APP_PLUGINS_DIR" ] && [ ! -L "$APP_PLUGINS_DIR" ]; then
        echo "[HA Mode] Symlinking app plugins dir to persistent storage..."
        rm -rf "$APP_PLUGINS_DIR"
        ln -s "$DATA_PLUGINS_DIR" "$APP_PLUGINS_DIR"
    fi
    # --- 1. Configure HA Plugin ---
    HA_PLUGIN_CONFIG_FILE="$APP_PLUGINS_DIR/$HA_PLUGIN_ID/config.home-assistant.json"
    # Ensure HA plugin exists in data
    if [ ! -d "$APP_PLUGINS_DIR/$HA_PLUGIN_ID" ]; then
         echo "[HA Mode] Warning: HA Plugin missing in persistent data. Re-copying is complex here, relying on image build."
    fi
    echo "[HA Mode] Configuring Home Assistant Plugin for Zero-Config..."
    # FIX: Keys must match HaGlobalConfigSchema in schemas.ts (url, token)
    cat > "$HA_PLUGIN_CONFIG_FILE" <<EOF
{
  "url": "http://supervisor/core",
  "token": "$SUPERVISOR_TOKEN"
}
EOF
    if [ -f "$HA_PLUGIN_CONFIG_FILE" ]; then
        echo "[HA Mode] Plugin config written."
        chmod 644 "$HA_PLUGIN_CONFIG_FILE"
    else
        echo "[HA Mode] ERROR: Failed to write plugin config."
    fi
    # --- 2. Persistent Config Logic ---
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
    # --- 3. Apply Options ---
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
    # --- 4. Link Config ---
    if [ ! -L "$CONFIG_FILE" ]; then
        echo "[HA Mode] Linking config.json to persistent /data..."
        rm -f "$CONFIG_FILE"
        ln -s "$DATA_CONFIG_FILE" "$CONFIG_FILE"
    fi
fi
echo "Starting Application..."
exec "$@"