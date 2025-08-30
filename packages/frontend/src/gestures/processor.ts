/* FILE: packages/frontend/src/gestures/processor.ts */
// Orchestrates gesture and pose recognition using a Web Worker.
// Manages model loading, frame processing, and communication with the worker.
import type { AppStore } from '#frontend/core/state/app-store.js';
import type { FrameAnalysisFrameData } from '#frontend/types/index.js';
import { GESTURE_EVENTS, UI_EVENTS, pubsub, type RoiConfig, type CustomGestureMetadata } from '#shared/index.js';
import { MIN_FRAME_INTERVAL_MS, MAX_FRAME_INTERVAL_MS, TARGET_PROCESSING_TIME_FACTOR } from '#frontend/constants/app-defaults.js';
import { GestureStateLogic } from './state-logic.js';
import { GestureWorkerManager } from '#frontend/services/gesture-worker-manager.js';
import type { Landmark } from '@mediapipe/tasks-vision';
import type { CanvasRenderer } from '#frontend/camera/canvas-renderer.js';

interface ProcessorState {
  processingEnabled: boolean;
  isTestModeActive: boolean;
  lastFrameSentTime: number;
  currentDynamicIntervalMs: number;
  targetFrameIntervalMs: number;
}

interface RenderOutputData {
    processingTime?: number;
    handGestureResults?: {
        gestures?: { categoryName?: string; score?: number }[][];
        landmarks?: Landmark[][];
        [key: string]: unknown
    };
    customActionableGestures?: { categoryName?: string; score?: number }[];
    poseLandmarkerResults?: { landmarks?: Landmark[][]; [key: string]: unknown };
    [key: string]: unknown;
}

export class GestureProcessor {
  #appStore: AppStore;
  #workerManager: GestureWorkerManager;
  #stateLogic: GestureStateLogic;
  #state: ProcessorState;
  #reconfigureDebounceTimer: number | null = null;
  #testModeRules: object | null = null;
  #testModeTolerance = 0.2;
  #canvasRendererRef: CanvasRenderer | null = null;
  #processingOverride: { hand: boolean; pose: boolean; numHands: number } | undefined;

  constructor(appStore: AppStore) {
    this.#appStore = appStore;
    this.#stateLogic = new GestureStateLogic(this.#appStore);
    this.#workerManager = new GestureWorkerManager(this.#appStore);
    
    const state = this.#appStore.getState();
    const targetInterval = 1000 / (state.targetFpsPreference || 15);
    this.#state = {
      processingEnabled: false, isTestModeActive: false, lastFrameSentTime: 0,
      currentDynamicIntervalMs: targetInterval, targetFrameIntervalMs: targetInterval,
    };

    this.#workerManager.initialize().catch(e => console.error("Worker initialization failed", e));
    this.#subscribeToStateChanges();
  }

  public setCanvasRenderer(renderer: CanvasRenderer): void {
    this.#canvasRendererRef = renderer;
  }

  #subscribeToStateChanges(): void {
    this.#appStore.subscribe((state, prevState) => {
      const fpsChanged = state.targetFpsPreference !== prevState.targetFpsPreference;
      if (fpsChanged) this.#state.targetFrameIntervalMs = 1000 / (state.targetFpsPreference || 15);
      
      if (state.customGestureMetadataList !== prevState.customGestureMetadataList) {
        this.#workerManager.loadCustomGestures(state.customGestureMetadataList as CustomGestureMetadata[]);
      }

      const configChanged = fpsChanged ||
        state.numHandsPreference !== prevState.numHandsPreference ||
        state.enableCustomHandGestures !== prevState.enableCustomHandGestures ||
        state.enablePoseProcessing !== prevState.enablePoseProcessing ||
        state.enableBuiltInHandGestures !== prevState.enableBuiltInHandGestures ||
        state.handDetectionConfidence !== prevState.handDetectionConfidence ||
        state.handPresenceConfidence !== prevState.handPresenceConfidence ||
        state.handTrackingConfidence !== prevState.handTrackingConfidence ||
        state.poseDetectionConfidence !== prevState.poseDetectionConfidence ||
        state.posePresenceConfidence !== prevState.posePresenceConfidence ||
        state.poseTrackingConfidence !== prevState.poseTrackingConfidence;

      if (configChanged) this.reconfigureWorker();
    });
    pubsub.subscribe(GESTURE_EVENTS.RENDER_OUTPUT, (data?: unknown) => this.#handleRenderOutput(data as RenderOutputData));
    pubsub.subscribe(GESTURE_EVENTS.REQUEST_PROCESSING_OVERRIDE, (override?: unknown) => this.#setProcessingOverride(override as { hand: boolean; pose: boolean; numHands: number }));
    pubsub.subscribe(GESTURE_EVENTS.CLEAR_PROCESSING_OVERRIDE, this.#clearProcessingOverride);
  }
  
  #setProcessingOverride = (override: { hand: boolean; pose: boolean; numHands: number }): void => {
    this.#processingOverride = override;
    this.reconfigureWorker();
  };
  
  #clearProcessingOverride = (): void => {
    this.#processingOverride = undefined;
    this.reconfigureWorker();
  };

  #handleRenderOutput(data?: RenderOutputData): void {
    this.#canvasRendererRef?.updateLandmarkData({
        handLandmarks: data?.handGestureResults?.landmarks,
        poseLandmarks: data?.poseLandmarkerResults?.landmarks,
    });
    
    if (this.#state.processingEnabled && !this.#state.isTestModeActive) {
        const desiredInterval = Math.max(MIN_FRAME_INTERVAL_MS, (data?.processingTime || 0) * TARGET_PROCESSING_TIME_FACTOR);
        this.#state.currentDynamicIntervalMs = Math.max(this.#state.targetFrameIntervalMs, Math.min(MAX_FRAME_INTERVAL_MS, desiredInterval));
        
        const allActionableRecognitions: { name: string; confidence: number }[] = [];
        const mpHandGestures = data?.handGestureResults?.gestures?.[0] || [];
        mpHandGestures.forEach((g: { categoryName?: string; score?: number }) => {
            if (g && g.categoryName && typeof g.score === 'number') {
                allActionableRecognitions.push({ name: g.categoryName, confidence: g.score });
            }
        });

        (data?.customActionableGestures || []).forEach((g: { categoryName?: string; score?: number }) => {
            if (g && g.categoryName && typeof g.score === 'number') {
                allActionableRecognitions.push({ name: g.categoryName, confidence: g.score });
            }
        });
        
        this.#stateLogic.checkConditions(allActionableRecognitions);
    }
  }

  reconfigureWorker(): void {
    if (this.#reconfigureDebounceTimer) clearTimeout(this.#reconfigureDebounceTimer);
    this.#reconfigureDebounceTimer = window.setTimeout(() => this.#workerManager.reconfigure(this.#processingOverride), 50);
  }

  public processFrame = async (frameData: FrameAnalysisFrameData & { imageSourceElement: HTMLVideoElement | HTMLCanvasElement }): Promise<void> => {
    const { videoElement, imageSourceElement, roiConfig, timestamp } = frameData;
    const nowMs = timestamp || performance.now();
    
    const state = this.#appStore.getState();
    const isAnyFeatureEnabled = state.enableBuiltInHandGestures || state.enableCustomHandGestures || state.enablePoseProcessing;
    
    if (!this.isModelLoaded() || !this.#state.processingEnabled || videoElement.videoWidth === 0 || videoElement.readyState < 2 || (!isAnyFeatureEnabled && !this.#processingOverride) || nowMs - this.#state.lastFrameSentTime < this.#state.currentDynamicIntervalMs) {
      return;
    }
    
    this.#state.lastFrameSentTime = nowMs;

    try {
      const sourceWidth = (imageSourceElement instanceof HTMLVideoElement) ? imageSourceElement.videoWidth : imageSourceElement.width;
      const sourceHeight = (imageSourceElement instanceof HTMLVideoElement) ? imageSourceElement.videoHeight : imageSourceElement.height;
      
      if (sourceWidth === 0 || sourceHeight === 0) return;

      let imageBitmap: ImageBitmap;
      if (roiConfig && imageSourceElement instanceof HTMLVideoElement) {
        const sx = Math.floor(sourceWidth * (roiConfig.x / 100));
        const sy = Math.floor(sourceHeight * (roiConfig.y / 100));
        const sWidth = Math.floor(sourceWidth * (roiConfig.width / 100));
        const sHeight = Math.floor(sourceHeight * (roiConfig.height / 100));
        
        if (sWidth > 0 && sHeight > 0) {
            imageBitmap = await self.createImageBitmap(imageSourceElement, sx, sy, sWidth, sHeight);
        } else {
            imageBitmap = await self.createImageBitmap(imageSourceElement);
        }
      } else {
        imageBitmap = await self.createImageBitmap(imageSourceElement);
      }
      
      this.#workerManager.processFrame({ 
          imageBitmap,
          timestamp: nowMs, 
          roiConfig, 
          testRules: this.#testModeRules, 
          testTolerance: this.#testModeTolerance, 
          requestSnapshot: !!this.#workerManager.getSnapshotPromise() 
      }, [imageBitmap]);
    } catch (e) {
      if (!(e as Error).message.includes('is already closed')) {
        pubsub.publish(UI_EVENTS.SHOW_ERROR, { messageKey: 'errorFrameProcessing', substitutions: { message: (e as Error).message }});
      }
    }
  };

  public getLandmarkSnapshot = (): Promise<{ landmarks: Landmark[] | null; imageData: ImageData | null }> => {
    return this.#workerManager.getSnapshot();
  };

  public setTestMode = (rules: object, tolerance: number) => { this.#testModeRules = rules; this.#testModeTolerance = tolerance; this.#state.isTestModeActive = true; };
  public stopTestMode = () => { this.#testModeRules = null; this.#testModeTolerance = 0.2; this.#state.isTestModeActive = false; };
  public enableProcessing = (enable = true) => {
    this.#state.processingEnabled = enable;
    if (!enable) {
      this.#state.currentDynamicIntervalMs = this.#state.targetFrameIntervalMs;
      this.#stateLogic.resetHoldTimers();
      this.#stateLogic.resetCooldown();
      pubsub.publish(GESTURE_EVENTS.UPDATE_STATUS, { gesture: '-', confidence: '-' });
    }
  };
  public isModelLoaded = (): boolean => {
    const { enableBuiltInHandGestures, enableCustomHandGestures, enablePoseProcessing, handModelLoaded, poseModelLoaded } = this.#appStore.getState();
    const handRequired = enableBuiltInHandGestures || enableCustomHandGestures;
    return (handRequired ? handModelLoaded : true) && (enablePoseProcessing ? poseModelLoaded : true);
  };
  public setActiveStreamRoi = (roi: RoiConfig | null) => this.#stateLogic.setActiveStreamRoi(roi);
  public getStateLogic = () => this.#stateLogic;
  public destroy = () => { this.enableProcessing(false); this.#workerManager.terminate(); };
}