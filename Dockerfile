# Dockerfile
# Dockerfile - Combined App + MediaMTX (Refactored for packages/ structure)

# ---- Stage 0: Base ----
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

# ---- Stage 1: Builder ----
    FROM base AS builder
    WORKDIR /app

    # Copy root package files first to leverage Docker cache for dependencies
    COPY package.json package-lock.json* ./
    COPY tsconfig.json ./tsconfig.json

    # Install ALL dependencies, including devDependencies for builds
    RUN npm ci --loglevel=error --include=dev

    # Copy all application source code
    COPY packages/ ./packages/
    COPY extensions/ ./extensions/
    # Copy configs needed for build steps
    COPY config/config.example.json ./config/config.example.json

    # Build all TypeScript projects defined in the root tsconfig.json
    RUN echo "--- Running consolidated build (tsc -b) ---" && npm run build:backend
    
    # Build the UMD bundle required by the frontend
    RUN echo "--- Running build:umd ---" && npm run build:umd

    # Build the final frontend application.
    RUN echo "--- Running build:app (Vite frontend build) ---" && npm run build:app

    # Prune devDependencies for final production image
    ENV NODE_ENV=production
    # --- MODIFICATION: Do NOT remove chokidar. It is needed by nodemon.
    RUN npm prune --production


# ---- Stage 2: Development ----
    FROM base AS development
    WORKDIR /app

    COPY package.json package-lock.json* ./
    COPY tsconfig.json ./tsconfig.json 
    
    # tsx and nodemon are now dependencies, so they will be installed
    RUN npm ci --loglevel=error

    # Copy all source code BEFORE running scripts that depend on it.
    COPY packages/ ./packages/
    COPY extensions/ ./extensions/
    
    # Now that the source and dependencies are present, build/copy required assets.
    RUN npm run build:umd
    RUN npm run copy:wasm

    COPY --from=base /usr/local/bin/mediamtx /usr/local/bin/mediamtx
    
    # Copy config.example.json from the build context.
    COPY config/config.example.json /app/config.default.json
    
    EXPOSE 8000 8889 8554 9001
    CMD ["npm", "run", "dev"]


# ---- Stage 3: Production (Final) ----
    FROM base AS production
    WORKDIR /app

    # Copy production node_modules from builder
    COPY --from=builder /app/node_modules ./node_modules
    
    # Copy essential runtime files
    COPY package.json .
    COPY tsconfig.json .

    # Copy all TypeScript sources needed for tsx to run
    COPY --from=builder /app/packages ./packages
    
    # Copy extensions dir which contains raw .ts files for on-the-fly compiling
    COPY --from=builder /app/extensions ./extensions

    # Copy the fully bundled frontend application from the builder stage
    COPY --from=builder /app/packages/frontend/dist /usr/share/nginx/html/
    
    # FIX: Correctly copy plugin assets into an 'assets' subdirectory for each plugin
    # This aligns the file structure with the URLs requested by the frontend and expected by Nginx.
    RUN mkdir -p /usr/share/nginx/html/plugins/ && \
        cd /app/extensions/plugins && \
        for plugin_dir in */; do \
          if [ -d "$plugin_dir" ]; then \
            plugin_id=$(basename "$plugin_dir"); \
            dest_dir="/usr/share/nginx/html/plugins/$plugin_id/assets/"; \
            mkdir -p "$dest_dir"; \
            if [ -d "${plugin_dir}frontend" ]; then cp -r "${plugin_dir}frontend" "$dest_dir"; fi; \
            if [ -d "${plugin_dir}locales" ]; then cp -r "${plugin_dir}locales" "$dest_dir"; fi; \
            if [ -f "${plugin_dir}plugin.json" ]; then cp "${plugin_dir}plugin.json" "$dest_dir"; fi; \
          fi; \
        done

    # Ensure Nginx base directory has correct permissions
    RUN chmod -R 755 /usr/share/nginx/html/*

    COPY config/nginx.conf /etc/nginx/nginx.conf
    COPY --from=base /usr/local/bin/mediamtx /usr/local/bin/mediamtx

    # BEST PRACTICE: Copy config.example.json as a fallback default.
    COPY config/config.example.json /app/config.default.json

    EXPOSE 80
    EXPOSE 8888
    EXPOSE 1935
    CMD ["npm", "run", "start:prod"]