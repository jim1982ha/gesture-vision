# Dockerfile - Home Assistant Add-on
FROM node:22-bookworm

# Install dependencies
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    curl \
    ca-certificates \
    ffmpeg \
    iputils-ping \
    nginx-extras \
    git \
    jq && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Install MediaMTX
ARG MEDIAMTX_VERSION=v1.12.0
ARG BUILD_ARCH
# Robust architecture detection
RUN if [ -z "$BUILD_ARCH" ]; then \
      ARCH=$(dpkg --print-architecture); \
    else \
      ARCH=$BUILD_ARCH; \
    fi; \
    if [ "$ARCH" = "aarch64" ] || [ "$ARCH" = "arm64" ]; then MTX_ARCH="arm64v8"; \
    elif [ "$ARCH" = "armv7" ]; then MTX_ARCH="armv7"; \
    elif [ "$ARCH" = "amd64" ] || [ "$ARCH" = "x86_64" ]; then MTX_ARCH="amd64"; \
    else echo "Unsupported Architecture: $ARCH" && exit 1; fi; \
    echo "Downloading MediaMTX for architecture: $MTX_ARCH (System: $ARCH)..."; \
    curl -f -Ls "https://github.com/bluenviron/mediamtx/releases/download/${MEDIAMTX_VERSION}/mediamtx_${MEDIAMTX_VERSION}_linux_${MTX_ARCH}.tar.gz" | tar -xz -C /usr/local/bin/
RUN chmod +x /usr/local/bin/mediamtx

WORKDIR /app

# --- 1. Fetch Source Code ---
ARG BUILD_VERSION=main
RUN echo "Cloning GestureVision core (branch: ${BUILD_VERSION})..." && \
    git clone https://github.com/jim1982ha/gesture-vision.git . && \
    (git checkout ${BUILD_VERSION} || git checkout main)

# --- 2. Fetch Bundled Plugins (Generic Logic) ---
RUN mkdir -p extensions/plugins

# Copy the configuration file that lists the plugins
# This file must exist in the 'ha-addon' directory on the host machine
COPY bundled_plugins.txt /tmp/

# Iterate over the list and clone each plugin. 
RUN while read -r url; do \
      if [ -n "$url" ] && [ "${url:0:1}" != "#" ]; then \
        name=$(basename "$url" .git); \
        echo "Bundling plugin: $name"; \
        rm -rf "extensions/plugins/$name"; \
        git clone --depth 1 "$url" "extensions/plugins/$name"; \
      fi \
    done < /tmp/bundled_plugins.txt

# --- 3. Install & Build ---
RUN npm install --include=dev

# Override base path for Ingress compatibility
RUN sed -i 's|const appBase = "/";|const appBase = "./";|' packages/frontend/vite.config.js

# Environment variables for build
ARG VITE_PROD_WHEP_BASE_URL
ARG VITE_PROD_HA_DEFAULT_URL
ENV NODE_ENV=production

# Build backend and frontend
RUN npm run build:backend
RUN npm run build:umd
RUN npm run build:app
RUN npm prune --omit=dev

# --- 4. Prepare Runtime Files ---
# Nginx setup
RUN rm -f /etc/nginx/sites-enabled/default
# FIX: Copy config from the source inside /app (current stage), NOT from the external build context
RUN cp config/nginx.conf /etc/nginx/nginx.conf

# Move frontend build to Nginx webroot
RUN rm -rf /usr/share/nginx/html/* && \
    cp -r packages/frontend/dist/* /usr/share/nginx/html/

# Plugin Assets Setup for Nginx
RUN mkdir -p /usr/share/nginx/html/plugins && \
    chmod -R 755 /usr/share/nginx/html

RUN for plugin_dir in extensions/plugins/*; do \
      if [ -d "$plugin_dir" ]; then \
        plugin_id=$(basename "$plugin_dir"); \
        dest_dir="/usr/share/nginx/html/plugins/$plugin_id"; \
        mkdir -p "$dest_dir"; \
        if [ -d "$plugin_dir/frontend" ]; then cp -r "$plugin_dir/frontend" "$dest_dir/"; fi; \
        if [ -d "$plugin_dir/locales" ]; then cp -r "$plugin_dir/locales" "$dest_dir/"; fi; \
        if [ -f "$plugin_dir/plugin.json" ]; then cp "$plugin_dir/plugin.json" "$dest_dir/"; fi; \
      fi; \
    done

# Copy config and entrypoint from the source inside /app
RUN cp config/gesturevision.example.json /app/config.default.json
RUN cp ha-addon/docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# Runtime Environment
ENV NODE_OPTIONS="--preserve-symlinks"
ENV MTX_API="yes"
ENV MTX_APIADDRESS="127.0.0.1:9997"

EXPOSE 80 8888 1935
CMD ["npm", "run", "start:prod"]