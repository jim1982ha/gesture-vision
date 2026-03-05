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
    jq \
    rsync && \
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

# --- 1. Copy Source Code ---
COPY . .

# --- 2. Install & Build ---
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

# --- 3. Cleanup Build Artifacts & Prepare Runtime ---
# Ensure local extension folders are empty/ready for runtime linking
RUN rm -rf extensions/plugins/*

# Nginx setup
RUN rm -f /etc/nginx/sites-enabled/default
RUN cp config/nginx.conf /etc/nginx/nginx.conf

# Move frontend build to Nginx webroot
RUN rm -rf /usr/share/nginx/html/* && \
    cp -r packages/frontend/dist/* /usr/share/nginx/html/

# Ensure plugin webroot directory exists (will be linked at runtime)
RUN mkdir -p /usr/share/nginx/html/plugins && \
    chmod -R 755 /usr/share/nginx/html

# Copy config and entrypoint
RUN cp config/gesturevision.example.json /app/config.default.json
RUN cp ha-addon/docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh
RUN cp ha-addon/apparmor.txt /usr/share/apparmor/gesture-vision

# Runtime Environment
ENV NODE_OPTIONS="--preserve-symlinks"
ENV MTX_API="yes"
ENV MTX_APIADDRESS="127.0.0.1:9997"

EXPOSE 80 8888 1935
CMD ["npm", "run", "start:prod"]