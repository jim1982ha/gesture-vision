// Configuration ONLY for building the UMD library bundle for MediaPipe Tasks Vision
import { defineConfig } from "vite";
import path, { dirname } from "path";
import { fileURLToPath } from "url";

// Replicate __dirname for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default defineConfig({
  publicDir: false,
  build: {
    outDir: path.resolve(__dirname, "public/local-bundles"),
    sourcemap: true,
    emptyOutDir: true, // Keep true to clean the target directory
    lib: {
      entry: path.resolve(
        __dirname,
        "../../node_modules/@mediapipe/tasks-vision/vision_bundle.mjs"
      ),
      name: "MediaPipeTasksVision",
      formats: ["umd"],
      fileName: () => "mediapipe-tasks-vision-umd.js",
    },
    minify: false,
    rollupOptions: {},
  },
});
