/* FILE: packages/frontend/src/core/state/app-store.ts */
import { createStore, type StoreApi } from 'zustand/vanilla';
import { produce } from 'immer';
import { enrichGestureConfigs, enrichCustomGestureMetadata } from './utils/enrichment.utils.js';
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
        ...configSlice, ...historySlice, ...pluginSlice, ...statusSlice, ...uiSlice,
        actions: { ...configSlice.actions, ...historySlice.actions, ...pluginSlice.actions, ...statusSlice.actions, ...uiSlice.actions },
    };
});

export const appStore = createAppStore();

const setInitialState = (payload: InitialStatePayload) => {
  appStore.setState(produce((draft: AppState) => {
    const enrichedCustomMetadata = enrichCustomGestureMetadata(payload.customGestureMetadata);
    Object.assign(draft, { ...payload.globalConfig });
    draft.pluginManifests = payload.manifests;
    draft.pluginGlobalConfigs = new Map(Object.entries(payload.pluginConfigs));
    draft.customGestureMetadataList = enrichedCustomMetadata;
    draft.gestureConfigs = enrichGestureConfigs(payload.globalConfig.gestureConfigs, enrichedCustomMetadata);
    draft.isInitialConfigLoaded = true;
  }));
};

(appStore.getState().actions as AppStoreActionsWithHydration).setInitialState = setInitialState;