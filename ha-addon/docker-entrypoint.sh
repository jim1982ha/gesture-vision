// --- ha-addon/docker-entrypoint.sh --- (complete version) ---
#!/bin/bash
set -e

CONFIG_FILE="/app/config.json"
DEFAULT_CONFIG_FILE="/app/config.default.json"
DATA_CONFIG_FILE="/data/config.json"

# Paths
APP_EXTENSIONS_DIR="/app/extensions"
DATA_EXTENSIONS_DIR="/data/extensions"
BUNDLED_PLUGINS_DIR="/app/bundled_plugins"

# Nginx Webroot
NGINX_PLUGINS_LINK="/usr/share/nginx/html/plugins"

# Mandatory Plugin Definition
HA_PLUGIN_ID="gesture-vision-plugin-home-assistant"

echo "--- GestureVision HA Add-on Starting ---"

if [ -n "$SUPERVISOR_TOKEN" ]; then
    echo "[HA Mode] Supervisor detected. Configuring persistence..."

    # --- 1. Prepare Persistent Extension Directory ---
    if [ ! -d "$DATA_EXTENSIONS_DIR" ]; then
        echo "[HA Mode] Creating persistent extensions directory..."
        mkdir -p "$DATA_EXTENSIONS_DIR/plugins"
    fi
    
    # Ensure plugins subdir exists
    if [ ! -d "$DATA_EXTENSIONS_DIR/plugins" ]; then
         mkdir -p "$DATA_EXTENSIONS_DIR/plugins"
    fi

    # --- 2. Sync Bundled Plugins (The Fix) ---
    # We sync plugins bundled in the image to the persistent storage.
    # This ensures that when the Add-on is updated, the plugins are also updated.
    # We use rsync to merge, preferring the image version for bundled plugins.
    if [ -d "$BUNDLED_PLUGINS_DIR" ]; then
        echo "[HA Mode] Syncing bundled plugins to persistence..."
        # -a: archive mode
        # -v: verbose
        # --checksum: check based on checksum, not just time/size (important for updates)
        # --existing: update existing files
        # --ignore-existing: skip files that exist on receiver (we DON'T want this for bundled plugins, we want to update them)
        # However, we don't want to wipe out user-installed plugins.
        # So we just copy the bundled ones over.
        cp -r "$BUNDLED_PLUGINS_DIR/"* "$DATA_EXTENSIONS_DIR/plugins/"
        echo "[HA Mode] Bundled plugins synced."
    else
        echo "[HA Mode] Warning: No bundled plugins found in image."
    fi

    # --- 3. Link Persistence to Application ---
    # This enables the "Install from URL" feature in the UI to write to /data/extensions
    
    # 3a. Link /app/extensions -> /data/extensions (For Backend/Node.js)
    # The directory /app/extensions exists (from Dockerfile) but plugins subdir is empty/removed.
    # We replace the whole directory with the symlink.
    if [ -d "$APP_EXTENSIONS_DIR" ] && [ ! -L "$APP_EXTENSIONS_DIR" ]; then
        rm -rf "$APP_EXTENSIONS_DIR"
    fi
    
    if [ ! -L "$APP_EXTENSIONS_DIR" ]; then
        echo "[HA Mode] Symlinking app extensions to persistent storage..."
        ln -s "$DATA_EXTENSIONS_DIR" "$APP_EXTENSIONS_DIR"
    fi

    # 3b. Link /usr/share/nginx/html/plugins -> /data/extensions/plugins (For Frontend/Nginx)
    if [ -d "$NGINX_PLUGINS_LINK" ] && [ ! -L "$NGINX_PLUGINS_LINK" ]; then
        rm -rf "$NGINX_PLUGINS_LINK"
    fi
    
    if [ ! -L "$NGINX_PLUGINS_LINK" ]; then
        echo "[HA Mode] Symlinking Nginx plugins to persistent storage..."
        ln -s "$DATA_EXTENSIONS_DIR/plugins" "$NGINX_PLUGINS_LINK"
    fi

    # 3c. Link node_modules for plugins (Shared dependencies)
    if [ -d "/app/node_modules" ]; then
        # Cleanup old dir if exists
        if [ -d "$DATA_EXTENSIONS_DIR/plugins/node_modules" ] && [ ! -L "$DATA_EXTENSIONS_DIR/plugins/node_modules" ]; then
            rm -rf "$DATA_EXTENSIONS_DIR/plugins/node_modules"
        fi
        
        # Create link if missing
        if [ ! -L "$DATA_EXTENSIONS_DIR/plugins/node_modules" ]; then
            echo "[HA Mode] Linking node_modules for plugins..."
            ln -s "/app/node_modules" "$DATA_EXTENSIONS_DIR/plugins/node_modules"
        fi
    fi

    # --- 4. Auto-Configure Home Assistant Plugin ---
    HA_PLUGIN_CONFIG_FILE="$DATA_EXTENSIONS_DIR/plugins/$HA_PLUGIN_ID/config.home-assistant.json"
    
    # Check if the directory exists (it should now, due to sync step)
    if [ -d "$DATA_EXTENSIONS_DIR/plugins/$HA_PLUGIN_ID" ]; then
        echo "[HA Mode] Configuring Home Assistant Plugin..."
        # Always overwrite HA config to ensure valid Supervisor token is used
        cat > "$HA_PLUGIN_CONFIG_FILE" <<EOF
{
  "url": "http://supervisor/core",
  "token": "$SUPERVISOR_TOKEN"
}
EOF
        chmod 644 "$HA_PLUGIN_CONFIG_FILE"
    else
        echo "[HA Mode] CRITICAL WARNING: Home Assistant plugin directory not found even after sync."
    fi

    # --- 5. Persistent Main Config ---
    if [ ! -f "$DATA_CONFIG_FILE" ]; then
        echo "[HA Mode] Initializing main config..."
        if [ -f "$DEFAULT_CONFIG_FILE" ]; then
            cp "$DEFAULT_CONFIG_FILE" "$DATA_CONFIG_FILE"
        elif [ -f "$CONFIG_FILE" ]; then
            cp "$CONFIG_FILE" "$DATA_CONFIG_FILE"
        else
            echo "{}" > "$DATA_CONFIG_FILE"
        fi
    fi

    # --- 6. Apply Add-on Options ---
    if [ -f "/data/options.json" ]; then
        ICE_HOST=$(jq -r '.mtx_ice_host // empty' /data/options.json)
        if [ -n "$ICE_HOST" ]; then
            export MTX_WEBRTC_ADDITIONAL_HOSTS="$ICE_HOST"
        fi
        
        LOG_LEVEL=$(jq -r '.log_level // "info"' /data/options.json)
        export MTX_LOGLEVEL="$LOG_LEVEL"
    fi

    # --- 7. Link Main Config ---
    if [ -f "$CONFIG_FILE" ] && [ ! -L "$CONFIG_FILE" ]; then
        rm -f "$CONFIG_FILE"
    fi
    
    if [ ! -L "$CONFIG_FILE" ]; then
        ln -s "$DATA_CONFIG_FILE" "$CONFIG_FILE"
    fi
fi

echo "Starting Application..."
exec "$@"