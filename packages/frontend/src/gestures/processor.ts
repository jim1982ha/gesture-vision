/* FILE: packages/frontend/src/gestures/processor.ts */
import { GESTURE_EVENTS, UI_EVENTS, pubsub, WEBSOCKET_EVENTS, type RoiConfig, type CustomGestureMetadata, type PerformanceMetricsPayload, WEBCAM_EVENTS } from '#shared/index.js';
import { MAX_FRAME_INTERVAL_MS, TARGET_PROCESSING_TIME_FACTOR } from '#frontend/constants/index.js';
import { GestureWorkerManager, type InitializePayload } from '#frontend/services/gesture-worker-manager.js';
import { webSocketService } from '#frontend/services/websocket-service.js';
import type { AppStore } from '#frontend/core/state/app-store.js';
import type { FrameAnalysisFrameData, RenderOutputData, SnapshotData } from '#frontend/types/index.js';
import type { CanvasRenderer } from '#frontend/camera/canvas-renderer.js';
import type { GestureService } from '#frontend/services/gesture.service.js';

interface ProcessorState {
  lastFrameSentTime: number;
  currentDynamicIntervalMs: number;
  targetFrameIntervalMs: number;
  lastWorkerReportedTime: number;
  framesSkipped: number;
}

const getMemoryMetrics = (): { memoryUsedMB?: number; heapUsedRatio?: number } => {
    const memoryInfo = (performance as unknown as { memory?: { usedJSHeapSize: number; totalJSHeapSize: number } }).memory;
    if (memoryInfo) {
      const memoryUsedMB = Math.round(memoryInfo.usedJSHeapSize / (1024 * 1024));
      const heapUsedRatio = memoryInfo.totalJSHeapSize > 0 ? parseFloat((memoryInfo.usedJSHeapSize / memoryInfo.totalJSHeapSize).toFixed(2)) : undefined;
      return { memoryUsedMB, heapUsedRatio };
    }
    return {};
};

export class GestureProcessor {
  #appStore: AppStore;
  #workerManager: GestureWorkerManager;
  #gestureService: GestureService;
  #canvasRenderer: CanvasRenderer;
  #state: ProcessorState;
  #reconfigureDebounceTimer: number | null = null;
  #perfSendTimer: number | null = null;
  #processingOverride: Partial<InitializePayload> | undefined;
  #frameCounter = 0;
  #subscriptions: (() => void)[] = [];
  #isProcessingEnabled = false;
  #activeStreamRoi: RoiConfig | null = null;

  constructor(appStore: AppStore, gestureService: GestureService, canvasRenderer: CanvasRenderer) {
    this.#appStore = appStore;
    this.#gestureService = gestureService;
    this.#canvasRenderer = canvasRenderer;
    this.#workerManager = new GestureWorkerManager(this.#appStore);
    
    const targetInterval = 1000 / (this.#appStore.getState().targetFpsPreference || 15);
    this.#state = {
      lastFrameSentTime: 0,
      currentDynamicIntervalMs: targetInterval,
      targetFrameIntervalMs: targetInterval,
      lastWorkerReportedTime: 0,
      framesSkipped: 0,
    };

    this.#workerManager.initialize().catch(e => console.error("Worker initialization failed", e));
    this.#subscribeToEvents();
  }

  #subscribeToEvents(): void {
    const storeSub = this.#appStore.subscribe((state, prevState) => {
      if (!state.isInitialConfigLoaded) return;
      const configChanged = ['targetFpsPreference', 'numHandsPreference', 'enableCustomHandGestures', 'enablePoseProcessing', 'enableBuiltInHandGestures', 'handDetectionConfidence', 'handPresenceConfidence', 'handTrackingConfidence', 'poseDetectionConfidence', 'posePresenceConfidence', 'poseTrackingConfidence']
        .some(key => state[key as keyof typeof state] !== prevState[key as keyof typeof prevState]);
      
      if (state.targetFpsPreference !== prevState.targetFpsPreference) this.#state.targetFrameIntervalMs = 1000 / (state.targetFpsPreference || 15);
      if (state.customGestureMetadataList !== prevState.customGestureMetadataList) this.#workerManager.loadCustomGestures(state.customGestureMetadataList as CustomGestureMetadata[]);
      if (configChanged) this.reconfigureWorker();
    });
    this.#subscriptions.push(storeSub);

    this.#subscriptions.push(pubsub.subscribe(GESTURE_EVENTS.RENDER_OUTPUT, (data?: unknown) => this.#handleWorkerOutput(data as RenderOutputData)));
    this.#subscriptions.push(pubsub.subscribe(GESTURE_EVENTS.REQUEST_PROCESSING_OVERRIDE, (override?: unknown) => this.#setProcessingOverride(override as Partial<InitializePayload>)));
    this.#subscriptions.push(pubsub.subscribe(GESTURE_EVENTS.CLEAR_PROCESSING_OVERRIDE, this.#clearProcessingOverride));
    this.#subscriptions.push(pubsub.subscribe(UI_EVENTS.INITIAL_STATE_LOADED, () => this.reconfigureWorker()));
  }
  
  #setProcessingOverride = (override: Partial<InitializePayload>): void => {
    this.#processingOverride = override;
    this.reconfigureWorker();
  };
  
  #clearProcessingOverride = (): void => {
    this.#processingOverride = undefined;
    this.reconfigureWorker();
  };

  #handleWorkerOutput(data?: RenderOutputData): void {
    const { handGestureResults, poseLandmarkerResults, customActionableGestures, processingTime } = data || {};
    const state = this.#appStore.getState();

    const handEnabled = this.#processingOverride?.enableHandProcessing ?? (state.enableBuiltInHandGestures || state.enableCustomHandGestures);
    const poseEnabled = this.#processingOverride?.enablePoseProcessing ?? state.enablePoseProcessing;
    
    this.#canvasRenderer.updateLandmarkData({
      handLandmarks: handEnabled ? handGestureResults?.landmarks : [],
      poseLandmarks: poseEnabled ? poseLandmarkerResults?.landmarks : [],
      roiConfig: this.#activeStreamRoi,
    });
    this.#canvasRenderer.drawOutput();
    
    if (this.#isProcessingEnabled) {
      if (typeof processingTime === 'number') {
        this.#state.lastWorkerReportedTime = processingTime;
        const dynamicInterval = processingTime * TARGET_PROCESSING_TIME_FACTOR * 1.2;
        this.#state.currentDynamicIntervalMs = Math.max(this.#state.targetFrameIntervalMs, Math.min(MAX_FRAME_INTERVAL_MS, dynamicInterval));
      }
      
      const allDetections = [
        ...(handGestureResults?.gestures?.[0] || []),
        ...(customActionableGestures || [])
      ].filter((g): g is { categoryName: string; score: number } => !!(g.categoryName && typeof g.score === 'number'))
      .map(g => ({ name: g.categoryName, confidence: g.score }));
      
      this.#gestureService.processDetections(allDetections, poseLandmarkerResults?.worldLandmarks?.[0]);
    }
  }

  reconfigureWorker(): void {
    if (this.#reconfigureDebounceTimer) clearTimeout(this.#reconfigureDebounceTimer);
    this.#reconfigureDebounceTimer = window.setTimeout(() => this.#workerManager.reconfigure(this.#processingOverride), 50);
  }

  public async processFrame(frameData: FrameAnalysisFrameData & { imageSourceElement: HTMLVideoElement | HTMLCanvasElement }): Promise<void> {
    const nowMs = frameData.timestamp || performance.now();
    if (!this.#isProcessingEnabled || frameData.videoElement.videoWidth === 0 || nowMs - this.#state.lastFrameSentTime < this.#state.currentDynamicIntervalMs) {
      this.#state.framesSkipped++;
      return;
    }

    this.#state.lastFrameSentTime = nowMs;
    try {
      const { imageSourceElement, roiConfig } = frameData;
      const sourceWidth = (imageSourceElement instanceof HTMLVideoElement) ? imageSourceElement.videoWidth : imageSourceElement.width;
      const sourceHeight = (imageSourceElement instanceof HTMLVideoElement) ? imageSourceElement.videoHeight : imageSourceElement.height;
      if (sourceWidth === 0 || sourceHeight === 0) return;
      
      let imageBitmap: ImageBitmap;
      if (roiConfig && imageSourceElement instanceof HTMLVideoElement) {
        const sx = Math.floor(sourceWidth * (roiConfig.x / 100));
        const sy = Math.floor(sourceHeight * (roiConfig.y / 100));
        const sWidth = Math.floor(sourceWidth * (roiConfig.width / 100));
        const sHeight = Math.floor(sourceHeight * (roiConfig.height / 100));
        imageBitmap = (sWidth > 0 && sHeight > 0) ? await self.createImageBitmap(imageSourceElement, sx, sy, sWidth, sHeight) : await self.createImageBitmap(imageSourceElement);
      } else { imageBitmap = await self.createImageBitmap(imageSourceElement); }
      
      this.#frameCounter++;
      this.#workerManager.processFrame({ imageBitmap, timestamp: this.#frameCounter, roiConfig, requestSnapshot: !!this.#workerManager.getSnapshotPromise() }, [imageBitmap]);
      this.#state.framesSkipped = 0;
    } catch (e) {
      if (!(e as Error).message.includes('is already closed')) {
        pubsub.publish(UI_EVENTS.SHOW_ERROR, { messageKey: 'errorFrameProcessing', substitutions: { message: (e as Error).message } });
      }
    }
  }

  #sendPerformanceMetrics = (source: 'webcam' | 'rtsp' | 'studio') => {
    if (!webSocketService.isConnected()) return;
    const streamActive = this.#appStore.getState().isWebcamRunning;
    if (!streamActive && source !== 'studio') return;
    const latencyEstimateMs = (this.#state.currentDynamicIntervalMs * this.#state.framesSkipped) + this.#state.lastWorkerReportedTime;
    const { memoryUsedMB, heapUsedRatio } = getMemoryMetrics();
    
    const payload: PerformanceMetricsPayload = {
      isStreaming: streamActive, source,
      actualFPS: parseFloat((1000 / this.#state.currentDynamicIntervalMs).toFixed(1)),
      targetFPS: this.#appStore.getState().targetFpsPreference,
      processingTimeMs: this.#state.lastWorkerReportedTime,
      latencyEstimateMs, memoryUsedMB, heapUsedRatio,
    };
    webSocketService.sendMessage({ type: WEBSOCKET_EVENTS.SEND_PERFORMANCE_METRICS, payload });
  }

  #stopPerfMonitoring = (): void => {
    if (this.#perfSendTimer) clearInterval(this.#perfSendTimer);
    this.#perfSendTimer = null;
  }
  
  public enableProcessing = (enable = true, isStudio = false): void => {
    this.#isProcessingEnabled = enable;
    this.#stopPerfMonitoring();
    if (enable) {
        const source = isStudio ? 'studio' : (this.#activeStreamRoi ? 'rtsp' : 'webcam');
        this.#sendPerformanceMetrics(source);
        this.#perfSendTimer = window.setInterval(() => this.#sendPerformanceMetrics(source), 5000);
        pubsub.publish(WEBCAM_EVENTS.STREAM_START, { studio: isStudio });
    } else {
        pubsub.publish(WEBCAM_EVENTS.STREAM_STOP);
        this.#state.currentDynamicIntervalMs = this.#state.targetFrameIntervalMs;
    }
  };

  public waitUntilModelsReady = (): Promise<void> => this.#workerManager.waitUntilModelsReady();
  public getSnapshot = (): Promise<SnapshotData> => this.#workerManager.getSnapshot();
  public setActiveStreamRoi = (roi: RoiConfig | null): void => { this.#activeStreamRoi = roi; };
  public getActiveStreamRoi = (): RoiConfig | null => this.#activeStreamRoi;
  
  public destroy = (): void => {
    this.enableProcessing(false);
    this.#workerManager.terminate();
    this.#gestureService.destroy();
    if (this.#reconfigureDebounceTimer) clearTimeout(this.#reconfigureDebounceTimer);
    this.#stopPerfMonitoring();
    this.#subscriptions.forEach(unsub => unsub());
    this.#subscriptions = [];
  };
}