// packages/frontend/vite.config.js
import dns from "dns";
import fs from "fs";
import path, { dirname } from "path";
import { fileURLToPath } from "url";

import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import basicSsl from "@vitejs/plugin-basic-ssl";
import { VitePWA } from "vite-plugin-pwa";
import { visualizer } from "rollup-plugin-visualizer";

// --- CORE CONSTANTS & HELPERS ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = path.resolve(__dirname, '../..');
const packageJsonPath = path.join(projectRoot, "package.json");
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));
const baseAppVersion = packageJson.version || "0.0.0";
dns.setDefaultResultOrder("verbatim");

// --- MAIN VITE CONFIGURATION ---
export default defineConfig(({ mode }) => {
  const displayVersion = mode === "production" || mode === "apk" ? baseAppVersion : `${baseAppVersion}-dev`;
  const env = loadEnv(mode, projectRoot, "");
  const appBase = "/";
  const backendInternalPort = env.DEV_BACKEND_API_PORT_INTERNAL || "9001";
  
  const plugins = [
    react({ include: "**/*.{ts,tsx}" }),
    basicSsl(),
    visualizer({ filename: "./dist/stats.html", template: "treemap", open: false, gzipSize: true }),
  ];

  if (mode !== "apk") {
    plugins.push(VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webp,woff2,task,json}'],
        globIgnores: ['**/models/*.task'],
      },
      manifest: false,
    }));
  }

  return {
    root: __dirname,
    base: appBase,
    publicDir: "public",
    envDir: projectRoot,
    envPrefix: "VITE_",
    plugins,
    define: { __APP_VERSION__: JSON.stringify(displayVersion) },
    resolve: {
      alias: [
        { find: "#frontend", replacement: path.resolve(__dirname, "src") },
        { find: "#shared", replacement: path.resolve(__dirname, "../shared") },
        { find: "#plugins", replacement: path.resolve(projectRoot, "extensions/plugins") },
      ],
    },
    server: {
      https: true,
      host: "0.0.0.0",
      port: parseInt(env.DEV_VITE_PORT || "8001"),
      fs: { allow: [projectRoot] },
      watch: {
        usePolling: true,
      },
      proxy: {
        "/api": { target: `http://localhost:${backendInternalPort}`, changeOrigin: true, secure: false },
        "/ws/": { target: `ws://localhost:${backendInternalPort}`, ws: true, changeOrigin: true, secure: false },
        "/whep-proxy": { target: `http://localhost:${env.MTX_DEV_WEBRTC_PORT || "8889"}`, changeOrigin: true, secure: false, rewrite: (p) => p.replace(/^\/whep-proxy/, "") },
        "/plugins": {
          target: `http://localhost:${backendInternalPort}`,
          changeOrigin: true,
          secure: false,
          rewrite: (p) => `/extensions${p}`
        },
      },
    },
    worker: { format: 'iife' },
    build: {
      outDir: "dist",
      sourcemap: !(mode === "production" || mode === "apk"),
      minify: mode === "production" || mode === "apk" ? "terser" : false,
      rollupOptions: {
        input: {
          main: path.resolve(__dirname, 'index.html'),
        },
        output: {
          entryFileNames: `assets/[name]-[hash].js`,
          chunkFileNames: `assets/[name]-[hash].js`,
          assetFileNames: (assetInfo) => {
            const name = assetInfo.names?.name || "";
            if (name.includes("vision_wasm")) return "wasm/[name][extname]";
            if (name.endsWith(".task")) return "models/[name][extname]";
            return `assets/[name]-[hash][extname]`;
          },
        },
      },
    },
  };
});