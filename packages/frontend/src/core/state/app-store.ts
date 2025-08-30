/* FILE: packages/frontend/src/core/state/app-store.ts */
import { createStore } from 'zustand/vanilla';
import {
  PreferenceService,
  type PreferenceKey,
  type PreferenceValue,
} from '#frontend/services/preference.service.js';
import { webSocketService } from '#frontend/services/websocket-service.js';
import { UI_EVENTS, PLUGIN_CONFIG_UPDATED_EVENT_PREFIX, pubsub } from '#shared/index.js';
import type {
  FullConfiguration,
  InitialStatePayload,
  CustomGestureMetadata,
  PluginManifest,
  ActionResultPayload,
  ConfigPatchAckPayload,
} from '#shared/index.js';
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
  isWsConnected: boolean;
  isWebcamRunning: boolean; // NEW: Centralized stream running state
  customGestureMetadataList: CustomGestureMetadata[];
  pluginManifests: PluginManifest[];
  pluginGlobalConfigs: Map<string, unknown>;
  pluginExtDataCache: Map<string, unknown>;
  historyEntries: HistoryEntry[];
  handModelLoaded: boolean;
  poseModelLoaded: boolean;
  isActionDispatchSuppressed: boolean;
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
  processingResolutionWidthPreference: preferenceService.get('processingResolutionWidthPreference'),
  languagePreference: preferenceService.get('languagePreference'),
  themePreference: preferenceService.get('themePreference'),
  showHandLandmarks: preferenceService.get('showHandLandmarks'),
  showPoseLandmarks: preferenceService.get('showPoseLandmarks'),
  performanceMetrics: { fps: 0, processingTime: 0, memory: 0 },
  streamStatus: new Map<string, string>(),
  isInitialConfigLoaded: false,
  isWsConnected: false,
  isWebcamRunning: false, // NEW: Initial state
  customGestureMetadataList: [],
  pluginManifests: [],
  pluginGlobalConfigs: new Map<string, unknown>(),
  pluginExtDataCache: new Map<string, unknown>(),
  historyEntries: [],
  handModelLoaded: false,
  poseModelLoaded: false,
  isActionDispatchSuppressed: false,
});

interface AppStoreActions {
  setInitialState: (payload: InitialStatePayload) => void;
  setFullConfig: (config: FullConfiguration) => void;
  setPluginGlobalConfig: (pluginId: string, config: unknown) => void;
  setPluginManifests: (manifests: PluginManifest[]) => void;
  setCustomGestureMetadata: (metadata: CustomGestureMetadata[]) => void;
  setLocalPreference: <K extends PreferenceKey>(key: K, value: PreferenceValue<K>) => void;
  requestBackendPatch: (patchData: Partial<FullConfiguration>) => Promise<void>;
  setStreamStatus: (pathName: string, status: string) => void;
  setPluginExtData: (pluginId: string, data: unknown) => void;
  setLowLightSettings: (payload: { lowLightBrightness?: number; lowLightContrast?: number; }) => void;
  addHistoryEntry: (entry: Partial<HistoryEntry>) => void;
  updateHistoryEntryStatus: (result: ActionResultPayload) => void;
  clearHistory: () => void;
  setModelLoadingStatus: (status: { hand?: boolean, pose?: boolean }) => void;
  setIsActionDispatchSuppressed: (isSuppressed: boolean) => void;
  setWsConnectionStatus: (isConnected: boolean) => void;
  setWebcamRunningStatus: (isRunning: boolean) => void; // NEW: Action to set stream status
}

export type AppStore = ReturnType<typeof createAppStore>;

export function createAppStore(initialState: FrontendFullState) {
  return createStore<FrontendFullState & { actions: AppStoreActions }>()(
    (set, get) => ({
      ...initialState,
      actions: {
        setInitialState: (payload: InitialStatePayload) => {
          set((state) => ({
            ...state,
            ...payload.globalConfig,
            isInitialConfigLoaded: true,
            pluginManifests: payload.manifests,
            pluginGlobalConfigs: new Map(Object.entries(payload.pluginConfigs)),
            customGestureMetadataList: payload.customGestureMetadata,
          }));
        },
        setFullConfig: (config: FullConfiguration) => {
          set((state) => ({ ...state, ...config }));
        },
        setPluginGlobalConfig: (pluginId: string, config: unknown) => {
          set((state) => {
            const newConfigs = new Map(state.pluginGlobalConfigs);
            newConfigs.set(pluginId, config);
            return { pluginGlobalConfigs: newConfigs };
          });
          pubsub.publish(`${PLUGIN_CONFIG_UPDATED_EVENT_PREFIX}${pluginId}`, config);
        },
        setPluginManifests: (manifests: PluginManifest[]) => {
          set({ pluginManifests: manifests });
        },
        setCustomGestureMetadata: (metadata: CustomGestureMetadata[]) => {
          set({ customGestureMetadataList: metadata });
        },
        setLocalPreference: <K extends PreferenceKey>(key: K, value: PreferenceValue<K>) => {
          preferenceService.set(key, value);
          set({ [key]: value } as unknown as Pick<FrontendFullState, K>);
        },
        requestBackendPatch: async (patchData: Partial<FullConfiguration>) => {
          if (!webSocketService.isConnected()) {
            pubsub.publish(UI_EVENTS.SHOW_ERROR, { messageKey: 'wsDisconnected', type: 'error' });
            return;
          }
          try {
            const result = await webSocketService.request<ConfigPatchAckPayload>('PATCH_CONFIG', patchData, 10000);
            if (result?.success) {
              webSocketService.sendMessage({ type: 'GET_FULL_CONFIG', payload: null });
            }
            if (result?.validationErrors) {
              pubsub.publish(UI_EVENTS.CONFIG_VALIDATION_ERROR, result.validationErrors);
            }
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Config patch request failed.';
            pubsub.publish(UI_EVENTS.SHOW_ERROR, { message: errorMessage, type: 'error' });
          }
        },
        setStreamStatus: (pathName: string, status: string) => {
          set((state) => {
            const newStatusMap = new Map(state.streamStatus);
            newStatusMap.set(pathName, status);
            return { streamStatus: newStatusMap };
          });
        },
        setPluginExtData: (pluginId: string, data: unknown) => {
          set((state) => {
            const newCache = new Map(state.pluginExtDataCache);
            newCache.set(pluginId, data);
            return { pluginExtDataCache: newCache };
          });
        },
        setLowLightSettings: (payload: { lowLightBrightness?: number; lowLightContrast?: number; }) => {
          set(payload);
        },
        addHistoryEntry: (entry: Partial<HistoryEntry>) => {
          if (!entry || !entry.gesture) return;
          const newEntry: HistoryEntry = {
            id: entry.id || `${Date.now()}-${Math.random().toString(16).substring(2)}`,
            timestamp: entry.timestamp instanceof Date ? entry.timestamp : new Date(entry.timestamp || Date.now()),
            gesture: entry.gesture,
            actionType: entry.actionType || 'none',
            gestureCategory: entry.gestureCategory || 'UNKNOWN',
            success: entry.success,
            reason: entry.reason || (entry.actionType !== 'none' ? 'AWAITING_RESULT' : null),
            details: entry.details,
          };
          const currentHistory = get().historyEntries;
          const newHistory = [newEntry, ...currentHistory].slice(0, MAX_HISTORY_ITEMS);
          set({ historyEntries: newHistory });
        },
        updateHistoryEntryStatus: (result: ActionResultPayload) => {
          if (!result?.gestureName || result.pluginId === 'none') return;
          const currentHistory = get().historyEntries;
          let entryUpdated = false;
          const newHistory = currentHistory.map((entry) => {
            if (!entryUpdated && entry.gesture === result.gestureName && entry.actionType === result.pluginId && entry.reason === 'AWAITING_RESULT') {
              entryUpdated = true;
              return { ...entry, success: result.success, reason: result.message || (result.success ? 'OK' : 'FAILED'), };
            }
            return entry;
          });
          if (entryUpdated) set({ historyEntries: newHistory });
        },
        clearHistory: () => {
          set({ historyEntries: [] });
        },
        setModelLoadingStatus: (status: { hand?: boolean, pose?: boolean }) => {
          const updates: Partial<Pick<FrontendFullState, 'handModelLoaded' | 'poseModelLoaded'>> = {};
          if (typeof status.hand === 'boolean') updates.handModelLoaded = status.hand;
          if (typeof status.pose === 'boolean') updates.poseModelLoaded = status.pose;
          if (Object.keys(updates).length > 0) set(updates);
        },
        setIsActionDispatchSuppressed: (isSuppressed: boolean) => {
          set({ isActionDispatchSuppressed: isSuppressed });
        },
        setWsConnectionStatus: (isConnected: boolean) => {
          set({ isWsConnected: isConnected });
        },
        setWebcamRunningStatus: (isRunning: boolean) => { // NEW: Action implementation
            set({ isWebcamRunning: isRunning });
        },
      },
    })
  );
}

export const appStore = createAppStore(getInitialState());