/* FILE: packages/frontend/postcss.config.js */
import postcssPurgecssLib from "@fullhuman/postcss-purgecss";
import autoprefixer from "autoprefixer";
import cssnano from "cssnano";

const actualPurgeCssFunction =
  typeof postcssPurgecssLib === "function"
    ? postcssPurgecssLib
    : typeof postcssPurgecssLib.default === "function"
    ? postcssPurgecssLib.default
    : null;

export default (ctx) => {
  const plugins = [autoprefixer()];

  if (ctx.env === "production") {
    if (actualPurgeCssFunction) {
      plugins.push(
        actualPurgeCssFunction({
          content: [
            "./index.html",
            "./src/partials/**/*.html",
            "./src/**/*.js",
            "./src/**/*.ts",
            "../backend/custom_gestures/**/*.js",
            "../../extensions/plugins/**/*.js",
          ],
          defaultExtractor: (content) => {
            const broadMatches = content.match(/[\w-/:]+(?<!:)/g) || [];
            const classAttributeMatches =
              content.match(/class\s*=\s*["']([^"']+)["']/g) || [];
            const extractedClassAttributes = classAttributeMatches.flatMap(
              (match) => {
                const classString = match.substring(
                  match.indexOf(/["']/) + 1,
                  match.lastIndexOf(/["']/)
                );
                return classString.split(/\s+/).filter(Boolean);
              }
            );
            return broadMatches.concat(extractedClassAttributes);
          },
          safelist: {
            // Added regex patterns to safelist dynamically generated classes for sidebars and modals.
            // This prevents PurgeCSS from removing them in production builds.
            standard: [
              /sidebar-active$/, // Safelists 'config-sidebar-active' and 'history-sidebar-active'
              /modal-.*-open$/, // Safelists 'modal-main-settings-open', 'modal-docs-open', etc.
              /body\.modal-open/,
              /body\.config-sidebar-active/,
              /body\.history-sidebar-active/,
              /body\.source-rtsp/,
              /body\.source-webcam/,
              /^theme-\w+-\w+$/,
              /data-theme.*/,
              "visible",
              "active",
              "hidden",
              "connecting",
              "connected",
              "disconnected",
              "editing",
              "pulse-active",
              "btn-primary",
              "btn-secondary",
              "btn-success",
              "btn-danger",
              "btn-icon",
              "btn-icon-primary",
              "btn-icon-danger",
              "btn-list-item",
              "config-item-disabled",
              "modal-camera-select-open",
              "modal-main-settings-open",
              "modal-docs-open",
              "material-icons",
              "mdi",
              /^mdi-[\w-]+/,
              "info",
              "success",
              "warning",
              "error",
              "stream-status-indicator",
            ],
            deep: [/docs-content-modal/, /modalTocList/],
            greedy: [],
            keyframes: true,
            variables: true,
          },
        })
      );
    } else {
      console.warn(
        "PurgeCSS function could not be resolved. Skipping PurgeCSS."
      );
    }
    plugins.push(cssnano({ preset: "default" }));
  }
  return { plugins };
};