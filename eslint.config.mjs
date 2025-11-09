/* FILE: eslint.config.mjs */
import path from "path";
import { fileURLToPath } from "url";

import globals from "globals";
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactRecommended from "eslint-plugin-react/configs/recommended.js";
import reactJsxRuntime from "eslint-plugin-react/configs/jsx-runtime.js";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";

// Boilerplate to get __dirname in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default [
  // 0. Global ignores
  {
    ignores: [
      "node_modules/",
      "packages/frontend/public/vendor/",
      "packages/frontend/public/local-bundles/",
      "packages/frontend/public/wasm/",
      "packages/frontend/android/",
      "packages/frontend/ios/",
      "extensions/custom_gestures/**/*.js",
      "packages/frontend/vite.config.umd.js",
      "packages/frontend/tailwind.config.js",
      "packages/frontend/postcss.config.cjs",
      "*.config.js",
      "dev-dist/workbox-*.js",
      "android/",
      "dev-dist/",
      "dist/",
      "dist-backend/",
      "packages/*/node_modules/",
      "packages/*/dist/",
      "packages/*/dist-*",
      "packages/*/dev-dist/",
      "packages/shared/dist-types/",
      "**/*.js.map",
      "**/*.d.ts.map",
      "**/*.d.ts",
      "*.tsbuildinfo",
      "coverage/",
      "packages/*/coverage/",
      "extensions/plugins/**/backend.plugin.js",
    ],
  },
  // This eslint.config.mjs itself if it's at the root
  {
    ignores: ["eslint.config.mjs"],
  },

  // 1. Base JavaScript configuration
  js.configs.recommended,
  {
    files: ["**/*.js", "**/*.mjs", "**/*.cjs"],
    rules: {
      "no-undef": "warn",
      "no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
  },

  // 2. --- React/JSX Specific ---
  { ...reactRecommended, files: ["packages/frontend/src/**/*.tsx", "extensions/plugins/**/*.tsx"] },
  { ...reactJsxRuntime, files: ["packages/frontend/src/**/*.tsx", "extensions/plugins/**/*.tsx"] },
  {
    files: ["packages/frontend/src/**/*.tsx", "extensions/plugins/**/*.tsx"],
    plugins: { 
      "react-refresh": reactRefresh,
      "react-hooks": reactHooks,
    },
    rules: {
        ...reactHooks.configs.recommended.rules,
        "react-refresh/only-export-components": "warn",
        "react/prop-types": "off"
    },
    settings: {
        react: {
            version: "detect"
        }
    }
  },

  // 3. TypeScript configuration
  ...tseslint.config({
    files: ["packages/**/*.ts", "packages/**/*.tsx", "extensions/plugins/**/*.ts", "extensions/plugins/**/*.tsx"],
    extends: [...tseslint.configs.recommended],
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
      "no-case-declarations": "off",
      "prefer-const": "warn",
    },
    languageOptions: {
      parserOptions: {
        project: true,
        projectService: true,
        tsconfigRootDir: __dirname,
        ecmaVersion: "latest",
        sourceType: "module",
      },
      globals: {
        ...globals.node,
        ...globals.browser,
        __APP_VERSION__: "readonly",
        MediaPipeTasksVision: "readonly",
        DOMPurify: "readonly",
        marked: "readonly",
        NodeJS: "readonly",
      },
    },
  }),

  // 4. Frontend Specific Overrides
  {
    files: [
      "packages/frontend/src/**/*.ts",
      "packages/frontend/src/**/*.tsx",
      "extensions/plugins/**/frontend/**/*.ts",
      "extensions/plugins/**/frontend/**/*.tsx",
    ],
    rules: {},
    languageOptions: {
      parserOptions: {
        project: true,
        projectService: true,
        tsconfigRootDir: __dirname,
      },
      globals: {
        ...globals.browser,
        __APP_VERSION__: "readonly",
        MediaPipeTasksVision: "readonly",
        DOMPurify: "readonly",
        marked: "readonly",
        RTCPeerConnection: "readonly",
        RTCSessionDescription: "readonly",
        ImageData: "readonly",
        OffscreenCanvas: "readonly",
        localStorage: "readonly",
        fetch: "readonly",
        URL: "readonly",
        AbortController: "readonly",
        AbortSignal: "readonly",
      },
    },
  },

  // 5. Backend Specific Overrides
  {
    files: [
      "packages/backend/src/**/*.ts",
      "extensions/plugins/**/backend.plugin.ts",
      "extensions/plugins/**/action-handler.*.ts",
      "extensions/plugins/**/helpers/**/*.ts",
    ],
    rules: {},
    languageOptions: {
      parserOptions: {
        project: true,
        projectService: true,
        tsconfigRootDir: __dirname,
      },
      globals: { ...globals.node },
    },
  },

  // 6. Worker File Specific
  {
    files: ["packages/frontend/src/workers/**/*.js"],
    languageOptions: {
      globals: {
        ...globals.worker,
        self: "readonly",
        MediaPipeTasksVision: "readonly",
        TextDecoder: "readonly",
        TextEncoder: "readonly",
        ImageData: "readonly",
        OffscreenCanvas: "readonly",
        console: "readonly",
        performance: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        setInterval: "readonly",
        clearInterval: "readonly",
        importScripts: "readonly",
        URL: "readonly",
        Promise: "readonly",
        Map: "readonly",
        Set: "readonly",
        Error: "readonly",
        DOMException: "readonly",
        Object: "readonly",
        Array: "readonly",
        JSON: "readonly",
        Math: "readonly",
        Number: "readonly",
        String: "readonly",
        Function: "readonly",
        RegExp: "readonly",
      },
    },
    rules: {
      ...js.configs.recommended.rules,
      "no-restricted-globals": ["error", "window", "document"],
      "no-implied-eval": "off",
      "no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
      "no-prototype-builtins": "off",
    },
  },
];