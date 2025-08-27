/* FILE: packages/frontend/vite.config.js */
import dns from "dns";
import fs from "fs";
import path, { dirname } from "path";
import { fileURLToPath } from "url";

import basicSsl from "@vitejs/plugin-basic-ssl";
import { visualizer } from "rollup-plugin-visualizer";
import { defineConfig, loadEnv } from "vite";
import { VitePWA } from "vite-plugin-pwa";

const packageJsonPath = path.resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../package.json"
);
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dns.setDefaultResultOrder("verbatim");
const baseAppVersion = packageJson.version || "0.0.0";

function readPartialForVitePluginHtml(partialPath) {
  try {
    const fullPath = path.resolve(__dirname, `src/partials/${partialPath}`);
    return fs.readFileSync(fullPath, "utf-8");
  } catch (error) {
    const errorMessage =
      error && typeof error === "object" && "message" in error
        ? String(error.message)
        : String(error);
    console.error(
      `Error loading partial: ${partialPath}. Error: ${errorMessage}`
    );
    return `<!-- Error loading partial: ${partialPath}. -->`;
  }
}

function manualPartialsInjectorPlugin() {
  const partialsToInject = {
    "<!-- general-settings-tab-inject -->": readPartialForVitePluginHtml(
      "_modal_settings_tab_general.html"
    ),
    "<!-- integrations-settings-tab-inject -->": readPartialForVitePluginHtml(
      "_modal_settings_tab_integrations.html"
    ),
    "<!-- plugins-settings-tab-inject -->": readPartialForVitePluginHtml(
      "_modal_settings_tab_plugins.html"
    ),
    "<!-- rtsp-settings-tab-inject -->": readPartialForVitePluginHtml(
      "_modal_settings_tab_rtsp.html"
    ),
    "<!-- theme-settings-tab-inject -->": readPartialForVitePluginHtml(
      "_modal_settings_tab_theme.html"
    ),
    "<!-- custom-gestures-settings-tab-inject -->":
      readPartialForVitePluginHtml("_modal_settings_tab_custom_gestures.html"),
    "<!-- header-inject -->": readPartialForVitePluginHtml("_header.html"),
    "<!-- main-content-inject -->":
      readPartialForVitePluginHtml("_main_content.html"),
    "<!-- config-sidebar-inject -->": readPartialForVitePluginHtml(
      "_config_sidebar.html"
    ),
    "<!-- history-sidebar-inject -->": readPartialForVitePluginHtml(
      "_history_sidebar.html"
    ),
    "<!-- modal-camera-select-inject -->": readPartialForVitePluginHtml(
      "_modal_camera_select.html"
    ),
    "<!-- modal-documentation-inject -->": readPartialForVitePluginHtml(
      "_modal_documentation.html"
    ),
    "<!-- modal-gesture-alert-inject -->": readPartialForVitePluginHtml(
      "_modal_gesture_alert.html"
    ),
    "<!-- modal-sidebar-backdrop-inject -->": readPartialForVitePluginHtml(
      "_modal_sidebar_backdrop.html"
    ),
    "<!-- bottom-nav-inject -->":
      readPartialForVitePluginHtml("_bottom_nav.html"),
    "<!-- modal-confirmation-inject -->": readPartialForVitePluginHtml(
      "_modal_confirmation.html"
    ),
    "<!-- modal-settings-head-inject -->": readPartialForVitePluginHtml(
      "_modal_settings_head.html"
    ),
    "<!-- modal-settings-footer-inject -->": readPartialForVitePluginHtml(
      "_modal_settings_footer.html"
    ),
  };
  return {
    name: "vite-plugin-manual-partials-injector",
    enforce: "pre",
    transformIndexHtml(html) {
      let transformedHtml = html;
      for (const placeholder in partialsToInject)
        transformedHtml = transformedHtml.replace(
          placeholder,
          partialsToInject[placeholder]
        );
      return transformedHtml;
    },
  };
}

export default defineConfig(({ _command, mode }) => {
  let displayVersion =
    mode === "production" || mode === "apk"
      ? baseAppVersion
      : `${baseAppVersion}-dev`;
  const rootDirForEnv = path.resolve(__dirname, "../../");
  const env = loadEnv(mode, rootDirForEnv, "");
  const appBase = "/";
  const pwaManifestOptions = {
    name: "GestureVision",
    short_name: "GestureV",
    description: "AI Gesture Recognition WebApp",
    theme_color: env.VITE_THEME_COLOR || "#2A9D8F",
    background_color: env.VITE_BACKGROUND_COLOR || "#ffffff",
    display: "standalone",
    display_override: ["window-controls-overlay"],
    scope: appBase,
    start_url: appBase,
    orientation: "any",
    protocol_handler: {
      protocol: "web+gesturevision",
      url: "/#action-%s",
    },
    protocol_handlers: [
      {
        protocol: "web+gesturevision",
        url: "/#action-%s",
      },
    ],
    screenshots: [
      {
        src: `${appBase}images/gesturevision_dark.webp`,
        sizes: "1920x1055",
        type: "image/webp",
        form_factor: "wide",
        label: "Desktop Dark Mode",
      },
      {
        src: `${appBase}images/gesturevision_light.webp`,
        sizes: "1920x1055",
        type: "image/webp",
        form_factor: "wide",
        label: "Desktop Light Mode",
      },
      {
        src: `${appBase}images/gesturevision_mobile.webp`,
        sizes: "480x985",
        type: "image/webp",
        form_factor: "narrow",
        label: "Mobile View",
      },
    ],
    icons: [
      {
        src: `${appBase}icons/icon-128.webp`,
        type: "image/webp",
        sizes: "128x128",
        purpose: "any",
      },
      {
        src: `${appBase}icons/icon-192.webp`,
        type: "image/webp",
        sizes: "192x192",
        purpose: "any",
      },
      {
        src: `${appBase}icons/icon-256.webp`,
        type: "image/webp",
        sizes: "256x256",
        purpose: "any",
      },
      {
        src: `${appBase}icons/icon-512.webp`,
        type: "image/webp",
        sizes: "512x512",
        purpose: "any",
      },
      {
        src: `${appBase}icons/icon-512.webp`,
        type: "image/webp",
        sizes: "512x512",
        purpose: "maskable",
      },
    ],
  };
  const pluginsToUse = [
    basicSsl(),
    manualPartialsInjectorPlugin(),
    visualizer({
      filename: "./dist/stats-treemap.html",
      template: "treemap",
      open: false,
      gzipSize: true,
      brotliSize: true,
    }),
    visualizer({
      filename: "./dist/stats-sunburst.html",
      template: "sunburst",
      open: false,
      gzipSize: true,
      brotliSize: true,
    }),
    visualizer({
      filename: "./dist/stats-network.html",
      template: "network",
      open: false,
      gzipSize: true,
      brotliSize: true,
    }),
  ];
  if (mode !== "apk") {
    pluginsToUse.push(
      VitePWA({
        registerType: "autoUpdate",
        injectRegister: "script", 
        manifest: pwaManifestOptions,
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg,webp,woff2,ttf,eot,webmanifest,json}'],
          globIgnores: [
            '**/wasm/**',
            '**/models/**',
            '**/docs/**',
            'stats-*.html'
          ],
          navigateFallback: 'index.html',
          cleanupOutdatedCaches: true, 
          maximumFileSizeToCacheInBytes: 15 * 1024 * 1024,
          skipWaiting: true,
          clientsClaim: true,
          runtimeCaching: [
            {
              urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
              handler: 'CacheFirst',
              options: { cacheName: 'google-fonts-stylesheets', expiration: { maxEntries: 10, maxAgeSeconds: 31536000 } },
            },
            {
              urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
              handler: 'CacheFirst',
              options: { cacheName: 'google-fonts-webfonts', cacheableResponse: { statuses: [0, 200] }, expiration: { maxEntries: 30, maxAgeSeconds: 31536000 } },
            },
            {
              urlPattern: ({ url }) => url.pathname.startsWith('/models/'),
              handler: 'CacheFirst',
              options: { cacheName: 'mediapipe-models-cache', expiration: { maxEntries: 5, maxAgeSeconds: 31536000 } }
            },
            {
              urlPattern: ({ url }) => url.pathname.startsWith('/wasm/'),
              handler: 'CacheFirst',
              options: { cacheName: 'mediapipe-wasm-cache', expiration: { maxEntries: 10, maxAgeSeconds: 31536000 } }
            },
            {
              urlPattern: ({ url }) => url.pathname.startsWith('/local-bundles/'),
              handler: 'CacheFirst',
              options: { cacheName: 'mediapipe-bundle-cache', expiration: { maxEntries: 5, maxAgeSeconds: 31536000 } }
            },
            {
              urlPattern: ({ url }) => url.pathname.startsWith('/vendor/'),
              handler: 'CacheFirst',
              options: { cacheName: 'vendor-assets-cache', expiration: { maxEntries: 10, maxAgeSeconds: 31536000 } }
            },
          ],
        },
      })
    );
  }

  const backendInternalPort = env.DEV_BACKEND_API_PORT_INTERNAL || "9001";

  return {
    root: __dirname, // This is packages/frontend
    base: appBase,
    publicDir: "public",
    define: {
      __APP_VERSION__: JSON.stringify(displayVersion),
      "import.meta.env.VITE_MTX_DEV_WEBRTC_PORT": JSON.stringify(
        env.MTX_DEV_WEBRTC_PORT || "8889"
      ),
      ...(mode === "apk" &&
        env.VITE_PROD_API_BASE_URL && {
          "import.meta.env.VITE_PROD_API_BASE_URL": JSON.stringify(
            env.VITE_PROD_API_BASE_URL
          ),
        }),
    },
    envDir: rootDirForEnv,
    envPrefix: "VITE_",
    plugins: pluginsToUse,
    worker: {
      format: "iife",
      rollupOptions: {
        output: {
          entryFileNames: `assets/worker.[name]-[hash].js`,
          chunkFileNames: `assets/worker.chunk.[name]-[hash].js`,
        },
      },
    },
    optimizeDeps: {
      include: ["zod"],
    },
    server: {
      https: true,
      host: "0.0.0.0",
      port: parseInt(env.DEV_VITE_PORT || "8001"),
      watch: {
        ignored: ["public/local-bundles/**"],
        usePolling: true,
        interval: 100,
      },
      proxy: {
        "/api": {
          target: `http://localhost:${backendInternalPort}`,
          changeOrigin: true,
          secure: false,
          ws: false,
        },
        "/ws/": {
          target: `ws://localhost:${backendInternalPort}`,
          ws: true,
          changeOrigin: true,
          secure: false,
        },
        "/whep-proxy": {
          target: `http://localhost:${env.MTX_DEV_WEBRTC_PORT || "8889"}`,
          changeOrigin: true,
          secure: false,
          rewrite: (path) => path.replace(/^\/whep-proxy/, ""),
        },
      },
    },
    build: {
      outDir: "dist",
      sourcemap: mode === "production" || mode === "apk" ? false : true,
      minify: mode === "production" || mode === "apk" ? "terser" : false,
      terserOptions:
        mode === "production" || mode === "apk"
          ? { compress: { drop_console: false, drop_debugger: true } }
          : undefined,
      assetsInlineLimit: 0,
      chunkSizeWarningLimit: 700,
      rollupOptions: {
        output: {
          entryFileNames: `assets/[name]-[hash].js`,
          chunkFileNames: `assets/[name]-[hash].js`,
          assetFileNames: (assetInfo) => {
            const name = assetInfo.name || "";
            if (name.includes("vision_wasm")) return "wasm/[name][extname]";
            if (name.endsWith(".task")) return "models/[name][extname]";
            if (name.includes("mediapipe-tasks-vision-umd"))
              return "local-bundles/[name][extname]";
            return `assets/[name]-[hash][extname]`;
          },
        },
      },
    },
    css: { postcss: "./postcss.config.js" },
    resolve: {
      alias: {
        "#frontend": path.resolve(__dirname, "src"),
        "#shared": path.resolve(__dirname, "../shared"),
        "#plugins": path.resolve(__dirname, "../../extensions/plugins"),
      },
    },
  };
});