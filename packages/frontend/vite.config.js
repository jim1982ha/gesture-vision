/* FILE: packages/frontend/vite.config.js */
import dns from "dns";
import fs from "fs";
import path, { dirname } from "path";
import { fileURLToPath } from "url";

import { defineConfig, loadEnv } from "vite";
import basicSsl from "@vitejs/plugin-basic-ssl";
import { VitePWA } from "vite-plugin-pwa";
import { visualizer } from "rollup-plugin-visualizer";

// --- PROOF OF EXECUTION ---
console.log("\n\n\x1b[32m[VITE CONFIG] ✅ SUCCESS: Reading monolithic vite.config.js...\x1b[0m\n");

// --- CORE CONSTANTS & HELPERS ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = path.resolve(__dirname, '../..');
console.log(`\x1b[34m[VITE CONFIG] ℹ️  Project Root determined as: ${projectRoot}\x1b[0m`);

const packageJsonPath = path.join(projectRoot, "package.json");
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));
const baseAppVersion = packageJson.version || "0.0.0";
dns.setDefaultResultOrder("verbatim");

function readPartial(partialPath) {
  try {
    const fullPath = path.resolve(__dirname, `src/partials/${partialPath}`);
    // console.log(`\x1b[36m[VITE PARTIALS] 🔎 Reading partial: ${fullPath}\x1b[0m`);
    return fs.readFileSync(fullPath, "utf-8");
  } catch (error) {
    console.error(`\x1b[31m[VITE PARTIALS] ❌ Error loading partial: ${partialPath}. Error: ${error.message}\x1b[0m`);
    return `<!-- Error loading partial: ${partialPath}. -->`;
  }
}

// --- MAIN VITE CONFIGURATION ---
export default defineConfig(({ mode }) => {
  console.log(`\x1b[33m[VITE CONFIG] 🚀 defineConfig callback executing for mode: '${mode}'\x1b[0m`);
  
  const displayVersion = mode === "production" || mode === "apk" ? baseAppVersion : `${baseAppVersion}-dev`;
  const env = loadEnv(mode, projectRoot, "");
  const appBase = "/";
  const backendInternalPort = env.DEV_BACKEND_API_PORT_INTERNAL || "9001";
  
  // --- PLUGINS CONFIGURATION ---
  console.log(`\x1b[36m[VITE CONFIG] 🧩 Assembling Vite plugins...\x1b[0m`);
  const partialsInjectorPlugin = {
    name: "vite-plugin-partials-injector",
    enforce: "pre",
    transformIndexHtml(html) {
      const partials = {
        "<!-- general-settings-tab-inject -->": readPartial("_modal_settings_tab_general.html"),
        "<!-- plugins-settings-tab-inject -->": readPartial("_modal_settings_tab_plugins.html"),
        "<!-- rtsp-settings-tab-inject -->": readPartial("_modal_settings_tab_rtsp.html"),
        "<!-- theme-settings-tab-inject -->": readPartial("_modal_settings_tab_theme.html"),
        "<!-- custom-gestures-settings-tab-inject -->": readPartial("_modal_settings_tab_custom_gestures.html"),
        "<!-- header-inject -->": readPartial("_header.html"),
        "<!-- main-content-inject -->": readPartial("_main_content.html"),
        "<!-- history-sidebar-inject -->": readPartial("_history_sidebar.html"),
        "<!-- modal-camera-select-inject -->": readPartial("_modal_camera_select.html"),
        "<!-- modal-documentation-inject -->": readPartial("_modal_documentation.html"),
        "<!-- modal-gesture-alert-inject -->": readPartial("_modal_gesture_alert.html"),
        "<!-- modal-sidebar-backdrop-inject -->": readPartial("_modal_sidebar_backdrop.html"),
        "<!-- modal-confirmation-inject -->": readPartial("_modal_confirmation.html"),
        "<!-- modal-gesture-config-inject -->": readPartial("_modal_gesture_config.html"),
        "<!-- modal-settings-head-inject -->": readPartial("_modal_settings_head.html"),
        "<!-- modal-settings-footer-inject -->": readPartial("_modal_settings_footer.html"),
      };
      let transformedHtml = html;
      for (const placeholder in partials) {
        transformedHtml = transformedHtml.replace(placeholder, partials[placeholder]);
      }
      return transformedHtml;
    },
  };
  
  const plugins = [
    basicSsl(),
    partialsInjectorPlugin,
    visualizer({ filename: "./dist/stats.html", template: "treemap", open: false, gzipSize: true }),
  ];

  if (mode !== "apk") {
    plugins.push(VitePWA({
      workbox: {
        // Exclude large WASM files from being precached by the service worker.
        // The default limit is 2MB, and MediaPipe's WASM files are ~10MB.
        // They are loaded on-demand by the app and should not be precached.
        maximumFileSizeToCacheInBytes: 10 * 1024 * 1024, // 10 MB
      },
    }));
  }
  console.log(`\x1b[32m[VITE CONFIG] ✅ ${plugins.length} Vite plugins assembled.\x1b[0m`);

  // --- ALIAS & SERVER CONFIGURATION ---
  const aliasConfig = [
    { find: "#frontend", replacement: path.resolve(__dirname, "src") },
    { find: "#shared", replacement: path.resolve(__dirname, "../shared") },
    {
      find: /^\/plugins\//,
      replacement: path.resolve(projectRoot, "extensions/plugins/") + "/",
    },
  ];
  console.log("\x1b[34m[VITE CONFIG] 🔎 Final 'resolve.alias' configuration:\x1b[0m");
  console.dir(aliasConfig, { depth: null });

  const serverConfig = {
    https: true,
    host: "0.0.0.0",
    port: parseInt(env.DEV_VITE_PORT || "8001"),
    fs: {
      allow: [projectRoot],
    },
    proxy: {
      "/api": { target: `http://localhost:${backendInternalPort}`, changeOrigin: true, secure: false, ws: false },
      "/ws/": { target: `ws://localhost:${backendInternalPort}`, ws: true, changeOrigin: true, secure: false },
      "/whep-proxy": { target: `http://localhost:${env.MTX_DEV_WEBRTC_PORT || "8889"}`, changeOrigin: true, secure: false, rewrite: (p) => p.replace(/^\/whep-proxy/, "") },
    },
  };
  console.log("\x1b[34m[VITE CONFIG] 🌐 Final 'server' configuration:\x1b[0m");
  console.dir(serverConfig, { depth: null });

  // --- FINAL CONFIG OBJECT ---
  const finalConfig = {
    root: __dirname,
    base: appBase,
    publicDir: "public",
    envDir: projectRoot,
    envPrefix: "VITE_",
    plugins,
    define: {
      __APP_VERSION__: JSON.stringify(displayVersion),
    },
    resolve: {
      alias: aliasConfig,
    },
    server: serverConfig,
    build: {
      outDir: "dist",
      sourcemap: ! (mode === "production" || mode === "apk"),
      minify: mode === "production" || mode === "apk" ? "terser" : false,
      rollupOptions: {
        output: {
          entryFileNames: `assets/[name]-[hash].js`,
          chunkFileNames: `assets/[name]-[hash].js`,
          assetFileNames: (assetInfo) => {
            const name = assetInfo.name || "";
            if (name.includes("vision_wasm")) return "wasm/[name][extname]";
            if (name.endsWith(".task")) return "models/[name][extname]";
            return `assets/[name]-[hash][extname]`;
          },
        },
      },
    },
  };

  console.log("\x1b[32m[VITE CONFIG END] ✅ Returning final configuration object.\x1b[0m\n");
  return finalConfig;
});