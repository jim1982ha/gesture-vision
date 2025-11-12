/* FILE: packages/frontend/src/core/state/slices/pluginSlice.ts */
import type { StateCreator } from 'zustand';
import { produce } from 'immer';
import { pubsub, PLUGIN_CONFIG_UPDATED_EVENT_PREFIX, type PluginManifest, type EnrichedCustomGestureMetadata } from '#shared/index.js';

export interface PluginSlice {
  pluginManifests: PluginManifest[];
  pluginGlobalConfigs: Map<string, unknown>;
  pluginExtDataCache: Map<string, unknown>;
  customGestureMetadataList: EnrichedCustomGestureMetadata[];

  actions: {
    setPluginManifests: (manifests: PluginManifest[]) => void;
    setPluginGlobalConfig: (pluginId: string, config: unknown) => void;
    setPluginExtData: (pluginId: string, data: unknown) => void;
    clearPluginExtData: (pluginId: string) => void;
    setCustomGestureMetadata: (metadata: EnrichedCustomGestureMetadata[]) => void;
  };
}

export const createPluginSlice: StateCreator<PluginSlice, [], [], PluginSlice> = (set) => ({
  pluginManifests: [],
  pluginGlobalConfigs: new Map<string, unknown>(),
  pluginExtDataCache: new Map<string, unknown>(),
  customGestureMetadataList: [],
  actions: {
    setPluginManifests: (manifests) => set({ pluginManifests: manifests }),
    
    setPluginGlobalConfig: (pluginId, config) => {
      set(produce((draft: PluginSlice) => {
        draft.pluginGlobalConfigs.set(pluginId, config);
      }));
      pubsub.publish(`${PLUGIN_CONFIG_UPDATED_EVENT_PREFIX}${pluginId}`, config);
    },
  
    setPluginExtData: (pluginId, data) => set(produce((draft: PluginSlice) => {
      draft.pluginExtDataCache.set(pluginId, data);
    })),
  
    clearPluginExtData: (pluginId) => set(produce((draft: PluginSlice) => {
      draft.pluginExtDataCache.delete(pluginId);
    })),
  
    setCustomGestureMetadata: (metadata) => set({ customGestureMetadataList: metadata }),
  }
});