/* FILE: packages/frontend/src/gestures/processor.ts */
// Orchestrates gesture and pose recognition using a Web Worker.
// Manages model loading, frame processing, and communication with the worker.
import type { AppStore } from '#frontend/core/state/app-store.js';
import type { AllDOMElements } from '#frontend/core/dom-elements.js';
import {
  DEFAULT_TARGET_FPS,
  DEFAULT_PROCESSING_WIDTH,
} from '#frontend/constants/app-defaults.js';
import {
  GESTURE_EVENTS,
  WEBCAM_EVENTS,
} from '#shared/constants/index.js';
import { pubsub } from '#shared/core/pubsub.js';
import { normalizeNameForMtx } from '#shared/utils/index.js';

import { processFrameLogic } from './logic/processor-frame-handler.js';
import {
  initializeProcessorState,
  setupPerformanceMonitorLogic,
  cleanupPerformanceMonitorLogic,
  enableProcessingLogic,
  type ProcessorState,
  applyVideoFilterLogic,
  type SnapshotPromise,
} from './logic/processor-state.js';
import {
  initWorkerLogic,
  handleWorkerMessageLogic,
  handleWorkerErrorLogic,
  terminateWorkerLogic,
  sendCustomGestureLoadRequestLogic,
} from './logic/processor-worker-manager.js';
import { GestureStateLogic } from './state-logic.js';

import type {
  CustomGestureMetadata,
  RoiConfig,
} from '#shared/types/index.js';
import type { FrameAnalysisFrameData } from '#frontend/types/index.js';
import type { Landmark } from '@mediapipe/tasks-vision';
import type { UIController } from '#frontend/ui/ui-controller-core.js';

interface LandmarkVisibilityOverride {
  hand: boolean;
  pose: boolean;
  numHands?: number;
}

export class GestureProcessor {
  _state: ProcessorState;
  _appStore: AppStore;
  _uiControllerRef: UIController | null = null;
  #reconfigureWorkerDebounceTimer: number | null = null;
  #studioLandmarkOverride: LandmarkVisibilityOverride | null = null;
  #unsubscribeStore: () => void;

  #testModeRules: object | null = null;
  #testModeTolerance = 0.2;

  // --- Bound event handlers for pubsub ---
  #boundEnableProcessing: () => void;
  #boundDisableProcessing: () => void;
  #boundHandleLandmarkOverride: (payload?: unknown) => void;
  #boundClearLandmarkOverride: () => void;
  #boundSuppressActions: () => void;
  #boundResumeActions: () => void;

  #setupPerformanceMonitor = () => setupPerformanceMonitorLogic(this);
  #cleanupPerformanceMonitor = () => cleanupPerformanceMonitorLogic(this);
  public enableProcessing = (enable?: boolean) =>
    enableProcessingLogic(this, enable);
  #terminateWorker = terminateWorkerLogic.bind(this);
  _sendCustomGestureLoadRequest = sendCustomGestureLoadRequestLogic.bind(this);

  public processFrame = (d: FrameAnalysisFrameData) => {
    processFrameLogic.call(this, {
      ...d,
      testRules: this.#testModeRules,
      testTolerance: this.#testModeTolerance,
    });
  };
  _handleWorkerMessage = handleWorkerMessageLogic.bind(this);
  _handleWorkerError = handleWorkerErrorLogic.bind(this);
  _normalizeName = normalizeNameForMtx;
  static DEFAULT_TARGET_FPS = DEFAULT_TARGET_FPS;

  constructor(
    appStore: AppStore,
    domElements: Partial<AllDOMElements>
  ) {
    if (!appStore || !domElements)
      throw new Error(
        'GestureProcessor requires AppStore and DOM elements refs.'
      );
    this._appStore = appStore;
    this._state = initializeProcessorState(this._appStore, domElements);
    this._state.stateLogic = new GestureStateLogic(this._appStore);
    this.#setupPerformanceMonitor();

    // Bind event handlers to this instance
    this.#boundEnableProcessing = () => this.enableProcessing(true);
    this.#boundDisableProcessing = () => this.enableProcessing(false);
    this.#boundHandleLandmarkOverride = (payload?: unknown) => {
      this.#studioLandmarkOverride =
        payload as LandmarkVisibilityOverride | null;
      this._state.canvasRenderer?.setLandmarkVisibilityOverride(
        this.#studioLandmarkOverride
      );
      this.reconfigureWorker();
    };
    this.#boundClearLandmarkOverride = () => {
      this.#studioLandmarkOverride = null;
      this._state.canvasRenderer?.clearLandmarkVisibilityOverride();
      this.reconfigureWorker();
    };
    this.#boundSuppressActions = () => { this._state.isActionDispatchSuppressed = true; };
    this.#boundResumeActions = () => { this._state.isActionDispatchSuppressed = false; };

    (async () => {
      await initWorkerLogic.call(this);
      this.#initializeEventListeners();
    })().catch((e) => {
      console.error(
        'Error during async init in GestureProcessor constructor',
        e
      );
      pubsub.publish(GESTURE_EVENTS.MODEL_LOADED, { hand: false, pose: false });
    });

    this.#unsubscribeStore = this._appStore.subscribe((state, prevState) => {
      if (state.targetFpsPreference !== prevState.targetFpsPreference) {
        this._state.targetFrameIntervalMs =
          1000 / (state.targetFpsPreference || DEFAULT_TARGET_FPS);
        this._state.currentDynamicIntervalMs = this._state.targetFrameIntervalMs;
      }
      if (
        state.processingResolutionWidthPreference !==
        prevState.processingResolutionWidthPreference
      ) {
        this._state.processingWidthPreference =
          state.processingResolutionWidthPreference || DEFAULT_PROCESSING_WIDTH;
      }
      if (
        state.customGestureMetadataList !== prevState.customGestureMetadataList
      ) {
        this._sendCustomGestureLoadRequest(
          state.customGestureMetadataList as CustomGestureMetadata[]
        );
      }
      if (
        state.lowLightBrightness !== prevState.lowLightBrightness ||
        state.lowLightContrast !== prevState.lowLightContrast
      ) {
        applyVideoFilterLogic(this);
      }
      if (
        state.numHandsPreference !== prevState.numHandsPreference ||
        state.enableCustomHandGestures !==
          prevState.enableCustomHandGestures ||
        state.enablePoseProcessing !== prevState.enablePoseProcessing ||
        state.enableBuiltInHandGestures !==
          prevState.enableBuiltInHandGestures ||
        state.handDetectionConfidence !== prevState.handDetectionConfidence ||
        state.handPresenceConfidence !== prevState.handPresenceConfidence ||
        state.handTrackingConfidence !== prevState.handTrackingConfidence ||
        state.poseDetectionConfidence !== prevState.poseDetectionConfidence ||
        state.posePresenceConfidence !== prevState.posePresenceConfidence ||
        state.poseTrackingConfidence !== prevState.poseTrackingConfidence
      ) {
        this.reconfigureWorker();
      }
    });
  }

  public setTestMode(rules: object, tolerance: number): void {
    this.#testModeRules = rules;
    this.#testModeTolerance = tolerance;
    this._state.isTestModeActive = true;
  }

  public stopTestMode(): void {
    this.#testModeRules = null;
    this.#testModeTolerance = 0.2;
    this._state.isTestModeActive = false;
  }

  public reconfigureWorker = (): void => {
    if (this.#reconfigureWorkerDebounceTimer)
      clearTimeout(this.#reconfigureWorkerDebounceTimer);

    this.#reconfigureWorkerDebounceTimer = window.setTimeout(async () => {
      const state = this._appStore.getState();
      if (!this._state.worker) return;
      const useOverride = !!this.#studioLandmarkOverride;

      const payload = {
        numHands:
          useOverride && typeof this.#studioLandmarkOverride?.numHands === 'number'
            ? this.#studioLandmarkOverride.numHands
            : state.numHandsPreference,
        enableHandProcessing: useOverride
          ? this.#studioLandmarkOverride!.hand
          : state.enableBuiltInHandGestures || state.enableCustomHandGestures,
        enablePoseProcessing: useOverride
          ? this.#studioLandmarkOverride!.pose
          : state.enablePoseProcessing,
        enableBuiltInHandGestures: state.enableBuiltInHandGestures,
        enableCustomHandGestures: state.enableCustomHandGestures,
        handDetectionConfidence: state.handDetectionConfidence,
        handPresenceConfidence: state.handPresenceConfidence,
        handTrackingConfidence: state.handTrackingConfidence,
        poseDetectionConfidence: state.poseDetectionConfidence,
        posePresenceConfidence: state.posePresenceConfidence,
        poseTrackingConfidence: state.poseTrackingConfidence,
      };

      this._state.worker.postMessage({ type: 'initialize', payload });
    }, 50);
  };

  #initializeEventListeners(): void {
    pubsub.subscribe(WEBCAM_EVENTS.STREAM_START, this.#boundEnableProcessing);
    pubsub.subscribe(WEBCAM_EVENTS.STREAM_STOP, this.#boundDisableProcessing);
    pubsub.subscribe(
      GESTURE_EVENTS.REQUEST_LANDMARK_VISIBILITY_OVERRIDE,
      this.#boundHandleLandmarkOverride
    );
    pubsub.subscribe(
      GESTURE_EVENTS.CLEAR_LANDMARK_VISIBILITY_OVERRIDE,
      this.#boundClearLandmarkOverride
    );
    pubsub.subscribe(GESTURE_EVENTS.SUPPRESS_ACTIONS, this.#boundSuppressActions);
    pubsub.subscribe(GESTURE_EVENTS.RESUME_ACTIONS, this.#boundResumeActions);
  }

  destroy(): void {
    this.enableProcessing(false);
    this.#cleanupPerformanceMonitor();
    this.#terminateWorker();
    this.#unsubscribeStore();

    // Unsubscribe from all pubsub events
    pubsub.unsubscribe(WEBCAM_EVENTS.STREAM_START, this.#boundEnableProcessing);
    pubsub.unsubscribe(WEBCAM_EVENTS.STREAM_STOP, this.#boundDisableProcessing);
    pubsub.unsubscribe(
      GESTURE_EVENTS.REQUEST_LANDMARK_VISIBILITY_OVERRIDE,
      this.#boundHandleLandmarkOverride
    );
    pubsub.unsubscribe(
      GESTURE_EVENTS.CLEAR_LANDMARK_VISIBILITY_OVERRIDE,
      this.#boundClearLandmarkOverride
    );
    pubsub.unsubscribe(GESTURE_EVENTS.SUPPRESS_ACTIONS, this.#boundSuppressActions);
    pubsub.unsubscribe(GESTURE_EVENTS.RESUME_ACTIONS, this.#boundResumeActions);


    if (this.#reconfigureWorkerDebounceTimer)
      clearTimeout(this.#reconfigureWorkerDebounceTimer);
    this._state = {} as ProcessorState;
  }

  public getLandmarkSnapshot = (): Promise<{
    landmarks: Landmark[] | null;
    imageData: ImageBitmap | null;
  }> =>
    new Promise((resolve, reject) => {
      const { domElements } = this._state;
      if (
        !(domElements.videoElement instanceof HTMLVideoElement) ||
        !this.isModelLoaded() ||
        domElements.videoElement.readyState < 2
      )
        return reject(new Error('Worker or video not ready for snapshot.'));
      this._state.snapshotPromise = { resolve, reject } as SnapshotPromise;
    });

  public setActiveStreamRoi = (roiConfig: RoiConfig | null): void => {
    this._state.lastPublishedRoiConfig = roiConfig;
  };

  isModelLoaded = (): boolean => {
    const state = this._appStore.getState();
    const useOverride = !!this.#studioLandmarkOverride;
    const handRequired = useOverride
      ? this.#studioLandmarkOverride!.hand
      : state.enableBuiltInHandGestures || state.enableCustomHandGestures;
    const poseRequired = useOverride
      ? this.#studioLandmarkOverride!.pose
      : state.enablePoseProcessing;
    return (
      (handRequired ? this._state.handModelLoaded : true) &&
      (poseRequired ? this._state.poseModelLoaded : true)
    );
  };
}