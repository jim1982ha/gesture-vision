# Dockerfile
# Dockerfile - Combined App + MediaMTX (Refactored for packages/ structure and improved caching)

# ---- Stage 0: Base ----
# Installs system-level dependencies that rarely change.
FROM node:22-bookworm AS base
WORKDIR /app
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    curl \
    ca-certificates \
    ffmpeg \
    iputils-ping \
    nginx-extras && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*
ARG MEDIAMTX_VERSION=v1.12.0
ARG TARGETARCH=amd64
RUN curl -Ls https://github.com/bluenviron/mediamtx/releases/download/${MEDIAMTX_VERSION}/mediamtx_${MEDIAMTX_VERSION}_linux_${TARGETARCH}.tar.gz | tar -xz -C /usr/local/bin/
RUN chmod +x /usr/local/bin/mediamtx

# ---- Stage: Deps ----
# Solely responsible for installing npm dependencies. This layer is only rebuilt
# if package.json or package-lock.json changes.
FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
# FIX: Changed 'npm ci' to 'npm install'.
# 'npm ci' is too strict for some cross-platform/cross-version lockfile scenarios.
# 'npm install' recalculates the tree if necessary, preventing the build failure.
RUN npm install --include=dev

# ---- Stage 1: Builder ----
# Builds all production assets.
FROM base AS builder
WORKDIR /app

# Declare ARGs that may be passed via --build-arg
ARG VITE_PROD_WHEP_BASE_URL
ARG VITE_PROD_HA_DEFAULT_URL
ARG VITE_PROD_HA_DEFAULT_TOKEN

# MODIFIED: Copy pre-installed node_modules from the 'deps' stage.
COPY --from=deps /app/node_modules ./node_modules

# Copy all application source code
COPY package.json package-lock.json* ./
COPY tsconfig.json ./tsconfig.json
COPY packages/ ./packages/
COPY extensions/ ./extensions/
COPY config/config.example.json ./config/config.example.json

# Build all TypeScript projects, UMD bundle, and the frontend app
RUN npm run build:backend
RUN npm run build:umd
RUN npm run build:app

# Prune devDependencies for final production image
ENV NODE_ENV=production
RUN npm prune --omit=dev

# ---- Stage 2: Development ----
# Sets up the environment for live-reloading.
FROM base AS development
WORKDIR /app

# MODIFIED: Copy pre-installed node_modules from the 'deps' stage.
COPY --from=deps /app/node_modules ./node_modules

# Copy source code and necessary files. A change here will NOT trigger npm ci again.
COPY package.json package-lock.json* ./
COPY tsconfig.json ./tsconfig.json
COPY packages/ ./packages/
COPY extensions/ ./extensions/

# Build/copy assets required at runtime for development
RUN npm run build:umd
RUN npm run copy:wasm

COPY --from=base /usr/local/bin/mediamtx /usr/local/bin/mediamtx
COPY config/config.example.json /app/config.default.json

EXPOSE 8000 8889 8554 9001
CMD ["npm", "run", "dev"]

# ---- Stage 3: Production (Final) ----
# Creates the lean final image for production deployment.
FROM base AS production
WORKDIR /app

# MODIFIED: Copy pruned production node_modules from the 'builder' stage.
COPY --from=builder /app/node_modules ./node_modules

COPY package.json .
COPY tsconfig.json .
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/extensions ./extensions
COPY --from=builder /app/packages/frontend/dist /usr/share/nginx/html/

# Create the base plugins directory for Nginx
RUN mkdir -p /usr/share/nginx/html/plugins

# Use a shell loop to intelligently copy only necessary frontend assets for each plugin.
# This makes the production image smaller and more secure.
RUN for plugin_dir in /app/extensions/plugins/*; do \
      if [ -d "$plugin_dir" ]; then \
        plugin_id=$(basename "$plugin_dir"); \
        dest_dir="/usr/share/nginx/html/plugins/$plugin_id"; \
        mkdir -p "$dest_dir"; \
        if [ -d "$plugin_dir/frontend" ]; then cp -r "$plugin_dir/frontend" "$dest_dir/"; fi; \
        if [ -d "$plugin_dir/locales" ]; then cp -r "$plugin_dir/locales" "$dest_dir/"; fi; \
        if [ -f "$plugin_dir/plugin.json" ]; then cp "$plugin_dir/plugin.json" "$dest_dir/"; fi; \
        if [ -f "$plugin_dir/README.md" ]; then cp "$plugin_dir/README.md" "$dest_dir/"; fi; \
      fi; \
    done

RUN chmod -R 755 /usr/share/nginx/html/*
COPY config/nginx.conf /etc/nginx/nginx.conf
COPY --from=base /usr/local/bin/mediamtx /usr/local/bin/mediamtx
COPY config/config.example.json /app/config.default.json

EXPOSE 80
EXPOSE 8888
EXPOSE 1935
CMD ["npm", "run", "start:prod"]