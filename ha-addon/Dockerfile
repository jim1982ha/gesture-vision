# Dockerfile - Standalone Production & Development
FROM node:22-bookworm AS base
WORKDIR /app
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
ARG MEDIAMTX_VERSION=v1.12.0
ARG TARGETARCH=amd64
RUN curl -Ls https://github.com/bluenviron/mediamtx/releases/download/${MEDIAMTX_VERSION}/mediamtx_${MEDIAMTX_VERSION}_linux_${TARGETARCH}.tar.gz | tar -xz -C /usr/local/bin/
RUN chmod +x /usr/local/bin/mediamtx

FROM base AS deps
WORKDIR /app
# We cannot COPY package.json from context because context is 'ha-addon' dir.
# We must rely on the git clone in the builder stage.
# This stage is kept for structure but mostly acts as a pass-through in this specific HA flow.

FROM base AS builder
WORKDIR /app
ARG VITE_PROD_WHEP_BASE_URL
ARG VITE_PROD_HA_DEFAULT_URL

# --- 1. Fetch Source Code via Git ---
# This is the Source of Truth. We clone the repo here because we cannot COPY it from the host
# when running inside Home Assistant Add-on builder (context is restricted).
ARG BUILD_VERSION=main
RUN echo "Cloning GestureVision core (branch: ${BUILD_VERSION})..." && \
    git clone https://github.com/jim1982ha/gesture-vision.git . && \
    (git checkout ${BUILD_VERSION} || git checkout main)

# --- 2. Fetch Core Plugins ---
RUN mkdir -p extensions/plugins

# Home Assistant Plugin
RUN if [ ! -d "extensions/plugins/gesture-vision-plugin-home-assistant" ]; then \
      git clone --depth 1 https://github.com/jim1982ha/gesture-vision-plugin-home-assistant.git extensions/plugins/gesture-vision-plugin-home-assistant; \
    fi

# Dashboard Plugin
RUN if [ ! -d "extensions/plugins/gesture-vision-plugin-dashboard" ]; then \
      git clone --depth 1 https://github.com/jim1982ha/gesture-vision-plugin-dashboard.git extensions/plugins/gesture-vision-plugin-dashboard; \
    fi

# --- 3. Install & Build ---
RUN npm install --include=dev

# Override base path for Ingress
RUN sed -i 's|const appBase = "/";|const appBase = "./";|' packages/frontend/vite.config.js

ENV NODE_ENV=production
RUN npm run build:backend
RUN npm run build:umd
RUN npm run build:app
RUN npm prune --omit=dev

FROM base AS development
# Dev stage logic (unused in HA Add-on production build but kept for standalone compatibility)
WORKDIR /app
# In standalone dev, we map volumes, so this is just a placeholder
CMD ["npm", "run", "dev"]

FROM base AS production
WORKDIR /app

# --- 4. Copy Artifacts FROM BUILDER ---
# CRITICAL FIX: We copy *everything* from the builder stage because the local build context
# only contains the contents of the 'ha-addon' folder, not the full source.

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json .
COPY --from=builder /app/tsconfig.json .
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/extensions ./extensions
COPY --from=builder /app/packages/frontend/dist /usr/share/nginx/html/

# Prepare webroot for plugins
RUN mkdir -p /usr/share/nginx/html/plugins && \
    chmod -R 755 /usr/share/nginx/html

# Populate plugin assets for Nginx
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
# These files are sourced from the builder image, which has the full repo clone.
RUN rm -f /etc/nginx/sites-enabled/default
COPY --from=builder /app/config/nginx.conf /etc/nginx/nginx.conf
COPY --from=base /usr/local/bin/mediamtx /usr/local/bin/mediamtx
COPY --from=builder /app/config/config.example.json /app/config.default.json

# Entrypoint - sourced from builder's cloned repo path
COPY --from=builder /app/ha-addon/docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# Environment settings
ENV NODE_OPTIONS="--preserve-symlinks"

EXPOSE 80 8888 1935
CMD ["npm", "run", "start:prod"]