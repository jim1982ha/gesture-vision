/* FILE: packages/frontend/src/ui/renderers/feedback-renderer.ts */
import type { AppStore } from '#frontend/core/state/app-store.js';
import { setIcon } from '#frontend/ui/helpers/index.js'; // FIX: Removed unused 'getGestureDisplayInfo'
import type { TranslationService } from '#frontend/services/translation.service.js';

interface GestureStatusData {
  gesture: string; // This will now be the RAW gesture name ('-' or 'VICTORY')
  gestureText: string; // This will be the translated text for display
  realtimeConfidence: number;
  configuredThreshold: number | null;
  isCooldownActive?: boolean;
}

interface GestureProgressData {
  holdPercent: number;
  cooldownPercent: number;
  currentHoldMs?: number;
  requiredHoldMs?: number;
  remainingCooldownMs?: number;
}

export function updateStatusDisplay(
  elements: Partial<{
    gestureFeedbackOverlay: HTMLElement | null;
    currentGestureSpan: HTMLElement | null;
    confidenceBar: HTMLElement | null;
  }>,
  status: Partial<GestureStatusData> = {},
  appStore?: AppStore | null,
  translationService?: TranslationService | null
): void {
  const {
    gestureFeedbackOverlay,
    currentGestureSpan,
    confidenceBar,
  } = elements;
  if (
    !gestureFeedbackOverlay ||
    !currentGestureSpan ||
    !confidenceBar ||
    !appStore ||
    !translationService
  )
    return;

  const isCooldownActive = status.isCooldownActive === true;
  const rawGestureName = status.gesture || '-'; // Use the raw name for logic
  const gestureTextToDisplay = status.gestureText || '-';

  // FIX: Visibility is now based on the raw gesture name being meaningful.
  const showGestureInfo = rawGestureName !== '-' && !isCooldownActive;
  
  gestureFeedbackOverlay.classList.toggle('hidden', !showGestureInfo);
  gestureFeedbackOverlay.classList.toggle('flex', showGestureInfo);
  gestureFeedbackOverlay.classList.toggle('flex-row', showGestureInfo);


  const feedbackContainer = document.getElementById('gesture-feedback-container');
  if (feedbackContainer) {
    feedbackContainer.classList.toggle('pointer-events-auto', showGestureInfo);
  }

  currentGestureSpan.textContent = gestureTextToDisplay;
  
  const realtimeConfidenceRatio = status.realtimeConfidence || 0;
  const realtimeConfidencePercent = Math.round(realtimeConfidenceRatio * 100);
  confidenceBar.style.width = `${realtimeConfidencePercent}%`;

  confidenceBar.textContent = `${realtimeConfidencePercent}%`;

  const thresholdMarker = document.getElementById('confidenceThresholdMarker');
  if (thresholdMarker) {
    if (showGestureInfo && status.configuredThreshold !== null && status.configuredThreshold !== undefined) {
        thresholdMarker.style.left = `${status.configuredThreshold * 100}%`;
        thresholdMarker.style.display = 'block';
    } else {
        thresholdMarker.style.display = 'none';
    }
  }
}

export function updateProgressRings(
  elements: Partial<{
    gestureProgressCircle: SVGCircleElement | null;
    cooldownProgressCircle: SVGCircleElement | null;
    holdTimeDisplay: HTMLElement | null;
    holdTimeMetric: HTMLElement | null;
    progressRingsOverlay: HTMLElement | null;
  }>,
  progress: Partial<GestureProgressData> = {}
): void {
  const {
    gestureProgressCircle,
    cooldownProgressCircle,
    holdTimeDisplay,
    holdTimeMetric,
    progressRingsOverlay,
  } = elements;
  if (
    !gestureProgressCircle ||
    !cooldownProgressCircle ||
    !holdTimeDisplay ||
    !holdTimeMetric ||
    !progressRingsOverlay
  )
    return;

  const {
    holdPercent = 0,
    cooldownPercent = 0,
    currentHoldMs = 0,
    requiredHoldMs = 0,
  } = progress;
  
  const areRingsVisible = holdPercent > 0 || cooldownPercent > 0;
  progressRingsOverlay.classList.toggle('visible', areRingsVisible);
  
  const circGesture = 2 * Math.PI * 31.5;
  const circCooldown = 2 * Math.PI * 36.5;

  const safeHoldPercent = Math.max(0, Math.min(1, holdPercent));
  gestureProgressCircle.style.strokeDashoffset = String(circGesture * (1 - safeHoldPercent));
  gestureProgressCircle.style.opacity = holdPercent > 0 ? '1' : '0';
  gestureProgressCircle.style.stroke = '';

  const safeCooldownPercent = Math.max(0, Math.min(1, cooldownPercent));
  cooldownProgressCircle.style.strokeDashoffset = String(circCooldown * (1 - safeCooldownPercent));
  cooldownProgressCircle.style.opacity = cooldownPercent > 0 ? '1' : '0';

  const showHoldInfo = holdPercent > 0 && cooldownPercent === 0 && requiredHoldMs > 0;
  holdTimeMetric.classList.toggle('hidden', !showHoldInfo);
  
  if (showHoldInfo) {
    setIcon(holdTimeMetric.querySelector('.material-icons'), 'UI_TIMER');
    holdTimeDisplay.textContent = `${((currentHoldMs || 0) / 1000).toFixed(1)}/${(
      (requiredHoldMs || 0) / 1000
    ).toFixed(1)}s`;
  }
}