# --- ha-addon/Dockerfile --- (complete version) ---
# We use the official Node image, so we do NOT need to apt-get install nodejs/npm
FROM node:22-bookworm

# Install system dependencies
# REMOVED: nodejs npm (already in base image)
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
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

# Override the base path for Ingress compatibility during build
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

# Internal Copy of Configs
RUN cp config/nginx.conf /etc/nginx/nginx.conf
RUN cp config/config.example.json /app/config.default.json
RUN cp ha-addon/docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# Labeling
ARG BUILD_VERSION
LABEL \
    io.hass.name="GestureVision" \
    io.hass.description="AI-Powered Gesture Control for your Smart Home" \
    io.hass.type="addon" \
    io.hass.version="${BUILD_VERSION}"

EXPOSE 80 8888 1935 8554
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["npm", "run", "start:prod"]