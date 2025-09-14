/* FILE: packages/frontend/src/gestures/logic/GestureUIDispatcher.ts */
import type { AppStore } from '#frontend/core/state/app-store.js';
import type { TranslationService } from '#frontend/services/translation.service.js';
import { getGestureDisplayInfo } from '#frontend/ui/helpers/index.js';
import { GESTURE_EVENTS, pubsub } from '#shared/index.js';

interface UIDispatcherPayload {
    gesture: string;
    realtimeConfidence: number;
    configuredThreshold: number | null;
    isCooldownActive?: boolean;
    holdPercent: number;
    currentHoldMs?: number;
    requiredHoldMs?: number;
    remainingCooldownMs?: number;
    cooldownPercent: number;
}

/**
 * Manages publishing UI update events based on the current gesture state.
 */
export class GestureUIDispatcher {
    #appStore: AppStore;
    #translationService: TranslationService;

    constructor(appStore: AppStore, translationService: TranslationService) {
        this.#appStore = appStore;
        this.#translationService = translationService;
    }

    public update(payload: UIDispatcherPayload): void {
        const {
            gesture, realtimeConfidence, configuredThreshold, isCooldownActive,
            holdPercent, cooldownPercent, currentHoldMs, requiredHoldMs, remainingCooldownMs
        } = payload;

        // Publish status update for the top-center display
        const { formattedName } = getGestureDisplayInfo(gesture, this.#appStore.getState().customGestureMetadataList || []);
        const gestureTextToDisplay = gesture !== '-' ? this.#translationService.translate(formattedName, { defaultValue: formattedName }) : this.#translationService.translate('None');

        pubsub.publish(GESTURE_EVENTS.UPDATE_STATUS, {
            gesture: gestureTextToDisplay,
            realtimeConfidence,
            configuredThreshold,
            isCooldownActive,
        });

        // Publish progress update for the rings
        pubsub.publish(GESTURE_EVENTS.UPDATE_PROGRESS, {
            holdPercent,
            cooldownPercent,
            currentHoldMs,
            requiredHoldMs,
            remainingCooldownMs,
        });
    }
}