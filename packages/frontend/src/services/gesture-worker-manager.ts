/* FILE: packages/frontend/src/services/gesture-worker-manager.ts */
import { GESTURE_EVENTS, UI_EVENTS, pubsub, type CustomGestureMetadata, type RoiConfig } from '#shared/index.js';
import type { AppStore } from '#frontend/core/state/app-store.js';
import type { TestResultPayload } from '#frontend/types/index.js';
import type { Landmark } from '@mediapipe/tasks-vision';

interface SnapshotPromise {
  resolve: (value: { landmarks: Landmark[] | null; imageData: ImageData | null } | PromiseLike<{ landmarks: Landmark[] | null; imageData: ImageData | null }>) => void;
  reject: (reason?: unknown) => void;
}

export interface WorkerProcessFramePayload {
  imageBitmap: ImageBitmap;
  timestamp: number;
  roiConfig: RoiConfig | null;
  testRules: object | null;
  testTolerance: number;
  requestSnapshot: boolean;
}

export interface ReconfigurePayload {
    hand: boolean;
    pose: boolean;
    numHands: number;
    builtIn?: boolean;
    custom?: boolean;
}

/**
 * Manages the lifecycle and communication with the gesture recognition Web Worker.
 */
export class GestureWorkerManager {
  #worker: Worker | null = null;
  #appStore: AppStore;
  #snapshotPromise: SnapshotPromise | null = null;

  constructor(appStore: AppStore) {
    this.#appStore = appStore;
  }

  async initialize(): Promise<void> {
    try {
      const workerUrlModule = await import(/* @vite-ignore */ '../workers/gesture-worker.js?url');
      this.#worker = new Worker(workerUrlModule.default);
      this.#worker.onmessage = this.#handleMessage;
      this.#worker.onerror = this.#handleError;
      console.info('[Init] Gesture processing worker created.');
      this.reconfigure();
    } catch (e) { this.#handleInitializationError(e as Error); }
  }

  #handleInitializationError(error: Error): void {
    console.error('[GestureWorkerManager] Failed to create worker:', error);
    pubsub.publish(UI_EVENTS.SHOW_ERROR, { messageKey: 'errorWorkerInit', substitutions: { message: error.message }, type: 'error' });
    pubsub.publish(GESTURE_EVENTS.MODEL_LOADED, { hand: false, pose: false });
  }

  reconfigure(override?: ReconfigurePayload): void {
    if (!this.#worker) return;
    const state = this.#appStore.getState();
    const useOverride = !!override;

    const payload = {
      numHands: useOverride ? override.numHands : state.numHandsPreference,
      enableHandProcessing: useOverride ? override.hand : (state.enableBuiltInHandGestures || state.enableCustomHandGestures),
      enablePoseProcessing: useOverride ? override.pose : state.enablePoseProcessing,
      enableBuiltInHandGestures: useOverride ? override.builtIn : state.enableBuiltInHandGestures,
      enableCustomHandGestures: useOverride ? override.custom : state.enableCustomHandGestures,
      handDetectionConfidence: state.handDetectionConfidence,
      handPresenceConfidence: state.handPresenceConfidence,
      handTrackingConfidence: state.handTrackingConfidence,
      poseDetectionConfidence: state.poseDetectionConfidence,
      posePresenceConfidence: state.posePresenceConfidence,
      poseTrackingConfidence: state.poseTrackingConfidence,
    };
    this.#worker.postMessage({ type: 'initialize', payload });
  }

  loadCustomGestures(metadataList: CustomGestureMetadata[]): void {
    this.#worker?.postMessage({ type: 'LOAD_CUSTOM_GESTURES', payload: { gestures: metadataList } });
  }

  processFrame(payload: WorkerProcessFramePayload, transfer: Transferable[]): void {
    this.#worker?.postMessage({ type: 'process_frame', ...payload }, transfer);
  }

  getSnapshot(): Promise<{ landmarks: Landmark[] | null; imageData: ImageData | null }> {
    return new Promise((resolve, reject) => {
      if (!this.#worker) return reject(new Error('Worker not available for snapshot.'));
      this.#snapshotPromise = { resolve, reject };
    });
  }
  
  public getSnapshotPromise(): SnapshotPromise | null {
    return this.#snapshotPromise;
  }

  terminate(): void {
    if (this.#worker) {
      this.#worker.terminate();
      this.#worker = null;
      pubsub.publish(GESTURE_EVENTS.MODEL_LOADED, { hand: false, pose: false });
    }
  }

  #handleMessage = ({ data }: MessageEvent): void => {
    switch (data.type) {
      case 'results': {
        const workerResults = data.results;
        // Remap the worker's nested landmark data to the flat structure expected by the UI renderer.
        const remappedPayload = {
          ...workerResults,
          handLandmarks: workerResults.handGestureResults?.landmarks || [],
          poseLandmarks: workerResults.poseLandmarkerResults?.landmarks || [],
          processingTime: data.processingTime,
        };
        pubsub.publish(GESTURE_EVENTS.RENDER_OUTPUT, remappedPayload);
        
        if (data.results?.testResult) pubsub.publish(GESTURE_EVENTS.TEST_RESULT, data.results.testResult as TestResultPayload);
        if (this.#snapshotPromise && data.results?.snapshot) {
          this.#snapshotPromise.resolve(data.results.snapshot);
          this.#snapshotPromise = null;
        }
        break;
      }
      case 'model_loaded':
        console.info(`[Model Lifecycle] ${data.modelType.charAt(0).toUpperCase() + data.modelType.slice(1)} model ${data.loaded ? 'loaded' : 'unloaded'}.`);
        pubsub.publish(GESTURE_EVENTS.MODEL_LOADED, { [data.modelType]: data.loaded });
        break;
      case 'WORKER_REQUESTS_CUSTOM_DEFINITIONS':
        this.loadCustomGestures(this.#appStore.getState().customGestureMetadataList ?? []);
        break;
      case 'error':
        const { code = 'WORKER_ERROR', message = 'Unknown worker error' } = data.error || {};
        pubsub.publish(UI_EVENTS.SHOW_ERROR, { message: `Worker Error [${code}]: ${message}`, type: 'error' });
        break;
    }
  };

  #handleError = (event: ErrorEvent): void => {
    console.error('[GestureWorkerManager] Worker error event:', event);
    pubsub.publish(UI_EVENTS.SHOW_ERROR, { message: event.message || 'Unknown worker error', type: 'error' });
    pubsub.publish(GESTURE_EVENTS.MODEL_LOADED, { hand: false, pose: false });
  };
}