/* FILE: packages/frontend/src/gestures/logic/processor-state.ts */
// Defines the internal state structure for the GestureProcessor and related constants.
import type { AppStore } from '#frontend/core/state/app-store.js';
import type { AllDOMElements } from '#frontend/core/dom-elements.js';
import {
  DEFAULT_TARGET_FPS,
  DEFAULT_ROI,
  DEFAULT_PROCESSING_WIDTH,
} from '#frontend/constants/app-defaults.js';

import { GESTURE_EVENTS } from '#shared/constants/index.js';
import { pubsub } from '#shared/core/pubsub.js';

import { CanvasRenderer } from '../../camera/canvas-renderer.js';

import type { RoiConfig } from '#shared/types/index.js';
import type { GestureProcessor } from '../processor.js';
import type { GestureStateLogic } from '../state-logic.js';
import type { Landmark } from '@mediapipe/tasks-vision';

interface ProcessorPerformanceStats {
  fps: number;
  lastFrameProcessedTime: number;
  processingTimeWorker: number;
  memoryUsage: number | string;
}

export interface SnapshotPromise {
  resolve: (
    value:
      | { landmarks: Landmark[] | null; imageData: ImageBitmap | null }
      | PromiseLike<{
          landmarks: Landmark[] | null;
          imageData: ImageBitmap | null;
        }>
  ) => void;
  reject: (reason?: unknown) => void;
}

export interface ProcessorState {
  domElements: Partial<AllDOMElements>;
  handModelLoaded: boolean;
  poseModelLoaded: boolean;
  processingEnabled: boolean;
  isPausedByStudio: boolean;
  isTestModeActive: boolean;
  isActionDispatchSuppressed: boolean;
  lastFrameSentTime: number;
  worker: Worker | null;
  performance: ProcessorPerformanceStats;
  perfIntervalId: number | null;
  currentHandLandmarks: Landmark[][];
  currentPoseLandmarks: Landmark[][];
  stateLogic: GestureStateLogic | null;
  currentDynamicIntervalMs: number;
  targetFrameIntervalMs: number;
  lastPublishedRoiConfig: RoiConfig | null;
  processingWidthPreference: number;
  overallCustomFileLoadingIsPermitted: boolean;
  customHandGestureExecutionEnabled: boolean;
  poseProcessingExecutionEnabled: boolean;
  canvasRenderer: CanvasRenderer | null;
  snapshotPromise: SnapshotPromise | null;
}

interface PerformanceWithMemory extends Performance {
  memory?: {
    totalJSHeapSize?: number;
    usedJSHeapSize?: number;
    jsHeapSizeLimit?: number;
  };
}

export function initializeProcessorState(
  appStore: AppStore,
  domElementsRef: Partial<AllDOMElements>
): ProcessorState {
  const state = appStore.getState();
  const initialFpsPref = state.targetFpsPreference || DEFAULT_TARGET_FPS;
  const targetInterval = 1000 / initialFpsPref;
  const initialCustomHandEnabled = state.enableCustomHandGestures;
  const initialPoseProcessingEnabled = state.enablePoseProcessing;
  const initialOverallCustomFileLoadingPermitted =
    initialCustomHandEnabled || initialPoseProcessingEnabled;

  return {
    domElements: domElementsRef || {},
    handModelLoaded: false,
    poseModelLoaded: false,
    processingEnabled: false,
    isPausedByStudio: false,
    isTestModeActive: false,
    isActionDispatchSuppressed: false,
    lastFrameSentTime: 0,
    worker: null,
    performance: {
      fps: 0,
      lastFrameProcessedTime: 0,
      processingTimeWorker: 0,
      memoryUsage: 0,
    },
    perfIntervalId: null,
    currentHandLandmarks: [],
    currentPoseLandmarks: [],
    stateLogic: null,
    currentDynamicIntervalMs: targetInterval,
    targetFrameIntervalMs: targetInterval,
    lastPublishedRoiConfig: { ...DEFAULT_ROI },
    processingWidthPreference:
      state.processingResolutionWidthPreference || DEFAULT_PROCESSING_WIDTH,
    overallCustomFileLoadingIsPermitted:
      initialOverallCustomFileLoadingPermitted,
    customHandGestureExecutionEnabled: initialCustomHandEnabled,
    poseProcessingExecutionEnabled: initialPoseProcessingEnabled,
    canvasRenderer: null,
    snapshotPromise: null,
  };
}

export function initializeCanvasLogic(
  processorInstance: GestureProcessor,
  handleRoiUpdateCallback: (
    sourceId: string | null,
    roiConfig: RoiConfig
  ) => void
): void {
  const state = processorInstance._state;
  if (
    state.domElements &&
    state.domElements.outputCanvas &&
    state.domElements.videoElement &&
    processorInstance._appStore &&
    typeof handleRoiUpdateCallback === 'function'
  ) {
    const rendererElements = {
      outputCanvas: state.domElements.outputCanvas as HTMLCanvasElement,
      videoElement: state.domElements.videoElement as HTMLVideoElement,
    };
    state.canvasRenderer = new CanvasRenderer(
      rendererElements,
      processorInstance._appStore,
      handleRoiUpdateCallback
    );
  } else
    console.error(
      '[GP State initializeCanvasLogic] Cannot initialize CanvasRenderer: One or more critical dependencies are missing/invalid.'
    );
}

export function setupPerformanceMonitorLogic(
  processorInstance: GestureProcessor
): void {
  const state = processorInstance._state;
  if (state.perfIntervalId) clearInterval(state.perfIntervalId);
  state.perfIntervalId = window.setInterval(() => {
    if (
      !state.processingEnabled ||
      !(typeof window.performance === 'object' && window.performance)
    )
      return;
    const perfWithMemory = window.performance as PerformanceWithMemory;
    if (perfWithMemory.memory?.usedJSHeapSize) {
      state.performance.memoryUsage = (
        perfWithMemory.memory.usedJSHeapSize / 1048576
      ).toFixed(1);
    } else state.performance.memoryUsage = 'N/A';
    pubsub.publish(GESTURE_EVENTS.PERFORMANCE_UPDATE, {
      processingTime: state.performance.processingTimeWorker,
      memory: state.performance.memoryUsage,
    });
  }, 2000);
}

export function cleanupPerformanceMonitorLogic(
  processorInstance: GestureProcessor
): void {
  if (processorInstance._state.perfIntervalId) {
    clearInterval(processorInstance._state.perfIntervalId);
    processorInstance._state.perfIntervalId = null;
  }
}

export function applyVideoFilterLogic(
  processorInstance: GestureProcessor
): void {
  const canvasElement = processorInstance._state.domElements
    ?.outputCanvas as HTMLCanvasElement | null;
  const appState = processorInstance._appStore.getState();
  if (canvasElement && appState) {
    const brightness = appState.lowLightBrightness,
      contrast = appState.lowLightContrast;
    const isFilterActive = brightness !== 100 || contrast !== 100;
    const shouldApply =
      processorInstance._state.processingEnabled && isFilterActive;
    canvasElement.style.filter = shouldApply
      ? `brightness(${brightness}%) contrast(${contrast}%)`
      : 'none';
  }
}

export function enableProcessingLogic(
  processorInstance: GestureProcessor,
  enable = true
): void {
  const state = processorInstance._state;
  if (state.isPausedByStudio && enable) {
    return;
  }

  const oldState = state.processingEnabled;
  state.processingEnabled = enable;
  if (oldState !== enable) applyVideoFilterLogic(processorInstance);

  if (!enable) {
    state.currentDynamicIntervalMs = state.targetFrameIntervalMs;
    state.stateLogic?.resetHoldTimers();
    state.stateLogic?.resetCooldown();
    pubsub.publish(GESTURE_EVENTS.UPDATE_STATUS, {
      gesture: '-',
      confidence: '-',
    });
  }
}