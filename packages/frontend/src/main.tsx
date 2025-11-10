/* FILE: packages/frontend/src/main.tsx */
// Main entry point for the frontend application.
import React from 'react';
import ReactDOM from 'react-dom/client';
import { registerSW } from "virtual:pwa-register";
import { enableMapSet } from 'immer';

import { App } from './App.js';
import { initializeErrorHandlingService } from "./services/error-handling.service.js";
import { appStore } from './core/state/app-store.js';
import { TranslationService } from './services/translation.service.js';
import { PluginUIService } from './services/plugin-ui.service.js';
import ThemeManager from './services/theme-manager.js';
import { webSocketService } from './services/websocket-service.js';
import { createAppContext } from './contexts/appContextFactory.js';
import './index.css'; // Import Tailwind CSS entry point
import type { AppContextType } from './types/index.js';

declare global {
  interface Window {
    runtimeConfig?: Record<string, string | undefined>;
    appContext?: AppContextType;
  }
}

// --- Create Singleton Services and Context Here ---
const appContext = createAppContext();
// Assign the singleton services to the context
appContext.services.translationService = new TranslationService(appStore);
appContext.services.pluginUIService = new PluginUIService(appStore, appContext.services.translationService);
appContext.services.themeManager = new ThemeManager(appStore);
appContext.services.webSocketService = webSocketService;

async function initializeApplication() {
  enableMapSet();

  const rootElement = document.getElementById('root');
  if (!rootElement) {
    throw new Error("Fatal: #root element not found in index.html.");
  }

  initializeErrorHandlingService(appContext.services.translationService);

  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <App context={appContext} />
    </React.StrictMode>
  );

  registerSW({ immediate: true });
  
  const metaEnv = import.meta.env;
  if (metaEnv?.MODE === "development") {
    console.info("[Init] App initialized successfully (React Stack).");
  } else {
    console.info("[Init] App initialized successfully (React Stack).");
  }
}

async function main() {
  if (document.readyState === "loading") {
    await new Promise((resolve) =>
      document.addEventListener("DOMContentLoaded", resolve)
    );
  }
  await initializeApplication();
}

main().catch((e) => {
    console.error("FATAL: Failed to initialize application:", e);
    const errorDiv = document.createElement("div");
    errorDiv.style.color = "red";
    errorDiv.style.padding = "20px";
    errorDiv.style.fontFamily = "sans-serif";
    
    let errorMessage = 'An unknown error occurred.';
    let errorStack = '';
    if (e instanceof Error) {
        errorMessage = e.message;
        errorStack = e.stack || '';
    } else {
        errorMessage = String(e);
    }
    
    errorDiv.innerHTML = `<h1>Application Initialization Failed</h1><p>Error: ${errorMessage}. Check console.</p><pre>${errorStack}</pre>`;
    const root = document.getElementById('root');
    if (root) {
        root.innerHTML = '';
        root.appendChild(errorDiv);
    }
});