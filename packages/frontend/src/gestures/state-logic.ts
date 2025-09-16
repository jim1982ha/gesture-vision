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

export class GestureStateLogic {
  #timerManager: GestureTimerManager;
  #configManager: GestureConfigManager;
  #actionHandler: GestureActionHandler;
  #uiDispatcher: GestureUIDispatcher;

  #publishedConfidencePulse = new Set<string>();
  #isActionDispatchSuppressed = false;
  #activeStreamRoi: RoiConfig | null = null;

  #boundHandleSuppressActions: () => void;
  #boundHandleResumeActions: () => void;
  
  constructor(appStore: AppStore, translationService: TranslationService) {
    // Instantiate the new logical components
    this.#timerManager = new GestureTimerManager(appStore);
    this.#configManager = new GestureConfigManager(appStore);
    this.#actionHandler = new GestureActionHandler(appStore);
    this.#uiDispatcher = new GestureUIDispatcher(translationService); // FIX: Removed appStore argument
    
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
    }
    
    this.#processGesturesAndDisplayLogic(actionableDetections, now, isCooldownActive);
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

  #processGesturesAndDisplayLogic(actionableDetections: ActionableRecognition[], now: number, isCooldownActive: boolean): void {
    let triggeredGestureName: string | null = null;
    let triggeredConfig: GestureConfig | PoseConfig | null = null;
    
    // 1. Determine the best gesture to display based on highest confidence.
    let primaryGestureForDisplay: ActionableRecognition | null = null;
    if (actionableDetections.length > 0) {
        primaryGestureForDisplay = actionableDetections.reduce((prev, current) => 
            (prev.confidence > current.confidence) ? prev : current
        );
    }

    // 2. Process hold timers and action triggers only for gestures meeting their threshold.
    if (!isCooldownActive && !this.#isActionDispatchSuppressed) {
      actionableDetections.forEach(detection => {
        const config = this.#configManager.getActiveConfig(detection.name);
        if (!config) return;

        const configName = 'gesture' in config ? config.gesture : config.pose;
        const holdState = this.#timerManager.getGestureHoldState(configName);

        if (holdState?.startTime) {
          const holdDuration = now - holdState.startTime;
          const requiredDurationMs = (config.duration || 1.0) * 1000;
          
          if (!triggeredGestureName && holdDuration >= requiredDurationMs) {
            triggeredGestureName = configName;
            triggeredConfig = config;
          }
        }
      });
    }

    // 3. Update the UI display based on the highest confidence gesture found in step 1.
    this.#updateUIDisplay(primaryGestureForDisplay, now, isCooldownActive);

    if (triggeredGestureName && triggeredConfig) {
      this.#actionHandler.trigger(triggeredGestureName, triggeredConfig, actionableDetections, now);
      this.#timerManager.startGlobalCooldown(now);
      this.#timerManager.resetAllGestureHoldStates();
    }
  }

  #updateUIDisplay(primaryGesture: ActionableRecognition | null, now: number, isCooldownActive: boolean): void {
    let gesture = '-';
    let realtimeConfidence = 0;
    let configuredThreshold: number | null = null;
    let holdPercent = 0;
    let currentHoldMs = 0;
    let requiredHoldMs = 0;

    if (primaryGesture && !isCooldownActive && !this.#isActionDispatchSuppressed) {
        const config = this.#configManager.getActiveConfig(primaryGesture.name);
        if (config) {
            gesture = primaryGesture.name;
            realtimeConfidence = primaryGesture.confidence;
            configuredThreshold = (config.confidence ?? 50) / 100.0;

            const holdState = this.#timerManager.getGestureHoldState(gesture);
            if (holdState?.startTime) {
                currentHoldMs = now - holdState.startTime;
                requiredHoldMs = (config.duration || 1.0) * 1000;
                holdPercent = requiredHoldMs > 0 ? Math.min(1, currentHoldMs / requiredHoldMs) : 0;
            }
        }
    }
    
    this.#uiDispatcher.update({
        gesture, realtimeConfidence, configuredThreshold, isCooldownActive,
        holdPercent,
        cooldownPercent: this.#timerManager.getGlobalCooldownPercent(now),
        currentHoldMs,
        requiredHoldMs,
        remainingCooldownMs: this.#timerManager.getRemainingCooldownMs(now),
    });
  }

  public getTimerManager = (): GestureTimerManager => this.#timerManager;
  public setActiveStreamRoi = (roi: RoiConfig | null): void => { this.#activeStreamRoi = roi; };
  public getActiveStreamRoi = (): RoiConfig | null => this.#activeStreamRoi;
  public resetHoldTimers = (): void => { this.#timerManager.resetAllGestureHoldStates(); };
  public resetCooldown = (): void => { this.#timerManager.resetGlobalCooldown(); };
}