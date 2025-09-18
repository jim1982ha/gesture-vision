/* FILE: packages/frontend/src/gestures/logic/GestureActionHandler.ts */
import type { AppStore } from '#frontend/core/state/app-store.js';
import { webSocketService } from '#frontend/services/websocket-service.js';
import { getGestureDisplayInfo } from '#frontend/ui/helpers/index.js';
import type { HistoryEntry } from '#frontend/types/index.js';
import type { ActionConfig, CustomGestureMetadata, GestureConfig, PoseConfig } from '#shared/index.js';

/**
 * Handles the side effects of a confirmed gesture, like dispatching actions and updating history.
 */
export class GestureActionHandler {
    #appStore: AppStore;
    #customMetadataCache: CustomGestureMetadata[] = [];

    constructor(appStore: AppStore) {
        this.#appStore = appStore;
        this.#customMetadataCache = this.#appStore.getState().customGestureMetadataList || [];
        this.#appStore.subscribe((state) => {
            this.#customMetadataCache = state.customGestureMetadataList || [];
        });
    }

    public trigger(
        gestureName: string,
        config: GestureConfig | PoseConfig,
        currentDetections: { name: string, confidence: number }[],
        now: number
    ): void {
        const actionConfig = config.actionConfig as ActionConfig | null;
        const pluginId = actionConfig?.pluginId || 'none';
        const { category: gestureCategory } = getGestureDisplayInfo(
            gestureName,
            this.#customMetadataCache
        );

        if (actionConfig && pluginId !== 'none') {
            const latestDetectionForAction = currentDetections.find(d => d.name === gestureName);
            const actionConfidence = latestDetectionForAction?.confidence ?? (config.confidence !== undefined ? config.confidence / 100.0 : 1.0);
            const actionDetails = { gestureName, confidence: actionConfidence, timestamp: now };
            webSocketService.sendDispatchAction(config, actionDetails);
        }

        const historyEntryPayload: Partial<HistoryEntry> = {
            gesture: gestureName,
            actionType: pluginId,
            gestureCategory: gestureCategory,
            details: config.actionConfig,
        };
        this.#appStore.getState().actions.addHistoryEntry(historyEntryPayload);
    }
}