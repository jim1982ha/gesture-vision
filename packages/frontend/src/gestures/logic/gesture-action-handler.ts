/* FILE: packages/frontend/src/gestures/logic/gesture-action-handler.ts */
import type { AppStore } from '#frontend/core/state/app-store.js';
import type { HistoryEntry } from '#frontend/types/index.js';
import { webSocketService } from '#frontend/services/websocket-service.js';
import { getGestureDisplayInfo, type ActionConfig, type CustomGestureMetadata, type GestureConfig, type PoseConfig, type GestureCategoryIconType } from '#shared/index.js';

export class GestureActionHandler {
    #appStore: AppStore;
    #customMetadataCache: CustomGestureMetadata[] = [];

    constructor(appStore: AppStore) {
        this.#appStore = appStore;
        this.#customMetadataCache = this.#appStore.getState().customGestureMetadataList || [];
        this.#appStore.subscribe((state) => { this.#customMetadataCache = state.customGestureMetadataList || []; });
    }

    public trigger(gestureName: string, config: GestureConfig | PoseConfig, currentDetections: { name: string, confidence: number }[], now: number): void {
        const actionConfig = config.actionConfig as ActionConfig | null;
        const pluginId = actionConfig?.pluginId || 'none';
        const { category: gestureCategory } = getGestureDisplayInfo(gestureName, this.#customMetadataCache);

        if (actionConfig && pluginId !== 'none') {
            const latestDetectionForAction = currentDetections.find(d => d.name === gestureName);
            const actionConfidence = latestDetectionForAction?.confidence ?? (config.confidence !== undefined ? config.confidence / 100.0 : 1.0);
            const actionDetails = { gestureName, confidence: actionConfidence, timestamp: now };
            webSocketService.sendDispatchAction(config, actionDetails);
        }

        const historyEntryPayload: Partial<HistoryEntry> = { gesture: gestureName, actionType: pluginId, gestureCategory: gestureCategory as GestureCategoryIconType, details: config.actionConfig };
        this.#appStore.getState().actions.addHistoryEntry(historyEntryPayload);
    }
}