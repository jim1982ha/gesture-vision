/* FILE: packages/frontend/src/gestures/logic/GestureUIDispatcher.ts */
import type { TranslationService } from '#frontend/services/translation.service.js';
import { GESTURE_EVENTS, pubsub } from '#shared/index.js';

interface UIDispatcherPayload {
    gesture: string;
    realtimeConfidence: number;
    configuredThreshold: number | null;
    isCooldownActive?: boolean;
    holdPercent: number;
    cooldownPercent: number;
    currentHoldMs?: number;
    requiredHoldMs?: number;
    remainingCooldownMs?: number;
}

/**
 * Manages publishing UI update events based on the current gesture state.
 */
export class GestureUIDispatcher {
    #translationService: TranslationService;

    constructor(translationService: TranslationService) {
        this.#translationService = translationService;
    }

    public update(payload: UIDispatcherPayload): void {
        const {
            gesture, realtimeConfidence, configuredThreshold, isCooldownActive,
            holdPercent, cooldownPercent, currentHoldMs, requiredHoldMs, remainingCooldownMs
        } = payload;
        
        // The raw gesture name is now translated directly.
        // For built-in gestures, it hits a translation key. For custom, it uses the name as the default.
        const gestureTextToDisplay = this.#translationService.translate(gesture, { defaultValue: gesture });

        pubsub.publish(GESTURE_EVENTS.UPDATE_STATUS, {
            gesture: gesture, // Pass the RAW gesture name ('-' or 'VICTORY')
            gestureText: gestureTextToDisplay, // Pass the final display text
            realtimeConfidence,
            configuredThreshold,
            isCooldownActive,
        });

        // Publish progress update for the rings
        // FIX: Added the missing currentHoldMs, requiredHoldMs, and remainingCooldownMs properties.
        pubsub.publish(GESTURE_EVENTS.UPDATE_PROGRESS, {
            holdPercent,
            cooldownPercent,
            currentHoldMs,
            requiredHoldMs,
            remainingCooldownMs,
        });
    }
}