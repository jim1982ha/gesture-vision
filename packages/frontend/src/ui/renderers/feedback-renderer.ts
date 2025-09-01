/* FILE: packages/frontend/src/ui/renderers/feedback-renderer.ts */
import type { AppStore } from '#frontend/core/state/app-store.js';
import type { PluginUIService } from '#frontend/services/plugin-ui.service.js';
import type { RendererElements } from '#frontend/ui/ui-renderer-core.js';

import { UI_EVENTS, pubsub, translate } from '#shared/index.js';
import { formatGestureNameForDisplay } from '#frontend/ui/helpers/index.js';

interface GestureStatusData {
  gesture: string;
  // FIX: Removed redundant `confidence: string` property.
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

interface GestureAlertData {
  gesture: string;
  actionType: string;
}

export function updateStatusDisplay(
  elements: Partial<RendererElements>,
  status: Partial<GestureStatusData> = {},
  _appStore?: AppStore | null
): void {
  const {
    topCenterStatus,
    currentGestureSpan,
    confidenceBar,
    holdTimeDisplay,
    holdTimeMetric,
  } = elements;
  if (
    !topCenterStatus ||
    !currentGestureSpan ||
    !confidenceBar ||
    !holdTimeDisplay ||
    !holdTimeMetric
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

  // FIX: Display the real-time confidence percentage inside the bar.
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
  elements: Partial<RendererElements>,
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

export function showGestureAlert(
  _elements: Partial<RendererElements>,
  alertData: Partial<GestureAlertData> = {},
  pluginUIService?: PluginUIService | null
): void {
  const formattedName = formatGestureNameForDisplay(alertData.gesture || 'UNKNOWN');
  const gestureName = translate(formattedName, { defaultValue: formattedName });

  const actionPluginId = alertData.actionType || 'none';
  let messageKey: string;
  let type: 'info' | 'success' | 'warning' | 'error' = 'info';
  let actionDisplayName = actionPluginId;

  if (actionPluginId !== 'none' && pluginUIService) {
    const manifest = pluginUIService.getPluginManifest(actionPluginId);
    if (manifest?.nameKey) {
      actionDisplayName = translate(manifest.nameKey, {
        defaultValue: manifest.id,
      });
    }
  }

  if (actionPluginId !== 'none') {
    messageKey = 'alertActionDispatched';
    type = 'success';
  } else {
    messageKey = 'alertNoActionConfigured';
    type = 'info';
  }

  pubsub.publish(UI_EVENTS.SHOW_NOTIFICATION, {
    messageKey: messageKey,
    substitutions: {
      gestureName: gestureName,
      actionType: actionDisplayName,
    },
    type: type,
    duration: 3000,
  });
}