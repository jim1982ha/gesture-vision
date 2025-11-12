/* FILE: packages/frontend/src/services/gesture.service.ts */
import { GESTURE_EVENTS, pubsub, type EnrichedGestureConfig, type ActionConfig, type ActionDetails, WEBCAM_EVENTS, type GestureCategoryIconType, type EnrichedPoseConfig } from '#shared/index.js';
import { webSocketService } from './websocket-service.js';
import type { AppStore } from '#frontend/core/state/app-store.js';
import type { TranslationService } from './translation.service.js';
import type { HistoryEntry } from '#frontend/types/index.js';
import type { Landmark } from '@mediapipe/tasks-vision';

interface HoldState {
  startTime: number | null;
  lastSeen: number;
}

interface ActionableRecognition {
  name: string;
  confidence: number;
}

interface MatchedDetection {
  detection: ActionableRecognition;
  config: EnrichedGestureConfig;
}

interface FeedbackStateForUpdate {
  gestureName: string;
  realtimeConfidence: number;
  configuredThreshold: number | null;
  holdPercent: number;
  currentHoldMs: number;
  requiredHoldMs: number;
}

interface Vector3D { x: number; y: number; z: number; }
interface BasePoseRule {
    p1: number; p2: number;
    x: { mean: number }; y: { mean: number }; z: { mean: number };
}

const GESTURE_STATE_PRUNE_MS = 250;

export class GestureService {
  #appStore: AppStore;
  #translationService: TranslationService;
  #holdState: Record<string, HoldState> = {};
  #globalCooldownEndTime = 0;
  #isActionDispatchSuppressed = false;
  #subscriptions: (() => void)[] = [];

  constructor(appStore: AppStore, translationService: TranslationService) {
    this.#appStore = appStore;
    this.#translationService = translationService;

    this.#subscriptions.push(
      pubsub.subscribe(WEBCAM_EVENTS.STREAM_STOP, this.#resetAllTimersAndStates),
      pubsub.subscribe(GESTURE_EVENTS.SUPPRESS_ACTIONS, () => { this.#isActionDispatchSuppressed = true; }),
      pubsub.subscribe(GESTURE_EVENTS.RESUME_ACTIONS, () => { this.#isActionDispatchSuppressed = false; })
    );
  }

  public destroy(): void {
    this.#subscriptions.forEach(unsub => unsub());
    this.#subscriptions = [];
  }

  public processDetections(detections: ActionableRecognition[], worldLandmarks?: Landmark[]): void {
    const now = Date.now();
    const state = this.#appStore.getState();

    let allDetections = detections;
    if (state.enablePoseProcessing && worldLandmarks) {
      const poseConfigs = state.gestureConfigs.filter((c): c is EnrichedPoseConfig => 'pose' in c);
      allDetections = [...detections, ...this.#checkForStaticPoses(worldLandmarks, poseConfigs)];
    }

    const matchedDetections: MatchedDetection[] = allDetections
      .map(d => ({ detection: d, config: this.#getActiveConfig(d.name, state.gestureConfigs) }))
      .filter((item): item is MatchedDetection => item.config !== null);

    this.#pruneExpiredHoldStates(now);

    if (!this.#isCooldownActive(now) && !this.#isActionDispatchSuppressed) {
      this.#updateGestureHoldStates(matchedDetections, now);
    }
    
    this.#processAndDispatch(matchedDetections, now);
  }

  #getActiveConfig(gestureName: string, configs: EnrichedGestureConfig[]): EnrichedGestureConfig | null {
    const config = configs.find(c => c.display.name === gestureName);
    if (!config) return null;

    const { enableBuiltInHandGestures, enableCustomHandGestures, enablePoseProcessing } = this.#appStore.getState();
    switch (config.display.category) {
        case 'BUILT_IN_HAND': return enableBuiltInHandGestures ? config : null;
        case 'CUSTOM_HAND': return enableCustomHandGestures ? config : null;
        case 'CUSTOM_POSE': return enablePoseProcessing ? config : null;
        default: return null;
    }
  }

  #updateGestureHoldStates(matchedDetections: MatchedDetection[], now: number): void {
    matchedDetections.forEach(({ detection, config }) => {
      const gestureName = config.display.name;
      const confidenceMet = detection.confidence >= (config.confidence ?? 50) / 100.0;
      
      const state = this.#holdState[gestureName];
      if (confidenceMet) {
        if (!state) this.#holdState[gestureName] = { startTime: now, lastSeen: now };
        else {
          state.lastSeen = now;
          if (state.startTime === null) state.startTime = now;
        }
      } else if (state) {
        state.startTime = null;
        state.lastSeen = now;
      }
    });
  }

  #processAndDispatch(matchedDetections: MatchedDetection[], now: number): void {
    const isCooldownActive = this.#isCooldownActive(now);
    let triggeredMatch: MatchedDetection | null = null;
    let primaryMatchForDisplay: MatchedDetection | null = null;

    const gestureInHold = Object.entries(this.#holdState).find(([, state]) => state.startTime !== null)?.[0];
    if (gestureInHold) {
      primaryMatchForDisplay = matchedDetections.find(item => item.config.display.name === gestureInHold) || null;
    } else if (matchedDetections.length > 0) {
      primaryMatchForDisplay = matchedDetections.reduce((prev, current) => (prev.detection.confidence > current.detection.confidence) ? prev : current);
    }
  
    if (!isCooldownActive && !this.#isActionDispatchSuppressed) {
      for (const item of matchedDetections) {
        const holdState = this.#holdState[item.config.display.name];
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
      this.#triggerAction(triggeredMatch.config, matchedDetections, now);
      this.#startGlobalCooldown(now);
      this.#resetAllGestureHoldStates();
    }
  }

  #triggerAction(config: EnrichedGestureConfig, currentDetections: MatchedDetection[], now: number): void {
    const gestureName = config.display.name;
    const actionConfig = config.actionConfig as ActionConfig | null;
    const pluginId = actionConfig?.pluginId || 'none';

    if (actionConfig && pluginId !== 'none') {
        const latestDetection = currentDetections.find(d => d.config.display.name === gestureName);
        const actionConfidence = latestDetection?.detection.confidence ?? ((config.confidence ?? 50) / 100.0);
        const actionDetails: ActionDetails = { gestureName, confidence: actionConfidence, timestamp: now };
        webSocketService.sendDispatchAction(config, actionDetails);
    }

    const historyEntryPayload: Partial<HistoryEntry> = {
        gesture: gestureName,
        actionType: pluginId,
        gestureCategory: config.display.category as GestureCategoryIconType,
        details: config.actionConfig
    };
    this.#appStore.getState().actions.addHistoryEntry(historyEntryPayload);
    pubsub.publish(GESTURE_EVENTS.DETECTED_ALERT, { gesture: gestureName, actionType: pluginId });
  }

  #updateUIDisplay(primaryMatch: MatchedDetection | null, now: number, isCooldownActive: boolean): void {
    const feedbackState: FeedbackStateForUpdate = {
        gestureName: '-', realtimeConfidence: 0, configuredThreshold: null,
        holdPercent: 0, currentHoldMs: 0, requiredHoldMs: 0,
    };

    if (primaryMatch && !isCooldownActive && !this.#isActionDispatchSuppressed) {
        const { detection, config } = primaryMatch;
        feedbackState.gestureName = config.display.name;
        feedbackState.realtimeConfidence = detection.confidence;
        feedbackState.configuredThreshold = (config.confidence ?? 50) / 100.0;
        
        const holdState = this.#holdState[config.display.name];
        if (holdState?.startTime) {
            feedbackState.currentHoldMs = now - holdState.startTime;
            feedbackState.requiredHoldMs = (config.duration || 1.0) * 1000;
            feedbackState.holdPercent = feedbackState.requiredHoldMs > 0 ? Math.min(1, feedbackState.currentHoldMs / feedbackState.requiredHoldMs) : 0;
        }
    }
    
    pubsub.publish(GESTURE_EVENTS.UI_FEEDBACK_UPDATE, {
      ...feedbackState,
      gestureText: this.#translationService.translate(feedbackState.gestureName, { defaultValue: feedbackState.gestureName }),
      isCooldownActive,
      cooldownPercent: this.#getGlobalCooldownPercent(now),
    });
  }

  #pruneExpiredHoldStates = (now: number): void => Object.keys(this.#holdState).forEach(key => { 
    if (now - this.#holdState[key].lastSeen > GESTURE_STATE_PRUNE_MS) delete this.#holdState[key];
  });
  
  #isCooldownActive = (now: number): boolean => now < this.#globalCooldownEndTime;
  #getGlobalCooldownPercent = (now: number): number => {
    const cooldownMs = (this.#appStore.getState().globalCooldown ?? 0) * 1000;
    if (cooldownMs <= 0 || !this.#isCooldownActive(now)) return 0;
    const startTime = this.#globalCooldownEndTime - cooldownMs;
    return Math.min(1, (now - startTime) / cooldownMs);
  };
  #startGlobalCooldown = (now: number): void => {
    this.#globalCooldownEndTime = now + (this.#appStore.getState().globalCooldown * 1000);
  };

  #resetAllGestureHoldStates = (): void => { this.#holdState = {}; };
  #resetAllTimersAndStates = (): void => {
    this.#globalCooldownEndTime = 0;
    this.#resetAllGestureHoldStates();
    pubsub.publish(GESTURE_EVENTS.TIMERS_RESET);
  };

  #subtract = (v1: Vector3D, v2: Vector3D): Vector3D => ({ x: v1.x - v2.x, y: v1.y - v2.y, z: v1.z - v2.z });
  #normalize = (v: Vector3D): Vector3D => {
    const mag = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
    return mag > 1e-6 ? { x: v.x / mag, y: v.y / mag, z: v.z / mag } : { x: 0, y: 0, z: 0 };
  }
  #dot = (v1: Vector3D, v2: Vector3D): number => v1.x * v2.x + v1.y * v2.y + v1.z * v2.z;

  #checkForStaticPoses(worldLandmarks: Landmark[], poseConfigs: EnrichedPoseConfig[]): ActionableRecognition[] {
    if (poseConfigs.length === 0 || worldLandmarks.length < 33) return [];
    
    const detectedPoses: ActionableRecognition[] = [];
    const customMetadata = this.#appStore.getState().customGestureMetadataList;

    for (const config of poseConfigs) {
      const meta = customMetadata.find(m => m.name === config.pose);
      // @ts-expect-error - baseRules is not strongly typed on metadata, which is expected as it comes from a JS file.
      const rules = meta?.baseRules as { vectors?: BasePoseRule[] } | undefined;
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
}