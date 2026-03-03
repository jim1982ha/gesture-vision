/* FILE: packages/frontend/src/services/gesture-worker-manager.ts */
import { GESTURE_EVENTS, UI_EVENTS, pubsub, type CustomGestureMetadata, type RoiConfig } from '#shared/index.js';
import type { AppStore } from '#frontend/core/state/app-store.js';
import type { SnapshotPromise, SnapshotData, TestResultPayload } from '#frontend/types/index.js';
import type { HandLandmarkerResult, PoseLandmarkerResult } from '@mediapipe/tasks-vision';

// --- Type definitions for worker communication ---
export interface InitializePayload {
  basePath?: string; // New field for relative path resolution
  numHands: number;
  enableHandProcessing: boolean;
  enablePoseProcessing: boolean;
  enableBuiltInHandGestures: boolean;
  enableCustomHandGestures: boolean;
  handDetectionConfidence: number;
  handPresenceConfidence: number;
  handTrackingConfidence: number;
  poseDetectionConfidence: number;
  posePresenceConfidence: number;
  poseTrackingConfidence: number;
}
export interface ProcessFramePayload {
  imageBitmap: ImageBitmap;
  timestamp: number;
  roiConfig: RoiConfig | null;
  requestSnapshot: boolean;
}
interface ResultsMessage {
  type: 'results';
  results: {
    handGestureResults?: HandLandmarkerResult;
    poseLandmarkerResults?: PoseLandmarkerResult;
    customActionableGestures?: { categoryName: string; score: number }[];
    snapshot?: SnapshotData;
    testResult?: TestResultPayload;
  };
  processingTime: number;
}
interface ErrorMessage { type: 'error'; error: { code: string; message: string; }; }
interface ModelLoadedMessage { type: 'model_loaded', modelType: 'hand' | 'pose', status: boolean }
// --- End of type definitions ---

let hasInitializedOnce = false;

export class GestureWorkerManager {
  #worker: Worker | null = null;
  #appStore: AppStore;
  #snapshotPromise: SnapshotPromise | null = null;
  #modelReadyPromise: Promise<void> | null = null;
  #resolveModelReady: (() => void) | null = null;

  constructor(appStore: AppStore) {
    this.#appStore = appStore;
    this.#resetModelReadyPromise();
  }

  async initialize(): Promise<void> {
    try {
      this.#worker = new Worker(new URL('../workers/gesture-worker.ts', import.meta.url), { type: 'classic' });
      this.#worker.onmessage = this.#handleMessage;
      this.#worker.onerror = this.#handleError;

      if (!hasInitializedOnce) {
        console.info('[Init] Gesture processing worker created.');
        hasInitializedOnce = true;
      }
    } catch (e) { this.#handleInitializationError(e as Error); }
  }

  #resetModelReadyPromise(): void {
    this.#modelReadyPromise = new Promise(resolve => {
        this.#resolveModelReady = resolve;
    });
  }

  public async waitUntilModelsReady(): Promise<void> {
      await this.#modelReadyPromise;
  }

  #handleInitializationError(error: Error): void {
    console.error('[GestureWorkerManager] Failed to create worker:', error);
    pubsub.publish(UI_EVENTS.SHOW_ERROR, { messageKey: 'errorWorkerInit', substitutions: { message: error.message }, type: 'error' });
    this.#appStore.getState().actions.setModelLoadingStatus({ hand: false, pose: false });
  }

  reconfigure(override?: Partial<InitializePayload>): void {
    if (!this.#worker) return;
    this.#resetModelReadyPromise(); 
    const state = this.#appStore.getState();
    
    // Calculate base path from current window location to ensure worker can fetch assets relative to Ingress path
    const href = window.location.href;
    // Strip query params and hash if present, then strip file name
    const urlObj = new URL(href);
    let path = urlObj.pathname;
    if (!path.endsWith('/')) {
        path = path.substring(0, path.lastIndexOf('/') + 1);
    }
    // Final base path including origin (e.g., https://ha.com/api/ingress/TOKEN/)
    const basePath = `${urlObj.origin}${path}`;

    const payload: InitializePayload = {
      basePath,
      numHands: override?.numHands ?? state.numHandsPreference,
      enableHandProcessing: override?.enableHandProcessing ?? (state.enableBuiltInHandGestures || state.enableCustomHandGestures),
      enablePoseProcessing: override?.enablePoseProcessing ?? state.enablePoseProcessing,
      enableBuiltInHandGestures: override?.enableBuiltInHandGestures ?? state.enableBuiltInHandGestures,
      enableCustomHandGestures: override?.enableCustomHandGestures ?? state.enableCustomHandGestures,
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

  processFrame(payload: ProcessFramePayload, transfer: Transferable[]): void {
    this.#worker?.postMessage({ type: 'process_frame', payload }, transfer);
  }

  getSnapshot(): Promise<SnapshotData> {
    return new Promise((resolve, reject) => {
      if (!this.#worker) return reject(new Error('Worker not available for snapshot.'));
      this.#snapshotPromise = { resolve, reject };
    });
  }

  public getSnapshotPromise(): SnapshotPromise | null { return this.#snapshotPromise; }

  terminate(): void {
    if (this.#worker) {
      this.#worker.terminate();
      this.#worker = null;
      this.#appStore.getState().actions.setModelLoadingStatus({ hand: false, pose: false });
      hasInitializedOnce = false;
    }
  }

  #handleMessage = ({ data }: MessageEvent): void => {
    switch (data.type) {
      case 'results': {
        const { results, processingTime } = data as ResultsMessage;
        pubsub.publish(GESTURE_EVENTS.RENDER_OUTPUT, { ...results, processingTime });
        if (results.testResult) pubsub.publish(GESTURE_EVENTS.TEST_RESULT, results.testResult);
        if (this.#snapshotPromise && results.snapshot) {
          this.#snapshotPromise.resolve(results.snapshot);
          this.#snapshotPromise = null;
        }
        break;
      }
      case 'model_loaded': {
        const { modelType, status } = data as ModelLoadedMessage;
        console.info(`[Model Lifecycle] Worker reported ${modelType} model loaded status: ${status}.`);
        this.#appStore.getState().actions.setModelLoadingStatus({ [modelType]: status });
        break;
      }
      case 'worker_ready': {
        console.log('[GestureWorkerManager] Received worker_ready signal.');
        this.#resolveModelReady?.();
        break;
      }
      case 'error': {
        const { error } = data as ErrorMessage;
        pubsub.publish(UI_EVENTS.SHOW_ERROR, { message: `Worker Error [${error.code}]: ${error.message}`, type: 'error' });
        break;
      }
    }
  };

  #handleError = (event: ErrorEvent): void => {
    console.error('[GestureWorkerManager] Worker error event:', event);
    pubsub.publish(UI_EVENTS.SHOW_ERROR, { message: event.message || 'Unknown worker error', type: 'error' });
    this.#appStore.getState().actions.setModelLoadingStatus({ hand: false, pose: false });
  };
}