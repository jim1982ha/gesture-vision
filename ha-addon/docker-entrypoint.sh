#!/bin/bash

CONFIG_FILE="/app/config.json"
DEFAULT_CONFIG_FILE="/app/config.default.json"
DATA_CONFIG_FILE="/data/config.json"

# Paths
APP_PLUGINS_DIR="/app/extensions/plugins"
DATA_PLUGINS_DIR="/data/plugins"
NGINX_PLUGINS_DIR="/usr/share/nginx/html/plugins"
HA_PLUGIN_ID="gesture-vision-plugin-home-assistant"

# Dynamically fetch the version using jq (safer/faster than spinning up Node here)
APP_VERSION=$(jq -r '.version' /app/package.json 2>/dev/null || echo "Unknown")

echo "--- GestureVision HA Add-on Starting (v${APP_VERSION}) ---"

if [ -n "$SUPERVISOR_TOKEN" ]; then
    echo "[HA Mode] Supervisor detected."
    
    # --- 0. Setup/Sync Persistent Plugins Directory ---
    if [ ! -d "$DATA_PLUGINS_DIR" ]; then
        echo "[HA Mode] Initializing persistent plugins directory..."
        mkdir -p "$DATA_PLUGINS_DIR"
    fi

    # Sync built-in plugins from Image to Persistence
    if [ -d "$APP_PLUGINS_DIR" ]; then
        echo "[HA Mode] Syncing built-in plugins to persistent storage..."
        for p in "$APP_PLUGINS_DIR"/*; do
            [ -e "$p" ] || continue
            plugin_name=$(basename "$p")
            if [ "$plugin_name" == "common" ] || [[ "$plugin_name" == .* ]]; then continue; fi
            target_plugin_path="$DATA_PLUGINS_DIR/$plugin_name"
            if [ ! -d "$target_plugin_path" ]; then
                cp -r "$p" "$DATA_PLUGINS_DIR/"
            else
                # Smart update: update code but preserve config[ -d "$p/frontend" ] && rm -rf "$target_plugin_path/frontend" && cp -r "$p/frontend" "$target_plugin_path/"[ -d "$p/locales" ] && rm -rf "$target_plugin_path/locales" && cp -r "$p/locales" "$target_plugin_path/"
                [ -f "$p/plugin.json" ] && cp "$p/plugin.json" "$target_plugin_path/"
                ls "$p"/*.ts 1> /dev/null 2>&1 && cp "$p"/*.ts "$target_plugin_path/"[ -d "$p/helpers" ] && rm -rf "$target_plugin_path/helpers" && cp -r "$p/helpers" "$target_plugin_path/"
            fi
        done
    fi

    # --- CRITICAL: Link Persistence to App and Nginx ---
    # 1. Link for Backend (Node.js) access
    if [ -d "$APP_PLUGINS_DIR" ] &&[ ! -L "$APP_PLUGINS_DIR" ]; then
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

    # --- 1. Configure HA Plugin ---
    HA_PLUGIN_CONFIG_FILE="$APP_PLUGINS_DIR/$HA_PLUGIN_ID/config.home-assistant.json"
    if [ ! -d "$APP_PLUGINS_DIR/$HA_PLUGIN_ID" ]; then
         echo "[HA Mode] ERROR: Home Assistant plugin not found after sync."
    else
        echo "[HA Mode] Configuring Home Assistant Plugin..."
        cat > "$HA_PLUGIN_CONFIG_FILE" <<EOF
{
  "url": "http://supervisor/core",
  "token": "$SUPERVISOR_TOKEN"
}
EOF
        chmod 644 "$HA_PLUGIN_CONFIG_FILE"
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