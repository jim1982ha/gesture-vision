/* FILE: packages/frontend/src/gestures/state-logic.ts */
// Manages the state of detected gestures, including hold timers and cooldowns,
import type { AppStore } from '#frontend/core/state/app-store.js';
import type { HistoryEntry } from '#frontend/types/index.js';

import {
  GESTURE_EVENTS,
  WEBCAM_EVENTS,
  WEBSOCKET_EVENTS,
  UI_EVENTS,
} from '#shared/constants/index.js';
import { pubsub } from '#shared/core/pubsub.js';
import { translate } from '#shared/services/translations.js';
import { normalizeNameForMtx } from '#shared/utils/index.js';
import {
  formatGestureNameForDisplay,
  getGestureDisplayInfo,
} from '#frontend/ui/helpers/index.js';

import { GestureTimerManager } from './logic/gesture-timer-manager.js';
import { webSocketService } from '../services/websocket-service.js';

import type {
  GestureConfig,
  PoseConfig,
  CustomGestureMetadata,
  ActionResultPayload,
  ActionConfig,
} from '#shared/types/index.js';

interface ActionableRecognition {
  name: string;
  confidence: number;
}

interface DisplayStatus {
  gesture: string;
  confidence: string;
  realtimeConfidence: number;
  configuredThreshold: number | null;
  isCooldownActive?: boolean;
}

interface ProgressData {
  holdPercent: number;
  cooldownPercent: number;
  currentHoldMs?: number;
  requiredHoldMs?: number;
  remainingCooldownMs?: number;
}

interface DisplayedGestureInfo {
  name: string;
  confidence: number;
  config: GestureConfig | PoseConfig;
  currentHoldMs: number;
  requiredHoldMs: number;
}

export const BUILT_IN_HAND_GESTURES = [
  'OPEN_PALM',
  'CLOSED_FIST',
  'POINTING_UP',
  'THUMB_UP',
  'THUMB_DOWN',
  'VICTORY',
  'ILOVEYOU',
  'NONE',
] as const;

export class GestureStateLogic {
  #timerManager: GestureTimerManager;
  #publishedConfidencePulse = new Set<string>();
  #appStore: AppStore;
  #gestureConfigsCache: (GestureConfig | PoseConfig)[] = [];
  #currentlyDisplayedGesture: DisplayedGestureInfo | null = null;
  #customMetadataCache: CustomGestureMetadata[] = [];
  #isInitialized = false;
  #unsubscribeStore: () => void;
  #isActionDispatchSuppressed = false;

  // --- Bound event handlers for pubsub ---
  #boundHandleActionResult: (data?: unknown) => void;
  #boundHandleStreamStop: () => void;
  #boundHandleTimersReset: (data?: unknown) => void;
  #boundHandlePluginActionTrigger: () => void;

  constructor(appStore: AppStore) {
    this.#appStore = appStore;
    this.#timerManager = new GestureTimerManager(appStore);

    this.#gestureConfigsCache = this.#appStore.getState().gestureConfigs || [];
    this.#customMetadataCache =
      this.#appStore.getState().customGestureMetadataList || [];
    this.#isInitialized = true;

    // Bind event handlers to this instance
    this.#boundHandleActionResult = (data?: unknown) =>
      this.#handleActionResult(data as ActionResultPayload | undefined);
    this.#boundHandleStreamStop = () => {
      this.#currentlyDisplayedGesture = null;
      this.#timerManager.resetAllTimersAndStates();
    };
    this.#boundHandleTimersReset = (_data?: unknown) => {
      this.#publishProgress({
        holdPercent: 0,
        cooldownPercent: this.#timerManager.getGlobalCooldownPercent(),
      });
    };
    this.#boundHandlePluginActionTrigger = () => {
        this.#timerManager.startGlobalCooldown();
    };

    this.#unsubscribeStore = this.#appStore.subscribe((state, prevState) => {
      if (state.gestureConfigs !== prevState.gestureConfigs) {
        this.#gestureConfigsCache = state.gestureConfigs || [];
        this.#timerManager.resetAllGestureHoldStates();
        this.#currentlyDisplayedGesture = null;
      }
      if (
        state.customGestureMetadataList !== prevState.customGestureMetadataList
      ) {
        this.updateCustomMetadataCache(state.customGestureMetadataList);
      }
      if (
        state.enableBuiltInHandGestures !==
          prevState.enableBuiltInHandGestures ||
        state.enableCustomHandGestures !==
          prevState.enableCustomHandGestures ||
        state.enablePoseProcessing !== prevState.enablePoseProcessing
      ) {
        this.#handleFeatureToggle();
      }
    });

    this.#subscribeToEvents();
  }

  destroy() {
    this.#unsubscribeStore();
    pubsub.unsubscribe(
      WEBSOCKET_EVENTS.BACKEND_ACTION_RESULT,
      this.#boundHandleActionResult
    );
    pubsub.unsubscribe(WEBCAM_EVENTS.STREAM_STOP, this.#boundHandleStreamStop);
    pubsub.unsubscribe(GESTURE_EVENTS.TIMERS_RESET, this.#boundHandleTimersReset);
    pubsub.unsubscribe(GESTURE_EVENTS.ACTION_TRIGGERED_BY_PLUGIN, this.#boundHandlePluginActionTrigger);
  }

  #subscribeToEvents(): void {
    pubsub.subscribe(
      WEBSOCKET_EVENTS.BACKEND_ACTION_RESULT,
      this.#boundHandleActionResult
    );
    pubsub.subscribe(WEBCAM_EVENTS.STREAM_STOP, this.#boundHandleStreamStop);
    pubsub.subscribe(GESTURE_EVENTS.TIMERS_RESET, this.#boundHandleTimersReset);
    pubsub.subscribe(GESTURE_EVENTS.ACTION_TRIGGERED_BY_PLUGIN, this.#boundHandlePluginActionTrigger);
  }

  updateCustomMetadataCache(metadataList?: CustomGestureMetadata[]): void {
    this.#customMetadataCache = Array.isArray(metadataList)
      ? structuredClone(metadataList)
      : [];
    this.#handleFeatureToggle();
  }

  #handleFeatureToggle = (): void => {
    if (!this.#isInitialized) return;
    if (this.#currentlyDisplayedGesture) {
      const config = this.#getActiveGestureConfigFromCache(
        this.#currentlyDisplayedGesture.name
      );
      if (!config || !this.#isActiveConfig(config)) {
        this.#currentlyDisplayedGesture = null;
        this.#updateUIDisplay([], false, 0);
      }
    }
    this.#gestureConfigsCache = this.#appStore.getState().gestureConfigs || [];
  };

  #handleActionResult = (result?: ActionResultPayload): void => {
    if (!result) return;
    this.#appStore.getState().actions.updateHistoryEntryStatus(result);
    if (!result.success && result.pluginId !== 'none') {
      pubsub.publish(UI_EVENTS.SHOW_ERROR, {
        messageKey: `Action Error: ${result.message || 'Unknown'}`,
      });
    }
  };

  #isActiveConfig(config: GestureConfig | PoseConfig): boolean {
    if (!this.#isInitialized) return false;
    const state = this.#appStore.getState();

    const gestureName =
      'gesture' in config
        ? (config as GestureConfig).gesture
        : (config as PoseConfig).pose;
    if (!gestureName) return false;

    const { category } = getGestureDisplayInfo(
      gestureName,
      this.#customMetadataCache
    );

    switch (category) {
      case 'BUILT_IN_HAND':
        return state.enableBuiltInHandGestures;
      case 'CUSTOM_HAND':
        return state.enableCustomHandGestures;
      case 'CUSTOM_POSE':
        return state.enablePoseProcessing;
      default:
        return false;
    }
  }

  #getActiveGestureConfigFromCache(
    gestureName: string
  ): GestureConfig | PoseConfig | null {
    if (!gestureName || typeof gestureName !== 'string' || !this.#isInitialized)
      return null;

    const isPotentiallyBuiltIn = BUILT_IN_HAND_GESTURES.includes(
      gestureName.toUpperCase() as (typeof BUILT_IN_HAND_GESTURES)[number]
    );
    const normalizedSearchName = isPotentiallyBuiltIn
      ? normalizeNameForMtx(gestureName).toUpperCase()
      : gestureName;

    const config = this.#gestureConfigsCache.find((c) => {
      const nameToCheck =
        'gesture' in c ? (c as GestureConfig).gesture : (c as PoseConfig).pose;
      if (!nameToCheck || typeof nameToCheck !== 'string') return false;

      const isCurrentConfigPotentiallyBuiltIn = BUILT_IN_HAND_GESTURES.includes(
        nameToCheck.toUpperCase() as (typeof BUILT_IN_HAND_GESTURES)[number]
      );
      const normalizedConfigName = isCurrentConfigPotentiallyBuiltIn
        ? normalizeNameForMtx(nameToCheck).toUpperCase()
        : nameToCheck;

      return normalizedConfigName === normalizedSearchName;
    });
    return config && this.#isActiveConfig(config) ? config : null;
  }

  checkConditions(
    currentDetections: ActionableRecognition[],
    isSuppressed: boolean
  ): void {
    if (!this.#isInitialized) return;
    this.#isActionDispatchSuppressed = isSuppressed;
    const now = Date.now();
    const isCooldownActive = this.#timerManager.isCooldownActive(now);
    this.#publishedConfidencePulse.clear();

    this.#timerManager.pruneExpiredHoldStates(now);

    const actionableDetections = currentDetections.filter((detection) => {
      const config = this.#getActiveGestureConfigFromCache(detection.name);
      return !!config;
    });

    if (!isCooldownActive && !this.#isActionDispatchSuppressed) {
      actionableDetections.forEach((detection) => {
        const config = this.#getActiveGestureConfigFromCache(detection.name);
        if (!config) return;

        const configName =
          'gesture' in config
            ? (config as GestureConfig).gesture
            : (config as PoseConfig).pose;
        const { category: gestureType } = getGestureDisplayInfo(
          configName,
          this.#customMetadataCache
        );

        let configuredThreshold = 0;
        if (config.confidence !== undefined) {
          configuredThreshold = config.confidence / 100.0;
        } else if (
          gestureType === 'BUILT_IN_HAND' ||
          gestureType === 'CUSTOM_HAND'
        ) {
          configuredThreshold = 0.5;
        }

        const confidenceMet = detection.confidence >= configuredThreshold;
        const minPresenceMs = 0;

        this.#timerManager.updateHoldState(
          configName,
          confidenceMet,
          minPresenceMs,
          now
        );

        if (
          confidenceMet &&
          (gestureType === 'BUILT_IN_HAND' ||
            gestureType === 'CUSTOM_HAND' ||
            config.confidence !== undefined) &&
          !this.#publishedConfidencePulse.has(configName)
        ) {
          pubsub.publish(GESTURE_EVENTS.CONFIDENCE_THRESHOLD_MET, configName);
          this.#publishedConfidencePulse.add(configName);
        }
      });
    } else {
      this.#timerManager.resetAllGestureHoldStates();
      this.#currentlyDisplayedGesture = null;
    }
    this.#processHeldGesturesAndDisplayLogic(
      actionableDetections,
      now,
      isCooldownActive
    );
  }

  #processHeldGesturesAndDisplayLogic(
    actionableDetections: ActionableRecognition[],
    now: number,
    isCooldownActive: boolean
  ): void {
    if (!this.#isInitialized) return;
    let triggeredGestureName: string | null = null;
    let triggeredConfig: GestureConfig | PoseConfig | null = null;
    let highestHoldPercentForDisplay = 0;
    let candidateGestureForDisplay: DisplayedGestureInfo | null = null;

    if (!isCooldownActive && !this.#isActionDispatchSuppressed) {
      actionableDetections.forEach((detection) => {
        const config = this.#getActiveGestureConfigFromCache(detection.name);
        if (!config) return;

        const configName =
          'gesture' in config
            ? (config as GestureConfig).gesture
            : (config as PoseConfig).pose;
        const holdState = this.#timerManager.getGestureHoldState(configName);

        if (holdState && holdState.startTime !== null) {
          const displayConfidence = detection.confidence;
          const holdDuration = now - holdState.startTime;
          const requiredDurationMs = (config.duration || 1.0) * 1000;
          const holdPercent =
            requiredDurationMs > 0
              ? Math.min(1, holdDuration / requiredDurationMs)
              : 0;

          if (holdPercent >= highestHoldPercentForDisplay) {
            highestHoldPercentForDisplay = holdPercent;
            candidateGestureForDisplay = {
              name: configName,
              confidence: displayConfidence,
              config,
              currentHoldMs: holdDuration,
              requiredHoldMs: requiredDurationMs,
            };
          }

          if (
            triggeredGestureName === null &&
            holdDuration >= requiredDurationMs
          ) {
            triggeredGestureName = configName;
            triggeredConfig = config;
          }
        }
      });
    }

    this.#currentlyDisplayedGesture = candidateGestureForDisplay;

    if (triggeredGestureName && triggeredConfig) {
      this.#triggerAction(
        triggeredGestureName,
        triggeredConfig,
        actionableDetections,
        now
      );
      highestHoldPercentForDisplay = 0;
      this.#currentlyDisplayedGesture = null;
    }

    this.#updateUIDisplay(
      actionableDetections,
      isCooldownActive,
      triggeredGestureName ? 0 : highestHoldPercentForDisplay
    );
  }

  #triggerAction(
    gestureName: string,
    config: GestureConfig | PoseConfig,
    currentDetections: ActionableRecognition[],
    now: number
  ): void {
    if (!this.#isInitialized || this.#isActionDispatchSuppressed) return;

    const displayGestureName = translate(
      formatGestureNameForDisplay(gestureName),
      { defaultValue: formatGestureNameForDisplay(gestureName) }
    );
    const actionConfig = config.actionConfig as ActionConfig | null;
    const pluginId = actionConfig?.pluginId || 'none';
    const { category: gestureCategory } = getGestureDisplayInfo(
      gestureName,
      this.#customMetadataCache
    );

    if (actionConfig && pluginId !== 'none') {
      const latestDetectionForAction = currentDetections.find(
        (d) => d.name === gestureName
      );
      const actionConfidence =
        latestDetectionForAction?.confidence ??
        (config.confidence !== undefined ? config.confidence / 100.0 : 1.0);
      const actionDetails = {
        gestureName,
        confidence: actionConfidence,
        timestamp: now,
      };
      webSocketService.sendDispatchAction(config, actionDetails);
    }

    pubsub.publish(GESTURE_EVENTS.DETECTED_ALERT, {
      gesture: displayGestureName,
      actionType: pluginId,
    });

    const historyEntryPayload: Partial<HistoryEntry> = {
      gesture: gestureName,
      actionType: pluginId,
      gestureCategory: gestureCategory,
      details: config.actionConfig,
    };

    this.#appStore.getState().actions.addHistoryEntry(historyEntryPayload);
    this.#timerManager.startGlobalCooldown(now);
    this.#timerManager.resetAllGestureHoldStates();
  }

  #updateUIDisplay(
    currentDetections: ActionableRecognition[],
    isCooldownActive: boolean,
    currentMaxHoldPercent: number
  ): void {
    if (!this.#isInitialized) return;
    const displayStatus: DisplayStatus = {
      gesture: '-',
      confidence: '-',
      realtimeConfidence: 0,
      configuredThreshold: null,
      isCooldownActive,
    };
    let currentHoldMsForDisplay = 0;
    let requiredHoldMsForDisplay = 0;

    if (this.#currentlyDisplayedGesture && !isCooldownActive && !this.#isActionDispatchSuppressed) {
      const heldInfo = this.#currentlyDisplayedGesture;
      displayStatus.gesture = heldInfo.name; // Keep internal name for logic
      displayStatus.realtimeConfidence = heldInfo.confidence;
      displayStatus.configuredThreshold =
        typeof heldInfo.config.confidence === 'number'
          ? heldInfo.config.confidence / 100.0
          : null;
      currentHoldMsForDisplay = heldInfo.currentHoldMs;
      requiredHoldMsForDisplay = heldInfo.requiredHoldMs;
    } else if (!isCooldownActive && !this.#isActionDispatchSuppressed && currentDetections.length > 0) {
      const topActiveGesture = currentDetections
        .filter((d) => d.confidence > 0)
        .reduce(
          (prev, current) =>
            current.confidence > prev.confidence ? current : prev,
          { name: '-', confidence: 0 }
        );

      if (topActiveGesture.name !== '-') {
        const config = this.#getActiveGestureConfigFromCache(
          topActiveGesture.name
        );
        if (config) {
          displayStatus.gesture = topActiveGesture.name; // Keep internal name
          displayStatus.realtimeConfidence = topActiveGesture.confidence;
          displayStatus.configuredThreshold =
            typeof config.confidence === 'number'
              ? config.confidence / 100.0
              : null;
        }
      }
    }

    if (displayStatus.gesture === '-') this.#currentlyDisplayedGesture = null;

    if (displayStatus.gesture === '-') displayStatus.confidence = '-';
    else if (displayStatus.configuredThreshold !== null)
      displayStatus.confidence = `${Math.round(
        displayStatus.configuredThreshold * 100
      )}%`;
    else displayStatus.confidence = '--';

    pubsub.publish(GESTURE_EVENTS.UPDATE_STATUS, displayStatus);
    this.#publishProgress({
      holdPercent: this.#isActionDispatchSuppressed ? 0 : currentMaxHoldPercent,
      cooldownPercent: this.#timerManager.getGlobalCooldownPercent(),
      currentHoldMs: currentHoldMsForDisplay,
      requiredHoldMs: requiredHoldMsForDisplay,
      remainingCooldownMs: this.#timerManager.getRemainingCooldownMs(),
    });
  }

  #publishProgress(progressData: ProgressData): void {
    pubsub.publish(GESTURE_EVENTS.UPDATE_PROGRESS, progressData);
  }
  resetHoldTimers(): void {
    this.#timerManager.resetAllGestureHoldStates();
    this.#currentlyDisplayedGesture = null;
  }
  resetCooldown(): void {
    this.#timerManager.resetGlobalCooldown();
  }
}