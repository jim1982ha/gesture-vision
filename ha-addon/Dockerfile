# Dockerfile - Home Assistant Add-on
FROM node:22-bookworm AS base

# Install dependencies
# 'git' is essential here to fetch the app source code, as HA Add-on build context
# is limited to the 'ha-addon' subdirectory and cannot access '../packages'.
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
ARG TARGETARCH
# Map Docker's target arch to MediaMTX's arch naming
RUN ARCH="${TARGETARCH}"; \
    if [ "$ARCH" = "arm64" ]; then ARCH="arm64v8"; fi; \
    echo "Downloading MediaMTX for ${ARCH}..." && \
    curl -Ls "https://github.com/bluenviron/mediamtx/releases/download/${MEDIAMTX_VERSION}/mediamtx_${MEDIAMTX_VERSION}_linux_${ARCH}.tar.gz" | tar -xz -C /usr/local/bin/
RUN chmod +x /usr/local/bin/mediamtx

WORKDIR /app

# --- 1. Fetch Source Code ---
# We must clone the repo because the build context is restricted to the 'ha-addon' folder.
# We cannot use COPY ../packages etc.
ARG BUILD_VERSION=main
RUN echo "Cloning GestureVision core (branch: ${BUILD_VERSION})..." && \
    git clone https://github.com/jim1982ha/gesture-vision.git . && \
    (git checkout ${BUILD_VERSION} || git checkout main)

# --- 2. Fetch Core Plugins ---
# Plugins are git-ignored in the main repo, so we must clone them explicitly
# to ensure they are available for the frontend build.
RUN mkdir -p extensions/plugins

# Home Assistant Plugin
RUN echo "Cloning HA Plugin..." && \
    rm -rf extensions/plugins/gesture-vision-plugin-home-assistant && \
    git clone --depth 1 https://github.com/jim1982ha/gesture-vision-plugin-home-assistant.git extensions/plugins/gesture-vision-plugin-home-assistant

# Dashboard Plugin
RUN echo "Cloning Dashboard Plugin..." && \
    rm -rf extensions/plugins/gesture-vision-plugin-dashboard && \
    git clone --depth 1 https://github.com/jim1982ha/gesture-vision-plugin-dashboard.git extensions/plugins/gesture-vision-plugin-dashboard

# --- 3. Install & Build ---
RUN npm install --include=dev

# Override the base path for Ingress compatibility (must happen before build)
RUN sed -i 's|const appBase = "/";|const appBase = "./";|' packages/frontend/vite.config.js

# Pass build args if they were provided (though HA usually handles ingress dynamic vars at runtime)
ARG VITE_PROD_WHEP_BASE_URL
ARG VITE_PROD_HA_DEFAULT_URL
ENV NODE_ENV=production

RUN npm run build:backend
RUN npm run build:umd
RUN npm run build:app
RUN npm prune --omit=dev

# --- 4. Prepare Runtime Files ---
# Clean Nginx webroot and copy built assets
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
# We use the files from the CLONED repo, not from COPY command, because of context limits.
RUN rm -f /etc/nginx/sites-enabled/default
RUN cp config/nginx.conf /etc/nginx/nginx.conf
RUN cp config/config.example.json /app/config.default.json

# Copy the entrypoint script.
# Since the build context is the 'ha-addon' folder, the file is at the root of the context.
COPY docker-entrypoint.sh /usr/local/bin/
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