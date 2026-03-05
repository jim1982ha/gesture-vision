#!/bin/bash
set -e

echo "--- Preparing HA Add-on Build Assets ---"

# Set script directory as CWD
cd "$(dirname "$0")" || exit 1
ADDON_ROOT_DIR=$(pwd)
PROJECT_ROOT_DIR=$(dirname "$ADDON_ROOT_DIR")

# --- Cleanup Old Build Assets ---
echo "1. Cleaning up previous build assets..."
rm -rf ./build/

# --- Prepare Build Directory ---
echo "2. Creating fresh build directory..."
mkdir -p ./build/
mkdir -p ./build/app/

# --- Copy Core Application Files ---
echo "3. Copying core application source and configs..."
cp -r "$PROJECT_ROOT_DIR/packages" ./build/app/
cp -r "$PROJECT_ROOT_DIR/extensions" ./build/app/
cp "$PROJECT_ROOT_DIR/package.json" ./build/app/
cp "$PROJECT_ROOT_DIR/package-lock.json" ./build/app/
cp "$PROJECT_ROOT_DIR/tsconfig.json" ./build/app/

# --- Copy Add-on Specific Files ---
echo "4. Copying add-on specific files (entrypoint, etc.)..."
cp "$ADDON_ROOT_DIR/docker-entrypoint.sh" ./build/app/ha-addon/
cp "$ADDON_ROOT_DIR/apparmor.txt" ./build/app/ha-addon/
cp "$ADDON_ROOT_DIR/config.yaml" ./
cp "$ADDON_ROOT_DIR/README.md" ./
cp "$ADDON_ROOT_DIR/icon.png" ./
cp "$ADDON_ROOT_DIR/logo.png" ./

# Nginx config is needed inside the container
cp "$PROJECT_ROOT_DIR/config/nginx.conf" ./build/app/config/
cp "$PROJECT_ROOT_DIR/config/config.example.json" ./build/app/config/

# --- Generate Final Dockerfile for HA Build ---
echo "5. Generating final Dockerfile for build context..."
cat > ./build/Dockerfile <<EOF
# Dockerfile - Home Assistant Add-on
FROM node:22-bookworm

# Install dependencies required by the application
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    curl \
    ca-certificates \
    ffmpeg \
    iputils-ping \
    nginx-extras \
    jq && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Install MediaMTX
ARG MEDIAMTX_VERSION=v1.12.0
ARG BUILD_ARCH
RUN if [ -z "\$BUILD_ARCH" ]; then \
      ARCH=\$(dpkg --print-architecture); \
    else \
      ARCH=\$BUILD_ARCH; \
    fi; \
    if [ "\$ARCH" = "aarch64" ] || [ "\$ARCH" = "arm64" ]; then MTX_ARCH="arm64v8"; \
    elif [ "\$ARCH" = "armv7" ]; then MTX_ARCH="armv7"; \
    elif [ "\$ARCH" = "amd64" ] || [ "\$ARCH" = "x86_64" ]; then MTX_ARCH="amd64"; \
    else echo "Unsupported Architecture: \$ARCH" && exit 1; fi; \
    echo "Downloading MediaMTX for architecture: \$MTX_ARCH (System: \$ARCH)..."; \
    curl -f -Ls "https://github.com/bluenviron/mediamtx/releases/download/\${MEDIAMTX_VERSION}/mediamtx_\${MEDIAMTX_VERSION}_linux_\${MTX_ARCH}.tar.gz" | tar -xz -C /usr/local/bin/
RUN chmod +x /usr/local/bin/mediamtx

# Copy all pre-staged application files into the /app directory
WORKDIR /app
COPY ./app/ .

# Install dependencies and build the application
RUN npm install --include=dev
RUN sed -i 's|const appBase = "/";|const appBase = "./";|' packages/frontend/vite.config.js
ENV NODE_ENV=production
RUN npm run build:backend
RUN npm run build:umd
RUN npm run build:app
RUN npm prune --omit=dev

# Prepare Nginx webroot
RUN rm -rf /usr/share/nginx/html/* && \
    cp -r packages/frontend/dist/* /usr/share/nginx/html/

# Plugin Frontend Asset Setup
RUN mkdir -p /usr/share/nginx/html/plugins && \
    chmod -R 755 /usr/share/nginx/html

RUN for plugin_dir in extensions/plugins/*; do \
      if [ -d "\$plugin_dir" ]; then \
        plugin_id=\$(basename "\$plugin_dir"); \
        dest_dir="/usr/share/nginx/html/plugins/\$plugin_id"; \
        mkdir -p "\$dest_dir"; \
        if [ -d "\$plugin_dir/frontend" ]; then cp -r "\$plugin_dir/frontend" "\$dest_dir/"; fi; \
        if [ -d "\$plugin_dir/locales" ]; then cp -r "\$plugin_dir/locales" "\$dest_dir/"; fi; \
        if [ -f "\$plugin_dir/plugin.json" ]; then cp "\$plugin_dir/plugin.json" "\$dest_dir/"; fi; \
      fi; \
    done

# Final container setup
RUN rm -f /etc/nginx/sites-enabled/default
COPY app/config/nginx.conf /etc/nginx/nginx.conf
COPY app/config/config.example.json /app/config.default.json
COPY app/ha-addon/docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh
COPY app/ha-addon/apparmor.txt /usr/share/apparmor/gesture-vision

# Environment settings
ENV NODE_OPTIONS="--preserve-symlinks"
ENV MTX_API="yes"
ENV MTX_APIADDRESS="127.0.0.1:9997"

EXPOSE 80 8888 1935
CMD ["npm", "run", "start:prod"]
EOF

echo "6. Add-on assets are prepared in ./build/"
echo "   Home Assistant Supervisor will use this directory as the build context."
echo "--- Preparation Complete ---"