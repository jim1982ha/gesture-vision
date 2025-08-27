/* FILE: packages/frontend/vite-env.d.ts */
/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

// The Screen Orientation API's lock() and unlock() methods are not yet
// in the default TypeScript DOM library. This declaration file adds them
// to the existing ScreenOrientation interface to prevent TypeScript errors
// and provide type safety when using these experimental features.
// See: https://developer.mozilla.org/en-US/docs/Web/API/ScreenOrientation
interface ScreenOrientation extends EventTarget {
  lock?(orientation: OrientationLockType): Promise<void>;
  unlock?(): void;
}

// Allows for runtime-injected variables without hardcoding them.
// Plugins that need specific variables should safely access them, e.g.,
// const haUrl = window.runtimeConfig?.HA_URL;
interface Window {
runtimeConfig?: Record<string, string | undefined>;
}

// Augment Vite's ImportMeta interface for env and hot module replacement
interface ImportMeta {
readonly env: Record<string, unknown>;
readonly hot?: {
  dispose: (callback: (data: Record<string, unknown>) => void) => void;
};
}