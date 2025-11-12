/* FILE: packages/frontend/src/core/state/slices/configSlice.ts */
import type { StateCreator } from 'zustand';
import { produce } from 'immer';
import { webSocketService } from '#frontend/services/websocket-service.js';
import { pubsub, UI_EVENTS, type FullConfiguration, type ConfigPatchAckPayload, type EnrichedGestureConfig } from '#shared/index.js';

export interface ConfigSlice {
  // State from FullConfiguration
  globalCooldown: number;
  rtspSources: FullConfiguration['rtspSources'];
  gestureConfigs: EnrichedGestureConfig[]; // MODIFIED: Use enriched type
  targetFpsPreference: FullConfiguration['targetFpsPreference'];
  telemetryEnabled: boolean;
  enableCustomHandGestures: boolean;
  enablePoseProcessing: boolean;
  enableBuiltInHandGestures: boolean;
  lowLightBrightness: number;
  lowLightContrast: number;
  handDetectionConfidence: number;
  handPresenceConfidence: number;
  handTrackingConfidence: number;
  poseDetectionConfidence: number;
  posePresenceConfidence: number;
  poseTrackingConfidence: number;
  _migrationVersion?: number;

  actions: {
    setFullConfig: (config: FullConfiguration) => void;
    setGestureConfigs: (configs: EnrichedGestureConfig[]) => void;
    requestBackendPatch: (patchData: Partial<FullConfiguration>) => Promise<void>;
  };
}

export const createConfigSlice: StateCreator<ConfigSlice, [], [], ConfigSlice> = (set) => ({
  // Minimal initial state; will be hydrated by the backend on connection.
  globalCooldown: 2.0,
  rtspSources: [],
  gestureConfigs: [],
  targetFpsPreference: 30,
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
  
  actions: {
    setFullConfig: (config) => set(produce((draft: ConfigSlice) => {
      Object.assign(draft, config);
    })),

    setGestureConfigs: (configs) => set({ gestureConfigs: configs }),

    requestBackendPatch: async (patchData) => {
      if (!webSocketService.isConnected()) {
        pubsub.publish(UI_EVENTS.SHOW_ERROR, { messageKey: 'wsDisconnected', type: 'error' });
        return;
      }
      try {
        const result = await webSocketService.request<ConfigPatchAckPayload>('PATCH_CONFIG', patchData, 10000);
        if (result?.validationErrors) {
          pubsub.publish(UI_EVENTS.CONFIG_VALIDATION_ERROR, result.validationErrors);
        }
      } catch (error) {
        pubsub.publish(UI_EVENTS.SHOW_ERROR, { message: error instanceof Error ? error.message : 'Config patch failed.', type: 'error' });
      }
    },
  }
});