/* FILE: packages/frontend/src/hooks/useGestureFeedbackState.ts */
import { useState, useEffect } from 'react';
import { GESTURE_EVENTS, pubsub } from '#shared/index.js';
import type { GestureFeedbackState } from '#frontend/gestures/logic/gesture-ui-dispatcher.js';

const INITIAL_STATE: GestureFeedbackState = {
    gestureName: '-',
    gestureText: '-',
    realtimeConfidence: 0,
    configuredThreshold: null,
    isCooldownActive: false,
    holdPercent: 0,
    cooldownPercent: 0,
    currentHoldMs: 0,
    requiredHoldMs: 0,
};

/**
 * A centralized hook to subscribe to the unified gesture UI feedback event.
 * It provides a single, consistent state object for all gesture-related UI components.
 *
 * @returns The latest GestureFeedbackState object.
 */
export const useGestureFeedbackState = (): GestureFeedbackState => {
    const [state, setState] = useState<GestureFeedbackState>(INITIAL_STATE);

    useEffect(() => {
        const handleUpdate = (data: unknown) => {
            setState(data as GestureFeedbackState);
        };
        const unsubscribe = pubsub.subscribe(GESTURE_EVENTS.UI_FEEDBACK_UPDATE, handleUpdate);
        return () => unsubscribe();
    }, []);

    return state;
};