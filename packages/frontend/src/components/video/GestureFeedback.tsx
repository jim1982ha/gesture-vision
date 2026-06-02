/* FILE: packages/frontend/src/components/video/GestureFeedback.tsx */
import { useGestureFeedbackState } from '#frontend/hooks/useGestureFeedbackState.js';
import { setIcon } from '#frontend/ui/helpers/ui-helpers.js';

export const GestureFeedback = () => {
    const state = useGestureFeedbackState();

    const showGestureInfo = state.gestureName && state.gestureName !== '-' && !state.isCooldownActive;
    const showHoldInfo = state.holdPercent > 0 && !state.isCooldownActive && state.requiredHoldMs > 0;
    
    const realtimeConfidencePercent = Math.round(state.realtimeConfidence * 100);

    return (
        <div id="gesture-feedback-container" className="pointer-events-auto">
            {showGestureInfo && (
                <div id="gesture-feedback-overlay" className="flex mx-auto w-fit overlay-surface rounded-full p-2 items-center gap-2 text-xs">
                    <span id="currentGestureSpan" className="truncate">{state.gestureText}</span>
                    <div id="confidence-bar-container" className="confidence-bar-container">
                        <div id="confidenceBar" className="confidence-bar" style={{ width: `${realtimeConfidencePercent}%` }}>
                        </div>
                        {state.configuredThreshold !== null && (
                            <div id="confidenceThresholdMarker" className="confidence-threshold-marker" style={{ left: `${state.configuredThreshold * 100}%` }}></div>
                        )}
                    </div>
                    {showHoldInfo && (
                        <div id="holdTimeMetric" className="timer-display flex items-center gap-1">
                            <span ref={el => el && setIcon(el, 'UI_TIMER')}></span>
                            <span id="holdTimeDisplay">{(state.currentHoldMs / 1000).toFixed(1)}/{(state.requiredHoldMs / 1000).toFixed(1)}s</span>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};