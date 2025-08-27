/* FILE: packages/frontend/src/core/state/app-store.ts */
import { createStore } from 'zustand/vanilla';

import {
  PreferenceService,
  type PreferenceKey,
  type PreferenceValue,
} from '#frontend/services/preference.service.js';
import { webSocketService } from '#frontend/services/websocket-service.js';

import {
  UI_EVENTS,
  PLUGIN_CONFIG_UPDATED_EVENT_PREFIX,
} from '#shared/constants/index.js';
import { pubsub } from '#shared/core/pubsub.js';

import type {
  FullConfiguration,
  InitialStatePayload,
  CustomGestureMetadata,
  PluginManifest,
  ActionResultPayload,
  ConfigPatchAckPayload,
} from '#shared/types/index.js';
import type { ThemePreference, HistoryEntry } from '#frontend/types/index.js';
import { MAX_HISTORY_ITEMS } from '#frontend/constants/app-defaults.js';

export type FrontendFullState = FullConfiguration & {
  numHandsPreference: number;
  processingResolutionWidthPreference: number;
  languagePreference: string;
  themePreference: ThemePreference;
  showHandLandmarks: boolean;
  showPoseLandmarks: boolean;
  performanceMetrics: { fps: number; processingTime: number; memory: number };
  streamStatus: Map<string, string>;
  isInitialConfigLoaded: boolean;
  _wsConnected: boolean;
  customGestureMetadataList: CustomGestureMetadata[];
  pluginManifests: PluginManifest[];
  pluginGlobalConfigs: Map<string, unknown>;
  pluginExtDataCache: Map<string, unknown>;
  historyEntries: HistoryEntry[];
};

const preferenceService = new PreferenceService();

const getInitialState = (): FrontendFullState => ({
  globalCooldown: 2.0,
  rtspSources: [],
  gestureConfigs: [],
  targetFpsPreference: 15,
  telemetryEnabled: false,
  enableCustomHandGestures: false,
  enablePoseProcessing: false,
  enableBuiltInHandGestures: true,
  lowLightBrightness: 100,
  lowLightContrast: 100,
  handDetectionConfidence: 0.5,
  handPresenceConfidence: 0.5,
  handTrackingConfidence: 0.4,
  poseDetectionConfidence: 0.5,
  posePresenceConfidence: 0.5,
  poseTrackingConfidence: 0.4,
  numHandsPreference: preferenceService.get('numHandsPreference'),
  processingResolutionWidthPreference: preferenceService.get(
    'processingResolutionWidthPreference'
  ),
  languagePreference: preferenceService.get('languagePreference'),
  themePreference: preferenceService.get('themePreference'),
  showHandLandmarks: preferenceService.get('showHandLandmarks'),
  showPoseLandmarks: preferenceService.get('showPoseLandmarks'),
  performanceMetrics: { fps: 0, processingTime: 0, memory: 0 },
  streamStatus: new Map<string, string>(),
  isInitialConfigLoaded: false,
  _wsConnected: false,
  customGestureMetadataList: [],
  pluginManifests: [],
  pluginGlobalConfigs: new Map<string, unknown>(),
  pluginExtDataCache: new Map<string, unknown>(),
  historyEntries: [],
});

interface AppStoreActions {
  setInitialState: (payload: InitialStatePayload) => void;
  setFullConfig: (config: FullConfiguration) => void;
  setPluginGlobalConfig: (pluginId: string, config: unknown) => void;
  setPluginManifests: (manifests: PluginManifest[]) => void;
  setCustomGestureMetadata: (metadata: CustomGestureMetadata[]) => void;
  setLocalPreference: <K extends PreferenceKey>(
    key: K,
    value: PreferenceValue<K>
  ) => void;
  requestBackendPatch: (
    patchData: Partial<FullConfiguration>
  ) => Promise<void>;
  setStreamStatus: (pathName: string, status: string) => void;
  setPluginExtData: (pluginId: string, data: unknown) => void;
  setLowLightSettings: (payload: {
    lowLightBrightness?: number;
    lowLightContrast?: number;
  }) => void;
  addHistoryEntry: (entry: Partial<HistoryEntry>) => void;
  updateHistoryEntryStatus: (result: ActionResultPayload) => void;
  clearHistory: () => void;
}

export type AppStore = ReturnType<typeof createAppStore>;

export function createAppStore(initialState: FrontendFullState) {
  return createStore<FrontendFullState & { actions: AppStoreActions }>()(
    (set, get) => ({
      ...initialState,
      actions: {
        setInitialState: (payload) => {
          set((state) => ({
            ...state,
            ...payload.globalConfig,
            isInitialConfigLoaded: true,
            pluginManifests: payload.manifests,
            pluginGlobalConfigs: new Map(Object.entries(payload.pluginConfigs)),
            customGestureMetadataList: payload.customGestureMetadata,
          }));
        },
        setFullConfig: (config) => {
          set((state) => ({ ...state, ...config }));
        },
        setPluginGlobalConfig: (pluginId, config) => {
          set((state) => {
            const newConfigs = new Map(state.pluginGlobalConfigs);
            newConfigs.set(pluginId, config);
            return { pluginGlobalConfigs: newConfigs };
          });
          pubsub.publish(`${PLUGIN_CONFIG_UPDATED_EVENT_PREFIX}${pluginId}`, config);
        },
        setPluginManifests: (manifests) => {
          set({ pluginManifests: manifests });
        },
        setCustomGestureMetadata: (metadata) => {
          set({ customGestureMetadataList: metadata });
        },
        setLocalPreference: (key, value) => {
          preferenceService.set(key, value);
          set({ [key]: value } as unknown as Pick<FrontendFullState, typeof key>);
        },
        requestBackendPatch: async (patchData) => {
          if (!webSocketService.isConnected()) {
            pubsub.publish(UI_EVENTS.SHOW_ERROR, {
              messageKey: 'wsDisconnected',
              type: 'error',
            });
            return;
          }
          try {
            const result = await webSocketService.request<ConfigPatchAckPayload>(
              'PATCH_CONFIG',
              patchData,
              10000
            );
            if (result?.success) {
              webSocketService.sendMessage({
                type: 'GET_FULL_CONFIG',
                payload: null,
              });
            }
            if (result?.validationErrors) {
              pubsub.publish(
                UI_EVENTS.CONFIG_VALIDATION_ERROR,
                result.validationErrors
              );
            }
          } catch (error) {
            const errorMessage =
              error instanceof Error
                ? error.message
                : 'Config patch request failed.';
            pubsub.publish(UI_EVENTS.SHOW_ERROR, {
              messageKey: errorMessage,
              type: 'error',
            });
          }
        },
        setStreamStatus: (pathName, status) => {
          set((state) => {
            const newStatusMap = new Map(state.streamStatus);
            newStatusMap.set(pathName, status);
            return { streamStatus: newStatusMap };
          });
        },
        setPluginExtData: (pluginId, data) => {
          set((state) => {
            const newCache = new Map(state.pluginExtDataCache);
            newCache.set(pluginId, data);
            return { pluginExtDataCache: newCache };
          });
        },
        setLowLightSettings: (payload) => {
          set(payload);
        },
        addHistoryEntry: (entry) => {
          if (!entry || !entry.gesture) return;
          const newEntry: HistoryEntry = {
            id:
              entry.id || `${Date.now()}-${Math.random().toString(16).substring(2)}`,
            timestamp:
              entry.timestamp instanceof Date
                ? entry.timestamp
                : new Date(entry.timestamp || Date.now()),
            gesture: entry.gesture,
            actionType: entry.actionType || 'none',
            gestureCategory: entry.gestureCategory || 'UNKNOWN',
            success: entry.success,
            reason:
              entry.reason ||
              (entry.actionType !== 'none' ? 'AWAITING_RESULT' : null),
            details: entry.details,
          };
          const currentHistory = get().historyEntries;
          const newHistory = [newEntry, ...currentHistory].slice(
            0,
            MAX_HISTORY_ITEMS
          );
          set({ historyEntries: newHistory });
        },
        updateHistoryEntryStatus: (result) => {
          if (!result?.gestureName || result.pluginId === 'none') return;
          const currentHistory = get().historyEntries;
          let entryUpdated = false;
          const newHistory = currentHistory.map((entry) => {
            if (
              !entryUpdated &&
              entry.gesture === result.gestureName &&
              entry.actionType === result.pluginId &&
              entry.reason === 'AWAITING_RESULT'
            ) {
              entryUpdated = true;
              return {
                ...entry,
                success: result.success,
                reason: result.message || (result.success ? 'OK' : 'FAILED'),
              };
            }
            return entry;
          });
          if (entryUpdated) set({ historyEntries: newHistory });
        },
        clearHistory: () => {
          set({ historyEntries: [] });
        },
      },
    })
  );
}

export const appStore = createAppStore(getInitialState());