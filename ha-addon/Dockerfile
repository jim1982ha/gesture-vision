# --- ha-addon/Dockerfile --- (complete version) ---
# We explicitly use the Node Debian image to ensure apt-get and npm work as expected
# instead of relying on the variable $BUILD_FROM which HA injects (often Alpine).
FROM node:22-bookworm

# Install dependencies
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    nodejs \
    npm \
    curl \
    ca-certificates \
    ffmpeg \
    iputils-ping \
    git \
    jq \
    nginx-extras && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Install MediaMTX
ARG MEDIAMTX_VERSION=v1.12.0
ARG TARGETARCH=amd64
# Handle architecture translation for MediaMTX download if needed.
# HA passes TARGETARCH automatically (amd64, arm64).
RUN curl -Ls https://github.com/bluenviron/mediamtx/releases/download/${MEDIAMTX_VERSION}/mediamtx_${MEDIAMTX_VERSION}_linux_${TARGETARCH}.tar.gz | tar -xz -C /usr/local/bin/
RUN chmod +x /usr/local/bin/mediamtx

WORKDIR /app

# Clone the repository
ARG BUILD_VERSION=main
RUN git clone https://github.com/jim1982ha/gesture-vision-app.git . && \
    git checkout ${BUILD_VERSION} || git checkout main

# Install App Dependencies
RUN npm install --include=dev

# Build Application
ENV NODE_ENV=production
RUN npm run build:backend
RUN npm run build:umd

# Override the base path for Ingress compatibility during build.
# This ensures the UI assets load correctly via the HA Proxy.
RUN sed -i 's|const appBase = "/";|const appBase = "./";|' packages/frontend/vite.config.js

RUN npm run build:app
RUN npm prune --omit=dev

# Plugin Setup
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

# Copy Configs
COPY nginx.conf /etc/nginx/nginx.conf
COPY config.example.json /app/config.default.json

# Copy Entrypoint
COPY docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# Labeling for Home Assistant
LABEL \
    io.hass.name="GestureVision" \
    io.hass.description="AI-Powered Gesture Control for your Smart Home" \
    io.hass.type="addon" \
    io.hass.version="4.1.0"

EXPOSE 80 8888 1935 8554
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["npm", "run", "start:prod"]