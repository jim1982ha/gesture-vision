/* FILE: packages/frontend/src/ui/renderers/feedback-renderer.ts */
import type { AppStore } from '#frontend/core/state/app-store.js';
import { translate } from '#shared/index.js';
import { formatGestureNameForDisplay } from '#frontend/ui/helpers/index.js';

interface GestureStatusData {
  gesture: string;
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
    topCenterStatus: HTMLElement | null;
    currentGestureSpan: HTMLElement | null;
    confidenceBar: HTMLElement | null;
    holdTimeDisplay: HTMLElement | null;
    holdTimeMetric: HTMLElement | null;
  }>,
  status: Partial<GestureStatusData> = {},
  _appStore?: AppStore | null
): void {
  const {
    topCenterStatus,
    currentGestureSpan,
    confidenceBar,
  } = elements;
  if (
    !topCenterStatus ||
    !currentGestureSpan ||
    !confidenceBar
  )
    return;

  const isCooldownActive = status.isCooldownActive === true;
  const rawGestureName = status.gesture || '-';
  const gestureTextToDisplay =
    rawGestureName !== '-'
      ? translate(formatGestureNameForDisplay(rawGestureName), {
          defaultValue: formatGestureNameForDisplay(rawGestureName),
        })
      : translate('NONE');

  const showGestureInfo = rawGestureName !== '-' && !isCooldownActive;
  topCenterStatus.style.display = showGestureInfo ? 'flex' : 'none';

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
    progressTimersContainer: HTMLElement | null;
  }>,
  progress: Partial<GestureProgressData> = {}
): void {
  const {
    gestureProgressCircle,
    cooldownProgressCircle,
    holdTimeDisplay,
    holdTimeMetric,
    progressTimersContainer,
  } = elements;
  if (
    !gestureProgressCircle ||
    !cooldownProgressCircle ||
    !holdTimeDisplay ||
    !holdTimeMetric ||
    !progressTimersContainer
  )
    return;

  const {
    holdPercent = 0,
    cooldownPercent = 0,
    currentHoldMs = 0,
    requiredHoldMs = 0,
  } = progress;
  
  const areRingsVisible = holdPercent > 0 || cooldownPercent > 0;
  progressTimersContainer.classList.toggle('visible', areRingsVisible);
  
  const circGesture = 2 * Math.PI * 31.5;
  const circCooldown = 2 * Math.PI * 36.5;

  gestureProgressCircle.style.strokeDashoffset = String(
    circGesture * (1 - Math.max(0, Math.min(1, holdPercent)))
  );
  gestureProgressCircle.style.opacity = holdPercent > 0 ? '1' : '0';

  cooldownProgressCircle.style.strokeDashoffset = String(
    circCooldown * Math.max(0, Math.min(1, cooldownPercent))
  );
  cooldownProgressCircle.style.opacity = cooldownPercent > 0 ? '1' : '0';

  const showHoldInfo = holdPercent > 0 && cooldownPercent === 0 && requiredHoldMs > 0;
  holdTimeMetric.style.display = showHoldInfo ? 'inline-flex' : 'none';
  if (showHoldInfo) {
    holdTimeDisplay.textContent = `${((currentHoldMs || 0) / 1000).toFixed(1)}/${(
      (requiredHoldMs || 0) / 1000
    ).toFixed(1)}s`;
  }
}