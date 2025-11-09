/* FILE: packages/frontend/src/core/state/app-store.ts */
import { createStore, type StoreApi } from 'zustand/vanilla';
import { produce } from 'immer';
import type { InitialStatePayload } from '#shared/index.js';

import { createConfigSlice, type ConfigSlice } from './slices/configSlice.js';
import { createHistorySlice, type HistorySlice } from './slices/historySlice.js';
import { createPluginSlice, type PluginSlice } from './slices/pluginSlice.js';
import { createStatusSlice, type StatusSlice } from './slices/statusSlice.js';
import { createUiSlice, type UiSlice } from './slices/uiSlice.js';

export type AppStateSlices = ConfigSlice & HistorySlice & PluginSlice & StatusSlice & UiSlice;

// This combines the state properties and the nested actions objects
export type AppState = Omit<ConfigSlice, 'actions'> & Omit<HistorySlice, 'actions'> & Omit<PluginSlice, 'actions'> & Omit<StatusSlice, 'actions'> & Omit<UiSlice, 'actions'> & {
    actions:
        ConfigSlice['actions'] &
        HistorySlice['actions'] &
        PluginSlice['actions'] &
        StatusSlice['actions'] &
        UiSlice['actions'];
};

export type AppStore = StoreApi<AppState>;

// A specific type for the actions object that includes the dynamically added `setInitialState`
export type AppStoreActionsWithHydration = AppState['actions'] & {
    setInitialState: (payload: InitialStatePayload) => void;
};


const createAppStore = () => createStore<AppState>()((...a) => {
    const configSlice = createConfigSlice(...a);
    const historySlice = createHistorySlice(...a);
    const pluginSlice = createPluginSlice(...a);
    const statusSlice = createStatusSlice(...a);
    const uiSlice = createUiSlice(...a);

    return {
        ...configSlice,
        ...historySlice,
        ...pluginSlice,
        ...statusSlice,
        ...uiSlice,
        // Combine all actions from the different slices into a single 'actions' object
        actions: {
            ...configSlice.actions,
            ...historySlice.actions,
            ...pluginSlice.actions,
            ...statusSlice.actions,
            ...uiSlice.actions,
        },
    };
});

export const appStore = createAppStore();

// A special action to hydrate the store with initial data from the backend.
const setInitialState = (payload: InitialStatePayload) => {
  appStore.setState(produce((draft: AppState) => {
    // Apply global config
    Object.assign(draft, payload.globalConfig);
    // Set plugin manifests and configs
    draft.pluginManifests = payload.manifests;
    draft.pluginGlobalConfigs = new Map(Object.entries(payload.pluginConfigs));
    // Set custom gestures
    draft.customGestureMetadataList = payload.customGestureMetadata;
    // Mark as loaded
    draft.isInitialConfigLoaded = true;
  }));
};

// Expose this special action through the store instance, using the extended type.
(appStore.getState().actions as AppStoreActionsWithHydration).setInitialState = setInitialState;