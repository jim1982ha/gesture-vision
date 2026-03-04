#!/bin/bash
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
    
    # --- 0. Setup/Sync Persistent Plugins Directory ---
    # Ensure data dir exists
    if [ ! -d "$DATA_PLUGINS_DIR" ]; then
        echo "[HA Mode] Initializing persistent plugins directory..."
        mkdir -p "$DATA_PLUGINS_DIR"
    fi

    # SYNC LOGIC: Copy plugins from the Image (/app) to Data (/data)
    # This ensures new plugins added to the Docker Image appear in the persistent volume
    # and that code updates in the image are applied to persistence.
    if [ -d "$APP_PLUGINS_DIR" ] && [ ! -L "$APP_PLUGINS_DIR" ]; then
        echo "[HA Mode] Syncing built-in plugins to persistent storage..."
        
        for p in "$APP_PLUGINS_DIR"/*; do
            # Skip if glob didn't match anything
            [ -e "$p" ] || continue
            
            plugin_name=$(basename "$p")
            # Filter out non-plugin files if any (like .gitkeep)
            if [ "$plugin_name" == "common" ] || [[ "$plugin_name" == .* ]]; then
                continue
            fi

            target_plugin_path="$DATA_PLUGINS_DIR/$plugin_name"

            if [ ! -d "$target_plugin_path" ]; then
                echo "  - Installing new plugin: $plugin_name"
                cp -r "$p" "$DATA_PLUGINS_DIR/"
            else
                echo "  - Updating plugin code: $plugin_name"
                # Update frontend assets
                if [ -d "$p/frontend" ]; then
                    rm -rf "$target_plugin_path/frontend"
                    cp -r "$p/frontend" "$target_plugin_path/"
                fi
                # Update locales
                if [ -d "$p/locales" ]; then
                    rm -rf "$target_plugin_path/locales"
                    cp -r "$p/locales" "$target_plugin_path/"
                fi
                # Update manifest
                if [ -f "$p/plugin.json" ]; then
                    cp "$p/plugin.json" "$target_plugin_path/"
                fi
                # Update backend source files (TS)
                if ls "$p"/*.ts 1> /dev/null 2>&1; then
                    cp "$p"/*.ts "$target_plugin_path/"
                fi
                # Copy helpers dir if exists
                if [ -d "$p/helpers" ]; then
                    rm -rf "$target_plugin_path/helpers"
                    cp -r "$p/helpers" "$target_plugin_path/"
                fi
                
                # NOTE: We DO NOT overwrite config files (config.json) to preserve user settings.
            fi
        done
        
        echo "[HA Mode] Plugin sync complete."
    fi

    # CRITICAL FIX: Link app node_modules to data plugins so they can resolve dependencies
    # Node resolves modules by looking up the directory tree.
    if [ -d "/app/node_modules" ]; then
        echo "[HA Mode] Linking node_modules for plugins..."
        rm -rf "$DATA_PLUGINS_DIR/node_modules" 
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
    
    # Ensure HA plugin dir exists (it should after sync, but safety check)
    if [ ! -d "$APP_PLUGINS_DIR/$HA_PLUGIN_ID" ]; then
         echo "[HA Mode] ERROR: Home Assistant plugin not found after sync."
    else
        echo "[HA Mode] Configuring Home Assistant Plugin for Zero-Config..."
        # FIX: Keys must match HaGlobalConfigSchema in schemas.ts (url, token)
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