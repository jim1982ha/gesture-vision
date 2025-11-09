/* FILE: packages/frontend/src/hooks/useAppStore.ts */
import { useStore } from 'zustand';
import { appStore } from '#frontend/core/state/app-store.js';
import type { AppState } from '#frontend/core/state/app-store.js';

/**
 * Creates a React hook from the vanilla Zustand store.
 * Components can use this to subscribe to slices of the state and re-render automatically.
 * e.g., const manifests = useAppStore(state => state.pluginManifests);
 */
export const useAppStore = <T>(selector: (state: AppState) => T): T => {
    return useStore(appStore, selector);
};