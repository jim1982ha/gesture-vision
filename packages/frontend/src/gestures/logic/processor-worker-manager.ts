/* FILE: packages/frontend/src/gestures/logic/processor-worker-manager.ts */
// Manages the creation and communication with the gesture recognition Web Worker.
import { GESTURE_EVENTS, UI_EVENTS } from '#shared/constants/index.js';
import { pubsub } from '#shared/core/pubsub.js';
import {
  TARGET_PROCESSING_TIME_FACTOR,
  MIN_FRAME_INTERVAL_MS,
  MAX_FRAME_INTERVAL_MS,
} from '#frontend/constants/app-defaults.js';

import type { CustomGestureMetadata } from '#shared/types/index.js';
import type { TestResultPayload } from '#frontend/types/index.js';
import type { GestureProcessor } from '../processor.js';

export async function initWorkerLogic(this: GestureProcessor): Promise<void> {
  const state = this._state;
  try {
    const gestureWorkerUrlModule = await import(
      /* @vite-ignore */ '../../workers/gesture-worker.js?url'
    );
    const workerUrl = gestureWorkerUrlModule.default;

    state.worker = new Worker(workerUrl);
    state.worker.onmessage = this._handleWorkerMessage;
    state.worker.onerror = this._handleWorkerError;

    const appState = this._appStore.getState();

    state.worker.postMessage({
      type: 'initialize',
      payload: {
        numHands: appState.numHandsPreference,
        enablePoseProcessing: appState.enablePoseProcessing,
        enableCustomHandGestures: appState.enableCustomHandGestures,
        enableBuiltInHandGestures: appState.enableBuiltInHandGestures,
        enableHandProcessing:
          appState.enableBuiltInHandGestures ||
          appState.enableCustomHandGestures,
        handDetectionConfidence: appState.handDetectionConfidence,
        handPresenceConfidence: appState.handPresenceConfidence,
        handTrackingConfidence: appState.handTrackingConfidence,
        poseDetectionConfidence: appState.poseDetectionConfidence,
        posePresenceConfidence: appState.posePresenceConfidence,
        poseTrackingConfidence: appState.poseTrackingConfidence,
      },
    });
  } catch (e: unknown) {
    const typedError = e as Error;
    console.error('[GP Worker] Failed to create worker:', typedError);
    pubsub.publish(UI_EVENTS.SHOW_ERROR, {
      messageKey: 'errorWorkerInit',
      substitutions: { message: typedError.message },
      type: 'error',
    });
    state.handModelLoaded = false;
    state.poseModelLoaded = false;
    pubsub.publish(GESTURE_EVENTS.MODEL_LOADED, { hand: false, pose: false });
  }
}

export function handleWorkerMessageLogic(
  this: GestureProcessor,
  { data }: MessageEvent
): void {
  const state = this._state;
  switch (data.type) {
    case 'results': {
      state.performance.processingTimeWorker = data.processingTime || 0;
      state.currentHandLandmarks =
        data.results?.handGestureResults?.landmarks || [];
      state.currentPoseLandmarks =
        data.results?.poseLandmarkerResults?.landmarks || [];
      state.lastPublishedRoiConfig = data.results?.roiConfig || null;

      pubsub.publish(GESTURE_EVENTS.RENDER_OUTPUT, {
        handLandmarks: state.currentHandLandmarks,
        poseLandmarks: state.currentPoseLandmarks,
        roiConfig: state.lastPublishedRoiConfig,
      });

      if (state.isTestModeActive && data.results?.testResult) {
        pubsub.publish(
          GESTURE_EVENTS.TEST_RESULT,
          data.results.testResult as TestResultPayload
        );
      }

      if (state.snapshotPromise && data.results?.snapshot) {
        state.snapshotPromise.resolve(data.results.snapshot);
        state.snapshotPromise = null;
      }

      if (
        state.processingEnabled &&
        !state.isTestModeActive &&
        !state.isPausedByStudio
      ) {
        const desiredInterval = Math.max(
          MIN_FRAME_INTERVAL_MS,
          state.performance.processingTimeWorker * TARGET_PROCESSING_TIME_FACTOR
        );
        state.currentDynamicIntervalMs = Math.max(
          state.targetFrameIntervalMs,
          Math.min(MAX_FRAME_INTERVAL_MS, desiredInterval)
        );

        const allActionableRecognitions: { name: string; confidence: number }[] =
          [];

        const mpHandGestures =
          data.results?.handGestureResults?.gestures?.[0] || [];
        mpHandGestures.forEach((g: { categoryName?: string; score?: number }) => {
          if (g && g.categoryName && typeof g.score === 'number') {
            allActionableRecognitions.push({
              name: this._normalizeName(g.categoryName),
              confidence: g.score,
            });
          }
        });

        const customActionable = data.results?.customActionableGestures || [];
        customActionable.forEach(
          (g: { categoryName?: string; score?: number }) => {
            if (g && g.categoryName && typeof g.score === 'number') {
              allActionableRecognitions.push({
                name: g.categoryName,
                confidence: g.score,
              });
            }
          }
        );

        if (state.stateLogic) {
          state.stateLogic.checkConditions(
            allActionableRecognitions,
            state.isActionDispatchSuppressed
          );
        }

        state.performance.lastFrameProcessedTime = performance.now();
      }
      break;
    }
    case 'model_loaded':
      if (data.modelType === 'hand') state.handModelLoaded = !!data.loaded;
      if (data.modelType === 'pose') state.poseModelLoaded = !!data.loaded;
      pubsub.publish(GESTURE_EVENTS.MODEL_LOADED, {
        hand: state.handModelLoaded,
        pose: state.poseModelLoaded,
      });
      this._sendCustomGestureLoadRequest(
        this._appStore.getState().customGestureMetadataList ?? []
      );
      break;
    case 'WORKER_REQUESTS_CUSTOM_DEFINITIONS':
      const metadataList =
        this._appStore.getState().customGestureMetadataList ?? [];
      this._sendCustomGestureLoadRequest(metadataList);
      break;
    case 'error': {
      const errorCode = data.error?.code || 'WORKER_ERROR';
      const errorMsg = data.error?.message || 'Unknown worker error';
      pubsub.publish(UI_EVENTS.SHOW_ERROR, {
        messageKey:
          errorCode === 'WORKER_MODEL_INIT_FAILED'
            ? 'errorWorkerModel'
            : errorCode === 'WORKER_RECOGNITION_ERROR'
            ? 'errorWorkerRecognition'
            : errorCode === 'WORKER_BUNDLE_LOAD_FAILED'
            ? 'errorWorkerInit'
            : errorCode === 'WORKER_CUSTOM_IMPORT_FAILED'
            ? `Custom Gesture Import Failed: ${errorMsg}`
            : errorCode === 'WORKER_CUSTOM_IMPORT_INVALID'
            ? `Invalid Custom Gesture File: ${errorMsg}`
            : errorCode === 'WORKER_CUSTOM_EXEC_ERROR'
            ? `Custom Gesture Error: ${errorMsg}`
            : 'errorGeneric',
        substitutions: { code: errorCode, message: errorMsg },
        type: 'error',
      });

      if (data.error?.message?.toLowerCase().includes('hand')) {
        state.handModelLoaded = false;
      } else if (data.error?.message?.toLowerCase().includes('pose')) {
        state.poseModelLoaded = false;
      } else {
        if (
          errorCode === 'WORKER_BUNDLE_LOAD_FAILED' ||
          errorCode === 'WORKER_MODEL_INIT_FAILED'
        ) {
          state.handModelLoaded = false;
          state.poseModelLoaded = false;
        }
      }
      pubsub.publish(GESTURE_EVENTS.MODEL_LOADED, {
        hand: state.handModelLoaded,
        pose: state.poseModelLoaded,
      });
      break;
    }
    default: {
      break;
    }
  }
}

export function handleWorkerErrorLogic(
  this: GestureProcessor,
  errorEvent: ErrorEvent
): void {
  console.error('[GP Worker Err] Worker error event:', errorEvent);
  const message = errorEvent.message || 'Unknown worker error';
  const code = 'WORKER_ERROR';
  pubsub.publish(UI_EVENTS.SHOW_ERROR, {
    messageKey: message,
    substitutions: { code },
  });
  this._state.handModelLoaded = false;
  this._state.poseModelLoaded = false;
  pubsub.publish(GESTURE_EVENTS.MODEL_LOADED, { hand: false, pose: false });
}
export function sendNumHandsToWorkerLogic(
  this: GestureProcessor,
  newNumHands: number
): void {
  const state = this._state;
  if (state.worker) {
    state.worker.postMessage({ type: 'set_num_hands', numHands: newNumHands });
  }
}
export function sendEnableCustomHandGesturesFlagLogic(
  this: GestureProcessor,
  isEnabled: boolean
): void {
  const state = this._state;
  if (state.worker) {
    state.worker.postMessage({
      type: 'ENABLE_CUSTOM_HAND_GESTURES',
      payload: !!isEnabled,
    });
  }
  state.customHandGestureExecutionEnabled = !!isEnabled;
}
export function sendEnablePoseProcessingFlagLogic(
  this: GestureProcessor,
  isEnabled: boolean
): void {
  const state = this._state;
  if (state.worker) {
    state.worker.postMessage({
      type: 'ENABLE_POSE_PROCESSING',
      payload: !!isEnabled,
    });
  }
  state.poseProcessingExecutionEnabled = !!isEnabled;
}

export function sendCustomGestureLoadRequestLogic(
  this: GestureProcessor,
  metadataList: CustomGestureMetadata[] = []
): void {
  const state = this._state;
  const defsToSend = Array.isArray(metadataList) ? metadataList : [];

  if (state.worker) {
    state.worker.postMessage({
      type: 'LOAD_CUSTOM_GESTURES',
      payload: {
        gestures: defsToSend,
      },
    });
  }
}
export function terminateWorkerLogic(this: GestureProcessor): void {
  const state = this._state;
  if (state.worker) {
    state.worker.terminate();
    state.worker = null;
    state.handModelLoaded = false;
    state.poseModelLoaded = false;
    pubsub.publish(GESTURE_EVENTS.MODEL_LOADED, { hand: false, pose: false });
  }
}