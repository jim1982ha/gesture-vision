/* FILE: packages/frontend/src/gestures/processor.ts */
// Orchestrates gesture and pose recognition using a Web Worker.
// Manages model loading, frame processing, and communication with the worker.
import type { AppStore } from '#frontend/core/state/app-store.js';
import type { FrameAnalysisFrameData, SnapshotData, RenderOutputData } from '#frontend/types/index.js';
import { GESTURE_EVENTS, UI_EVENTS, pubsub, type RoiConfig, type CustomGestureMetadata } from '#shared/index.js';
import { MIN_FRAME_INTERVAL_MS, MAX_FRAME_INTERVAL_MS, TARGET_PROCESSING_TIME_FACTOR } from '#frontend/constants/index.js';
import { GestureStateLogic } from './state-logic.js';
import { GestureWorkerManager, type InitializePayload } from '#frontend/services/gesture-worker-manager.js';
import type { CanvasRenderer } from '#frontend/camera/canvas-renderer.js';
import type { TranslationService } from '#frontend/services/translation.service.js';
import type { Category } from '@mediapipe/tasks-vision';

interface ProcessorState {
  processingEnabled: boolean;
  lastFrameSentTime: number;
  currentDynamicIntervalMs: number;
  targetFrameIntervalMs: number;
}

export class GestureProcessor {
  #appStore: AppStore;
  #workerManager: GestureWorkerManager;
  #stateLogic: GestureStateLogic;
  #state: ProcessorState;
  #reconfigureDebounceTimer: number | null = null;
  #canvasRendererRef: CanvasRenderer | null = null;
  #processingOverride: Partial<InitializePayload> | undefined;
  // FIX: Add a frame counter to ensure monotonically increasing timestamps for MediaPipe.
  #frameCounter = 0;

  constructor(appStore: AppStore, translationService: TranslationService) {
    this.#appStore = appStore;
    this.#stateLogic = new GestureStateLogic(this.#appStore, translationService);
    this.#workerManager = new GestureWorkerManager(this.#appStore);
    
    const state = this.#appStore.getState();
    const targetInterval = 1000 / (state.targetFpsPreference || 15);
    this.#state = {
      processingEnabled: false, lastFrameSentTime: 0,
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
      if (!prevState.isInitialConfigLoaded && state.isInitialConfigLoaded) {
        this.reconfigureWorker();
      }

      if (!state.isInitialConfigLoaded) return;

      const configChanged =
        state.targetFpsPreference !== prevState.targetFpsPreference ||
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

      if (state.targetFpsPreference !== prevState.targetFpsPreference) {
        this.#state.targetFrameIntervalMs = 1000 / (state.targetFpsPreference || 15);
      }
      
      if (state.customGestureMetadataList !== prevState.customGestureMetadataList) {
        this.#workerManager.loadCustomGestures(state.customGestureMetadataList as CustomGestureMetadata[]);
      }

      if (configChanged) this.reconfigureWorker();
    });

    pubsub.subscribe(GESTURE_EVENTS.RENDER_OUTPUT, (data?: unknown) => this.#handleRenderOutput(data as RenderOutputData));
    pubsub.subscribe(GESTURE_EVENTS.REQUEST_PROCESSING_OVERRIDE, (override?: unknown) => this.#setProcessingOverride(override as Partial<InitializePayload>));
    pubsub.subscribe(GESTURE_EVENTS.CLEAR_PROCESSING_OVERRIDE, this.#clearProcessingOverride);
  }
  
  #setProcessingOverride = (override: Partial<InitializePayload>): void => {
    this.#processingOverride = override;
    this.reconfigureWorker();
  };
  
  #clearProcessingOverride = (): void => {
    this.#processingOverride = undefined;
    this.reconfigureWorker();
  };

  #handleRenderOutput(data?: RenderOutputData): void {
    const state = this.#appStore.getState();

    const handProcessingIsEnabled = this.#processingOverride?.enableHandProcessing ?? (state.enableBuiltInHandGestures || state.enableCustomHandGestures);
    const poseProcessingIsEnabled = this.#processingOverride?.enablePoseProcessing ?? state.enablePoseProcessing;
    
    this.#canvasRendererRef?.updateLandmarkData({
      handLandmarks: handProcessingIsEnabled ? data?.handGestureResults?.landmarks : [],
      poseLandmarks: poseProcessingIsEnabled ? data?.poseLandmarkerResults?.landmarks : [],
      roiConfig: this.#stateLogic.getActiveStreamRoi(),
    });
    this.#canvasRendererRef?.drawOutput();
    
    if (this.#state.processingEnabled) {
        const desiredInterval = Math.max(MIN_FRAME_INTERVAL_MS, (data?.processingTime || 0) * TARGET_PROCESSING_TIME_FACTOR);
        this.#state.currentDynamicIntervalMs = Math.max(this.#state.targetFrameIntervalMs, Math.min(MAX_FRAME_INTERVAL_MS, desiredInterval));
        
        const allActionableRecognitions: { name: string; confidence: number }[] = [];
        
        const handGestures: Category[] = data?.handGestureResults?.gestures?.[0] || [];
        handGestures.forEach((g: Category) => {
            if (g?.categoryName && typeof g.score === 'number') {
                allActionableRecognitions.push({ name: g.categoryName, confidence: g.score });
            }
        });
        (data?.customActionableGestures || []).forEach((g) => {
            if (g?.categoryName && typeof g.score === 'number') {
                allActionableRecognitions.push({ name: g.categoryName, confidence: g.score });
            }
        });
        
        const poseLandmarks = data?.poseLandmarkerResults?.worldLandmarks?.[0];
        if (poseLandmarks) {
            const poseDetections = this.#stateLogic.checkForStaticPoses(poseLandmarks);
            allActionableRecognitions.push(...poseDetections);
        }
        
        this.#stateLogic.checkConditions(allActionableRecognitions);
    }
  }

  reconfigureWorker(): void {
    if (this.#reconfigureDebounceTimer) clearTimeout(this.#reconfigureDebounceTimer);
    this.#reconfigureDebounceTimer = window.setTimeout(() => this.#workerManager.reconfigure(this.#processingOverride), 50);
  }

  public async processFrame(frameData: FrameAnalysisFrameData & { imageSourceElement: HTMLVideoElement | HTMLCanvasElement }, force = false): Promise<void> {
    if (!this.isModelLoaded(this.#processingOverride)) return;

    const { videoElement, imageSourceElement, roiConfig, timestamp } = frameData;
    const nowMs = timestamp || performance.now();
    
    const state = this.#appStore.getState();
    const isAnyFeatureEnabled = state.enableBuiltInHandGestures || state.enableCustomHandGestures || state.enablePoseProcessing;
    
    if (!force && (!this.#state.processingEnabled || videoElement.videoWidth === 0 || videoElement.readyState < 2 || (!isAnyFeatureEnabled && !this.#processingOverride) || nowMs - this.#state.lastFrameSentTime < this.#state.currentDynamicIntervalMs)) {
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
        imageBitmap = (sWidth > 0 && sHeight > 0) 
            ? await self.createImageBitmap(imageSourceElement, sx, sy, sWidth, sHeight) 
            : await self.createImageBitmap(imageSourceElement);
      } else {
        imageBitmap = await self.createImageBitmap(imageSourceElement);
      }
      
      // FIX: Use an incrementing integer counter for the timestamp to satisfy MediaPipe's strict requirement.
      this.#frameCounter++;

      this.#workerManager.processFrame({ 
          imageBitmap,
          timestamp: this.#frameCounter, 
          roiConfig, 
          requestSnapshot: !!this.#workerManager.getSnapshotPromise() 
      }, [imageBitmap]);
    } catch (e) {
      if (!(e as Error).message.includes('is already closed')) {
        pubsub.publish(UI_EVENTS.SHOW_ERROR, { messageKey: 'errorFrameProcessing', substitutions: { message: (e as Error).message }});
      }
    }
  }
  
  public async waitUntilModelsReady(): Promise<void> {
    await this.#workerManager.waitUntilModelsReady();
  }

  public getLandmarkSnapshot = (): Promise<SnapshotData> => this.#workerManager.getSnapshot();
  public enableProcessing = (enable = true) => {
    this.#state.processingEnabled = enable;
    if (!enable) {
      this.#state.currentDynamicIntervalMs = this.#state.targetFrameIntervalMs;
      this.#stateLogic.resetHoldTimers();
      this.#stateLogic.resetCooldown();
      this.#stateLogic.resetUIDisplay();
    }
  };
  public isModelLoaded = (override?: Partial<InitializePayload>): boolean => {
    const { handModelLoaded, poseModelLoaded, enableBuiltInHandGestures, enableCustomHandGestures, enablePoseProcessing } = this.#appStore.getState();
    const handRequired = override?.enableHandProcessing ?? (enableBuiltInHandGestures || enableCustomHandGestures);
    const poseRequired = override?.enablePoseProcessing ?? enablePoseProcessing;
    return (handRequired ? handModelLoaded : true) && (poseRequired ? poseModelLoaded : true);
  };
  public setActiveStreamRoi = (roi: RoiConfig | null) => this.#stateLogic.setActiveStreamRoi(roi);
  public getStateLogic = () => this.#stateLogic;
  public destroy = () => {
    this.enableProcessing(false);
    this.#workerManager.terminate();
    this.#stateLogic.destroy(); 
  };
}