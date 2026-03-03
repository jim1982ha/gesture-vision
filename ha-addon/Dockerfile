# --- ha-addon/Dockerfile --- (complete version) ---
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
ARG TARGETARCH
# Logic to map Docker's 'arm64' to MediaMTX's 'arm64v8'
RUN ARCH="${TARGETARCH}"; \
    if [ "$ARCH" = "arm64" ]; then ARCH="arm64v8"; fi; \
    echo "Downloading MediaMTX for ${ARCH}..." && \
    curl -Ls "https://github.com/bluenviron/mediamtx/releases/download/${MEDIAMTX_VERSION}/mediamtx_${MEDIAMTX_VERSION}_linux_${ARCH}.tar.gz" | tar -xz -C /usr/local/bin/
RUN chmod +x /usr/local/bin/mediamtx

WORKDIR /app

# Clone the main repository
ARG BUILD_VERSION=main
RUN git clone https://github.com/jim1982ha/gesture-vision.git . && \
    git checkout ${BUILD_VERSION} || git checkout main

# Clone the Home Assistant Plugin (Critical for Add-on)
RUN mkdir -p extensions/plugins/gesture-vision-plugin-home-assistant && \
    git clone --depth 1 https://github.com/jim1982ha/gesture-vision-plugin-home-assistant.git extensions/plugins/gesture-vision-plugin-home-assistant

# Install App Dependencies
RUN npm install --include=dev

# Build Application
ENV NODE_ENV=production
RUN npm run build:backend
RUN npm run build:umd

# Override the base path for Ingress compatibility
RUN sed -i 's|const appBase = "/";|const appBase = "./";|' packages/frontend/vite.config.js

RUN npm run build:app
RUN npm prune --omit=dev

# --- FIXED: Copy Frontend Build to Nginx Webroot ---
# This was missing, causing the "Welcome to nginx" page
RUN rm -rf /usr/share/nginx/html/* && \
    cp -r packages/frontend/dist/* /usr/share/nginx/html/

# Plugin Frontend Asset Setup
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
# Remove default nginx sites to prevent conflicts
RUN rm -f /etc/nginx/sites-enabled/default
RUN cp config/nginx.conf /etc/nginx/nginx.conf
RUN cp config/config.example.json /app/config.default.json
RUN cp ha-addon/docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

ARG BUILD_VERSION
LABEL \
    io.hass.name="GestureVision" \
    io.hass.description="AI-Powered Gesture Control for your Smart Home" \
    io.hass.type="addon" \
    io.hass.version="${BUILD_VERSION}"

EXPOSE 80 8888 1935 8554
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["npm", "run", "start:prod"]