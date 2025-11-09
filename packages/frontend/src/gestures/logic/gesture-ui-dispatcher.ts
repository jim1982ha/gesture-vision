/* FILE: packages/frontend/src/gestures/logic/gesture-ui-dispatcher.ts */
import type { TranslationService } from '#frontend/services/translation.service.js';
import { GESTURE_EVENTS, formatGestureNameForDisplay, pubsub } from '#shared/index.js';

export interface GestureFeedbackState {
    gestureName: string;
    gestureText: string;
    realtimeConfidence: number;
    configuredThreshold: number | null;
    isCooldownActive: boolean;
    holdPercent: number;
    cooldownPercent: number;
    currentHoldMs: number;
    requiredHoldMs: number;
}

export class GestureUIDispatcher {
    #translationService: TranslationService;
    constructor(translationService: TranslationService) { this.#translationService = translationService; }

    public update(payload: Omit<GestureFeedbackState, 'gestureText'>): void {
        const formattedName = formatGestureNameForDisplay(payload.gestureName);
        const gestureText = this.#translationService.translate(formattedName, { defaultValue: formattedName });
        
        const finalPayload: GestureFeedbackState = {
            ...payload,
            gestureText
        };
        
        pubsub.publish(GESTURE_EVENTS.UI_FEEDBACK_UPDATE, finalPayload);
    }

    public reset(): void {
        this.update({
            gestureName: '-',
            realtimeConfidence: 0,
            configuredThreshold: null,
            isCooldownActive: false,
            holdPercent: 0,
            cooldownPercent: 0,
            currentHoldMs: 0,
            requiredHoldMs: 0,
        });
    }
}