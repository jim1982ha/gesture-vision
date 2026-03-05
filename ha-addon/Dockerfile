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
COPY package.json package-lock.json* ./
RUN npm install --include=dev

FROM base AS builder
WORKDIR /app
ARG VITE_PROD_WHEP_BASE_URL
ARG VITE_PROD_HA_DEFAULT_URL
COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json* ./
COPY tsconfig.json ./tsconfig.json
COPY packages/ ./packages/
# Only copy local extensions. We DO NOT hardcode external clones here.
# Any built-in plugins must be present in the local filesystem before build context creation.
COPY extensions/ ./extensions/
COPY config/config.example.json ./config/config.example.json

RUN npm run build:backend
RUN npm run build:umd
RUN npm run build:app
ENV NODE_ENV=production
RUN npm prune --omit=dev

FROM base AS development
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json* ./
COPY tsconfig.json ./tsconfig.json
COPY packages/ ./packages/
COPY extensions/ ./extensions/
RUN npm run build:umd
RUN npm run copy:wasm
COPY --from=base /usr/local/bin/mediamtx /usr/local/bin/mediamtx
COPY config/config.example.json /app/config.default.json
EXPOSE 8000 8889 8554 9001
CMD ["npm", "run", "dev"]

FROM base AS production
WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY package.json .
COPY tsconfig.json .
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/extensions ./extensions
COPY --from=builder /app/packages/frontend/dist /usr/share/nginx/html/

# Prepare webroot for plugins, but do not pre-populate it aggressively.
# The entrypoint script will handle symlinking to persistent data.
RUN mkdir -p /usr/share/nginx/html/plugins && \
    chmod -R 755 /usr/share/nginx/html

# Internal Copy of Configs
RUN rm -f /etc/nginx/sites-enabled/default
COPY config/nginx.conf /etc/nginx/nginx.conf
COPY --from=base /usr/local/bin/mediamtx /usr/local/bin/mediamtx
COPY config/config.example.json /app/config.default.json
COPY ha-addon/docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# CRITICAL FIX for HA Backups & Plugin Resolution
# 1. We removed the symlink of /data/plugins/node_modules -> /app/node_modules to fix backup errors.
# 2. We enable --preserve-symlinks so Node resolves plugins via their symlinked path in /app/extensions/plugins.
#    This makes Node look for dependencies in /app/extensions/plugins/node_modules (fail), 
#    then /app/extensions/node_modules (fail), then /app/node_modules (SUCCESS!).
ENV NODE_OPTIONS="--preserve-symlinks"

EXPOSE 80 8888 1935
CMD ["npm", "run", "start:prod"]