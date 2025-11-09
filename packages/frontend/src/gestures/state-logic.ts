/* FILE: packages/frontend/src/gestures/state-logic.ts */
// Orchestrates gesture detection logic by coordinating timers, configuration, actions, and UI updates.
import type { AppStore } from '#frontend/core/state/app-store.js';
import { GESTURE_EVENTS, pubsub, type GestureConfig, type PoseConfig, type RoiConfig } from '#shared/index.js';
import type { TranslationService } from '#frontend/services/translation.service.js';
import { GestureTimerManager } from './logic/gesture-timer-manager.js';
import { GestureConfigManager } from './logic/gesture-config-manager.js';
import { GestureActionHandler } from './logic/gesture-action-handler.js';
import { GestureUIDispatcher } from './logic/gesture-ui-dispatcher.js';
import type { Landmark } from '@mediapipe/tasks-vision';

interface ActionableRecognition {
  name: string;
  confidence: number;
}

// This interface pairs a raw detection with its canonical configuration object.
interface MatchedDetection {
  detection: ActionableRecognition;
  config: GestureConfig | PoseConfig;
}

interface Vector3D { x: number; y: number; z: number; }
interface BasePoseRule {
    p1: number; p2: number;
    x: { mean: number }; y: { mean: number }; z: { mean: number };
}

export class GestureStateLogic {
  #appStore: AppStore;
  #timerManager: GestureTimerManager;
  #configManager: GestureConfigManager;
  #actionHandler: GestureActionHandler;
  #uiDispatcher: GestureUIDispatcher;

  #publishedConfidencePulse = new Set<string>();
  #isActionDispatchSuppressed = false;
  #activeStreamRoi: RoiConfig | null = null;
  #poseConfigs: PoseConfig[] = [];

  #boundHandleSuppressActions: () => void;
  #boundHandleResumeActions: () => void;
  
  constructor(appStore: AppStore, translationService: TranslationService) {
    this.#appStore = appStore;
    this.#timerManager = new GestureTimerManager(appStore);
    this.#configManager = new GestureConfigManager(appStore);
    this.#actionHandler = new GestureActionHandler(appStore);
    this.#uiDispatcher = new GestureUIDispatcher(translationService);
    
    this.#boundHandleSuppressActions = () => { this.#isActionDispatchSuppressed = true; };
    this.#boundHandleResumeActions = () => { this.#isActionDispatchSuppressed = false; };
    this.#subscribeToEvents();

    this.#appStore.subscribe(state => {
      this.#poseConfigs = state.gestureConfigs.filter((c): c is PoseConfig => 'pose' in c);
    });
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

  #subtract = (v1: Vector3D, v2: Vector3D): Vector3D => ({ x: v1.x - v2.x, y: v1.y - v2.y, z: v1.z - v2.z });
  #normalize = (v: Vector3D): Vector3D => {
    const mag = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
    return mag > 1e-6 ? { x: v.x / mag, y: v.y / mag, z: v.z / mag } : { x: 0, y: 0, z: 0 };
  }
  #dot = (v1: Vector3D, v2: Vector3D): number => v1.x * v2.x + v1.y * v2.y + v1.z * v2.z;

  public checkForStaticPoses(worldLandmarks: Landmark[]): ActionableRecognition[] {
    if (!this.#appStore.getState().enablePoseProcessing || this.#poseConfigs.length === 0 || !worldLandmarks || worldLandmarks.length < 33) {
      return [];
    }
    const detectedPoses: ActionableRecognition[] = [];
    for (const config of this.#poseConfigs) {
      const customMeta = this.#appStore.getState().customGestureMetadataList.find(m => m.name === config.pose);
      // @ts-expect-error - baseRules is not strongly typed on metadata
      const rules = customMeta?.baseRules as { vectors?: BasePoseRule[] } | undefined;
      if (!rules?.vectors || rules.vectors.length === 0) continue;
      let totalSimilarity = 0;
      let validVectorCount = 0;
      for (const rule of rules.vectors) {
        const p1 = worldLandmarks[rule.p1];
        const p2 = worldLandmarks[rule.p2];
        if (!p1 || !p2) continue;
        const liveVector = this.#normalize(this.#subtract(p1, p2));
        const referenceVector = { x: rule.x.mean, y: rule.y.mean, z: rule.z.mean };
        const similarity = this.#dot(liveVector, referenceVector);
        totalSimilarity += similarity;
        validVectorCount++;
      }
      if (validVectorCount > 0) {
        const confidence = Math.max(0, Math.min(1, totalSimilarity / validVectorCount));
        detectedPoses.push({ name: config.pose, confidence });
      }
    }
    return detectedPoses;
  }

  checkConditions(currentDetections: ActionableRecognition[]): void {
    const now = Date.now();
    const isCooldownActive = this.#timerManager.isCooldownActive(now);
    this.#publishedConfidencePulse.clear();
    this.#timerManager.pruneExpiredHoldStates(now);
    
    const matchedDetections: MatchedDetection[] = currentDetections
      .map(detection => ({
        detection,
        config: this.#configManager.getActiveConfig(detection.name),
      }))
      .filter((item): item is MatchedDetection => item.config !== null);

    if (!isCooldownActive && !this.#isActionDispatchSuppressed) {
      this.#updateGestureHoldStates(matchedDetections, now);
    }
    
    this.#processAndDispatch(matchedDetections, now, isCooldownActive);
  }

  #updateGestureHoldStates(matchedDetections: MatchedDetection[], now: number): void {
    matchedDetections.forEach(item => {
      const { detection, config } = item;
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
  
  #processAndDispatch(matchedDetections: MatchedDetection[], now: number, isCooldownActive: boolean): void {
    let triggeredMatch: MatchedDetection | null = null;
    let primaryMatchForDisplay: MatchedDetection | null = null;
    
    const gestureInHold = this.#timerManager.getGestureInHoldState(now);

    if (gestureInHold) {
      primaryMatchForDisplay = matchedDetections.find(item => {
        const configName = 'gesture' in item.config ? item.config.gesture : item.config.pose;
        return configName === gestureInHold;
      }) || null;
    }
    
    if (!primaryMatchForDisplay && matchedDetections.length > 0) {
      primaryMatchForDisplay = matchedDetections.reduce((prev, current) => (prev.detection.confidence > current.detection.confidence) ? prev : current);
    }
  
    if (!isCooldownActive && !this.#isActionDispatchSuppressed) {
      for (const item of matchedDetections) {
        const configName = 'gesture' in item.config ? item.config.gesture : item.config.pose;
        const holdState = this.#timerManager.getGestureHoldState(configName);

        if (holdState?.startTime) {
          const holdDuration = now - holdState.startTime;
          const requiredDurationMs = (item.config.duration || 1.0) * 1000;
          
          if (holdDuration >= requiredDurationMs) {
            triggeredMatch = item;
            break; 
          }
        }
      }
    }

    this.#updateUIDisplay(primaryMatchForDisplay, now, isCooldownActive);

    if (triggeredMatch) {
      const triggeredGestureName = 'gesture' in triggeredMatch.config ? triggeredMatch.config.gesture : triggeredMatch.config.pose;
      console.log(`[GestureStateLogic] TRIGGERING action for '${triggeredGestureName}'.`);
      this.#actionHandler.trigger(triggeredGestureName, triggeredMatch.config, matchedDetections.map(m => m.detection), now);
      this.#timerManager.startGlobalCooldown(now);
      this.#timerManager.resetAllGestureHoldStates();
    }
  }

  #updateUIDisplay(primaryMatch: MatchedDetection | null, now: number, isCooldownActive: boolean): void {
    let gestureName = '-';
    let realtimeConfidence = 0;
    let configuredThreshold: number | null = null;
    let holdPercent = 0;
    let currentHoldMs = 0;
    let requiredHoldMs = 0;

    if (primaryMatch && !isCooldownActive && !this.#isActionDispatchSuppressed) {
        const { detection, config } = primaryMatch;
        const configName = 'gesture' in config ? config.gesture : config.pose;

        gestureName = configName;
        realtimeConfidence = detection.confidence;
        configuredThreshold = (config.confidence ?? 50) / 100.0;
        
        const holdState = this.#timerManager.getGestureHoldState(configName);
        if (holdState?.startTime) {
            currentHoldMs = now - holdState.startTime;
            requiredHoldMs = (config.duration || 1.0) * 1000;
            holdPercent = requiredHoldMs > 0 ? Math.min(1, currentHoldMs / requiredHoldMs) : 0;
        }
    }
    
    this.#uiDispatcher.update({
        gestureName, 
        realtimeConfidence, 
        configuredThreshold, 
        isCooldownActive,
        holdPercent,
        cooldownPercent: this.#timerManager.getGlobalCooldownPercent(now),
        currentHoldMs,
        requiredHoldMs,
    });
  }

  public getTimerManager = (): GestureTimerManager => this.#timerManager;
  public setActiveStreamRoi = (roi: RoiConfig | null): void => { this.#activeStreamRoi = roi; };
  public getActiveStreamRoi = (): RoiConfig | null => this.#activeStreamRoi;
  public resetHoldTimers = (): void => { this.#timerManager.resetAllGestureHoldStates(); };
  public resetCooldown = (): void => { this.#timerManager.resetGlobalCooldown(); };
  public resetUIDisplay = (): void => { this.#uiDispatcher.reset(); };
}