# --- Dockerfile --- (complete version) ---
# Dockerfile - Standalone Production & Development
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
COPY extensions/ ./extensions/
COPY config/gesturevision.example.json ./config/config.example.json
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
COPY config/gesturevision.example.json /app/config.default.json
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
RUN mkdir -p /usr/share/nginx/html/plugins
RUN for plugin_dir in /app/extensions/plugins/*; do \
      if [ -d "$plugin_dir" ]; then \
        plugin_id=$(basename "$plugin_dir"); \
        dest_dir="/usr/share/nginx/html/plugins/$plugin_id"; \
        mkdir -p "$dest_dir"; \
        if [ -d "$plugin_dir/frontend" ]; then cp -r "$plugin_dir/frontend" "$dest_dir/"; fi; \
        if [ -d "$plugin_dir/locales" ]; then cp -r "$plugin_dir/locales" "$dest_dir/"; fi; \
        if [ -f "$plugin_dir/plugin.json" ]; then cp "$plugin_dir/plugin.json" "$dest_dir/"; fi; \
      fi; \
    done
RUN chmod -R 755 /usr/share/nginx/html/*
COPY config/nginx.conf /etc/nginx/nginx.conf
COPY --from=base /usr/local/bin/mediamtx /usr/local/bin/mediamtx
COPY config/gesturevision.example.json /app/config.default.json

EXPOSE 80 8888 1935
CMD ["npm", "run", "start:prod"]