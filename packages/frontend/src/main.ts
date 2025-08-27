/* FILE: packages/frontend/src/main.ts */
// Main entry point for the frontend application.
import { registerSW } from "virtual:pwa-register";

import { App } from "./core/app.js";
import { appStore } from "./core/state/app-store.js";
import { getAllDOMElements, type AllDOMElements } from "./core/dom-elements.js";
import { TranslationService } from "./services/translation.service.js";

declare global {
  // Allows for runtime-injected variables without hardcoding them.
  interface Window {
    app: App; // For development debugging
    runtimeConfig?: Record<string, string | undefined>;
  }
}

async function initializeApplication() {
  let appInstance: App | null = null;
  try {
    registerSW({ immediate: true });

    const translationService = new TranslationService();

    const elements: Partial<AllDOMElements> = getAllDOMElements();
    console.log("[Main] DOM elements fetched.");

    appInstance = new App(elements, appStore, translationService);

    await appInstance.initializeAppSequence();

    const metaEnv = import.meta.env;
    if (metaEnv?.MODE === "development") {
      window.app = appInstance;
      console.debug("[Main] App initialized (Dev Mode).");
    } else {
      console.debug("[Main] App initialized (Production Mode).");
    }
  } catch (error: unknown) {
    const typedError = error as Error;
    console.error("FATAL: Failed to initialize application:", typedError);
    const errorDiv = document.createElement("div");
    errorDiv.style.color = "red";
    errorDiv.style.padding = "20px";
    errorDiv.style.fontFamily = "sans-serif";
    errorDiv.innerHTML = `<h1>Application Initialization Failed</h1><p>Error: ${
      typedError.message
    }. Check console.</p><pre>${typedError.stack || ""}</pre>`;

    document.body.innerHTML = "";
    document.body.appendChild(errorDiv);
  }
}

async function main() {
  if (document.readyState === "loading") {
    await new Promise((resolve) =>
      document.addEventListener("DOMContentLoaded", resolve)
    );
    console.log("[Main] DOMContentLoaded event fired.");
  } else {
    console.log(
      "[Main] DOMContentLoaded has already fired or document is interactive/complete."
    );
  }
  await initializeApplication();
}

main().catch((e) => console.error("Top-level main() error:", e));