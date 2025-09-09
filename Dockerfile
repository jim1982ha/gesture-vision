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

# ---- NEW Stage: Deps ----
# Solely responsible for installing npm dependencies. This layer is only rebuilt
# if package.json or package-lock.json changes.
FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --loglevel=error --include=dev

# ---- Stage 1: Builder ----
# Builds all production assets.
FROM base AS builder
WORKDIR /app

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
RUN npm prune --production

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

# Copy plugin assets to the webroot for Nginx to serve
RUN mkdir -p /usr/share/nginx/html/plugins && \
    cp -r /app/extensions/plugins/. /usr/share/nginx/html/plugins/

RUN chmod -R 755 /usr/share/nginx/html/*
COPY config/nginx.conf /etc/nginx/nginx.conf
COPY --from=base /usr/local/bin/mediamtx /usr/local/bin/mediamtx
COPY config/config.example.json /app/config.default.json

EXPOSE 80
EXPOSE 8888
EXPOSE 1935
CMD ["npm", "run", "start:prod"]