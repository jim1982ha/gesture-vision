#!/bin/bash
CONFIG_FILE="/app/config.json"
# FIX: Updated to new example config name
DEFAULT_CONFIG_FILE="/app/config.default.json"
DATA_CONFIG_FILE="/data/config.json"
# Paths
APP_PLUGINS_DIR="/app/extensions/plugins"
DATA_PLUGINS_DIR="/data/plugins"
NGINX_PLUGINS_DIR="/usr/share/nginx/html/plugins"
HA_PLUGIN_ID="gesture-vision-plugin-home-assistant"

# Default plugins to install if data is empty (Universal fallback)
DEFAULT_PLUGINS=(
    "https://github.com/jim1982ha/gesture-vision-plugin-home-assistant.git"
    "https://github.com/jim1982ha/gesture-vision-plugin-dashboard.git"
    "https://github.com/jim1982ha/gesture-vision-plugin-gesture-studio.git"
    "https://github.com/jim1982ha/gesture-vision-plugin-webhook.git"
    "https://github.com/jim1982ha/gesture-vision-plugin-os-command.git"
)

echo "--- GestureVision HA Add-on Starting ---"

if [ -n "$SUPERVISOR_TOKEN" ]; then
    echo "[HA Mode] Supervisor detected."
    
    # --- 0. Initialize Persistent Plugins ---
    if [ ! -d "$DATA_PLUGINS_DIR" ]; then
        echo "[HA Mode] Creating persistent plugins directory..."
        mkdir -p "$DATA_PLUGINS_DIR"
    fi

    # Check if plugins directory is empty. If so, seed defaults.
    if [ -z "$(ls -A "$DATA_PLUGINS_DIR")" ]; then
        echo "[HA Mode] Plugins directory is empty. Seeding default plugins..."
        for url in "${DEFAULT_PLUGINS[@]}"; do
            plugin_name=$(basename "$url" .git)
            echo "  - Cloning $plugin_name..."
            git clone --depth 1 "$url" "$DATA_PLUGINS_DIR/$plugin_name"
        done
        echo "[HA Mode] Default plugins installed."
    fi

    # --- CRITICAL: Link Persistence to App and Nginx ---
    
    # 1. Link for Backend (Node.js) access
    if [ -d "$APP_PLUGINS_DIR" ] && [ ! -L "$APP_PLUGINS_DIR" ]; then
        echo "[HA Mode] Symlinking app plugins dir to persistent storage..."
        rm -rf "$APP_PLUGINS_DIR"
        ln -s "$DATA_PLUGINS_DIR" "$APP_PLUGINS_DIR"
    fi

    # 2. Link for Frontend (Nginx) access
    if [ -d "$NGINX_PLUGINS_DIR" ]; then
        echo "[HA Mode] Symlinking Nginx plugins dir to persistent storage..."
        rm -rf "$NGINX_PLUGINS_DIR"
        ln -s "$DATA_PLUGINS_DIR" "$NGINX_PLUGINS_DIR"
    fi

    # Link node_modules for plugins to resolve dependencies
    if [ -d "/app/node_modules" ]; then
        rm -rf "$DATA_PLUGINS_DIR/node_modules" 
        ln -s "/app/node_modules" "$DATA_PLUGINS_DIR/node_modules"
    fi

    # --- 1. Configure HA Plugin ---
    HA_PLUGIN_CONFIG_FILE="$APP_PLUGINS_DIR/$HA_PLUGIN_ID/config.home-assistant.json"
    if [ -d "$APP_PLUGINS_DIR/$HA_PLUGIN_ID" ]; then
        echo "[HA Mode] Configuring Home Assistant Plugin..."
        cat > "$HA_PLUGIN_CONFIG_FILE" <<EOF
{
  "url": "http://supervisor/core",
  "token": "$SUPERVISOR_TOKEN"
}
EOF
        chmod 644 "$HA_PLUGIN_CONFIG_FILE"
    else
        echo "[HA Mode] WARNING: Home Assistant plugin not found. Auto-configuration skipped."
    fi

    # --- 2. Persistent Config Logic ---
    if [ ! -f "$DATA_CONFIG_FILE" ]; then
        if [ -f "$DEFAULT_CONFIG_FILE" ]; then cp "$DEFAULT_CONFIG_FILE" "$DATA_CONFIG_FILE";
        elif [ -f "$CONFIG_FILE" ]; then cp "$CONFIG_FILE" "$DATA_CONFIG_FILE";
        else echo "{}" > "$DATA_CONFIG_FILE"; fi
    fi

    # --- 3. Apply Options ---
    if [ -f "/data/options.json" ]; then
        ICE_HOST=$(jq -r '.mtx_ice_host // empty' /data/options.json)
        if [ -n "$ICE_HOST" ]; then export MTX_WEBRTC_ADDITIONAL_HOSTS="$ICE_HOST"; fi
        LOG_LEVEL=$(jq -r '.log_level // "info"' /data/options.json)
        export MTX_LOGLEVEL="$LOG_LEVEL"
    fi

    # --- 4. Link Config ---
    if [ ! -L "$CONFIG_FILE" ]; then
        rm -f "$CONFIG_FILE"
        ln -s "$DATA_CONFIG_FILE" "$CONFIG_FILE"
    fi
fi

echo "Starting Application..."
exec "$@"