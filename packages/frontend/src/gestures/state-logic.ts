/* FILE: packages/frontend/src/gestures/state-logic.ts */
// Orchestrates gesture detection logic by coordinating timers, configuration, actions, and UI updates.
import type { AppStore } from '#frontend/core/state/app-store.js';
import { GESTURE_EVENTS, pubsub, type GestureConfig, type PoseConfig, type RoiConfig } from '#shared/index.js';
import { GestureTimerManager } from './logic/gesture-timer-manager.js';
import { GestureConfigManager } from './logic/GestureConfigManager.js';
import { GestureActionHandler } from './logic/GestureActionHandler.js';
import { GestureUIDispatcher } from './logic/GestureUIDispatcher.js';
import type { TranslationService } from '#frontend/services/translation.service.js';

interface ActionableRecognition {
  name: string;
  confidence: number;
}

interface DisplayedGestureInfo {
  name: string;
  confidence: number;
  config: GestureConfig | PoseConfig;
  currentHoldMs: number;
  requiredHoldMs: number;
}

export class GestureStateLogic {
  #timerManager: GestureTimerManager;
  #configManager: GestureConfigManager;
  #actionHandler: GestureActionHandler;
  #uiDispatcher: GestureUIDispatcher;

  #publishedConfidencePulse = new Set<string>();
  #currentlyDisplayedGesture: DisplayedGestureInfo | null = null;
  #isActionDispatchSuppressed = false;
  #activeStreamRoi: RoiConfig | null = null;

  #boundHandleSuppressActions: () => void;
  #boundHandleResumeActions: () => void;
  
  constructor(appStore: AppStore, translationService: TranslationService) {
    // Instantiate the new logical components
    this.#timerManager = new GestureTimerManager(appStore);
    this.#configManager = new GestureConfigManager(appStore);
    this.#actionHandler = new GestureActionHandler(appStore);
    this.#uiDispatcher = new GestureUIDispatcher(appStore, translationService);
    
    this.#boundHandleSuppressActions = () => { this.#isActionDispatchSuppressed = true; };
    this.#boundHandleResumeActions = () => { this.#isActionDispatchSuppressed = false; };
    this.#subscribeToEvents();
  }

  destroy(): void {
    this.#configManager.destroy();
    this.#timerManager.destroy();
    pubsub.unsubscribe(GESTURE_EVENTS.SUPPRESS_ACTIONS, this.#boundHandleSuppressActions);
    pubsub.unsubscribe(GESTURE_EVENTS.RESUME_ACTIONS, this.#boundHandleResumeActions);
  }

  #subscribeToEvents(): void {
    pubsub.subscribe(GESTURE_EVENTS.SUPPRESS_ACTIONS, this.#boundHandleSuppressActions);
    pubsub.subscribe(GESTURE_EVENTS.RESUME_ACTIONS, this.#boundHandleResumeActions);
  }

  checkConditions(currentDetections: ActionableRecognition[]): void {
    const now = Date.now();
    const isCooldownActive = this.#timerManager.isCooldownActive(now);
    this.#publishedConfidencePulse.clear();
    this.#timerManager.pruneExpiredHoldStates(now);

    const actionableDetections = currentDetections.filter(detection => this.#configManager.getActiveConfig(detection.name));

    if (!isCooldownActive && !this.#isActionDispatchSuppressed) {
      this.#updateGestureHoldStates(actionableDetections, now);
    } else {
      this.#timerManager.resetAllGestureHoldStates();
      this.#currentlyDisplayedGesture = null;
    }
    
    this.#processHeldGesturesAndDisplayLogic(actionableDetections, now, isCooldownActive);
  }

  #updateGestureHoldStates(detections: ActionableRecognition[], now: number): void {
    detections.forEach(detection => {
      const config = this.#configManager.getActiveConfig(detection.name);
      if (!config) return;

      const configName = 'gesture' in config ? config.gesture : config.pose;
      const configuredThreshold = (config.confidence ?? 50) / 100.0;
      const confidenceMet = detection.confidence >= configuredThreshold;
      
      this.#timerManager.updateHoldState(configName, confidenceMet, now);
      
      if (confidenceMet && !this.#publishedConfidencePulse.has(configName)) {
        pubsub.publish(GESTURE_EVENTS.CONFIDENCE_THRESHOLD_MET, configName);
        this.#publishedConfidencePulse.add(configName);
      }
    });
  }

  #processHeldGesturesAndDisplayLogic(actionableDetections: ActionableRecognition[], now: number, isCooldownActive: boolean): void {
    let triggeredGestureName: string | null = null;
    let triggeredConfig: GestureConfig | PoseConfig | null = null;
    let highestHoldPercent = 0;
    let candidateForDisplay: DisplayedGestureInfo | null = null;

    if (!isCooldownActive && !this.#isActionDispatchSuppressed) {
      actionableDetections.forEach(detection => {
        const config = this.#configManager.getActiveConfig(detection.name);
        if (!config) return;

        const configName = 'gesture' in config ? config.gesture : config.pose;
        const holdState = this.#timerManager.getGestureHoldState(configName);

        if (holdState?.startTime) {
          const holdDuration = now - holdState.startTime;
          const requiredDurationMs = (config.duration || 1.0) * 1000;
          const holdPercent = requiredDurationMs > 0 ? Math.min(1, holdDuration / requiredDurationMs) : 0;

          if (holdPercent >= highestHoldPercent) {
            highestHoldPercent = holdPercent;
            candidateForDisplay = { name: configName, confidence: detection.confidence, config, currentHoldMs: holdDuration, requiredHoldMs: requiredDurationMs };
          }

          if (!triggeredGestureName && holdDuration >= requiredDurationMs) {
            triggeredGestureName = configName;
            triggeredConfig = config;
          }
        }
      });
    }
    
    this.#currentlyDisplayedGesture = candidateForDisplay;
    this.#updateUIDisplay(isCooldownActive, highestHoldPercent);
    
    if (triggeredGestureName && triggeredConfig) {
      this.#actionHandler.trigger(triggeredGestureName, triggeredConfig, actionableDetections, now);
      this.#timerManager.startGlobalCooldown(now);
      this.#timerManager.resetAllGestureHoldStates();
      this.#currentlyDisplayedGesture = null;
    }
  }

  #updateUIDisplay(isCooldownActive: boolean, currentMaxHoldPercent: number): void {
    let gesture = '-';
    let realtimeConfidence = 0;
    let configuredThreshold: number | null = null;

    if (this.#currentlyDisplayedGesture && !isCooldownActive && !this.#isActionDispatchSuppressed) {
        gesture = this.#currentlyDisplayedGesture.name;
        realtimeConfidence = this.#currentlyDisplayedGesture.confidence;
        configuredThreshold = typeof this.#currentlyDisplayedGesture.config.confidence === 'number' ? this.#currentlyDisplayedGesture.config.confidence / 100.0 : null;
    }
    
    if (gesture === '-') this.#currentlyDisplayedGesture = null;

    this.#uiDispatcher.update({
        gesture, realtimeConfidence, configuredThreshold, isCooldownActive,
        holdPercent: this.#isActionDispatchSuppressed ? 0 : currentMaxHoldPercent,
        cooldownPercent: this.#timerManager.getGlobalCooldownPercent(),
        currentHoldMs: this.#currentlyDisplayedGesture?.currentHoldMs || 0,
        requiredHoldMs: this.#currentlyDisplayedGesture?.requiredHoldMs || 0,
        remainingCooldownMs: this.#timerManager.getRemainingCooldownMs(),
    });
  }

  public getTimerManager = (): GestureTimerManager => this.#timerManager;
  public setActiveStreamRoi = (roi: RoiConfig | null): void => { this.#activeStreamRoi = roi; };
  public getActiveStreamRoi = (): RoiConfig | null => this.#activeStreamRoi;
  public resetHoldTimers = (): void => { this.#timerManager.resetAllGestureHoldStates(); this.#currentlyDisplayedGesture = null; };
  public resetCooldown = (): void => { this.#timerManager.resetGlobalCooldown(); };
}