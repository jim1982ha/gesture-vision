/* FILE: packages/frontend/src/gestures/logic/processor-frame-handler.ts */
// Manages processing video frames for gesture recognition.
import { UI_EVENTS } from '#shared/constants/index.js';
import { pubsub } from '#shared/core/pubsub.js';

import type { FrameAnalysisFrameData } from '#frontend/types/index.js';
import type { GestureProcessor } from '../processor.js';

// Add testRules and testTolerance to the frame data interface
interface ExtendedFrameAnalysisData extends FrameAnalysisFrameData {
  testRules?: object | null;
  testTolerance?: number;
}

/**
 * Processes a single video frame. If an ROI is defined, it crops the frame to that
 * region before resizing and sending it to the worker. Otherwise, it processes the full frame.
 * Assumes 'this' context is the GestureProcessor instance.
 */
export async function processFrameLogic(
  this: GestureProcessor,
  frameData: ExtendedFrameAnalysisData
): Promise<void> {
  const { videoElement, roiConfig, timestamp, testRules, testTolerance } =
    frameData;
  const state = this._state;
  const nowMs = timestamp || performance.now();

  if (
    !this.isModelLoaded() ||
    !state.worker ||
    !videoElement ||
    !videoElement.videoWidth ||
    !videoElement.videoHeight ||
    videoElement.readyState < 2
  ) {
    return;
  }

  const effectiveIntervalMs = Math.max(
    state.currentDynamicIntervalMs,
    state.targetFrameIntervalMs
  );
  if (nowMs - state.lastFrameSentTime < effectiveIntervalMs) {
    return;
  }
  state.lastFrameSentTime = nowMs;

  try {
    const originalWidth = videoElement.videoWidth;
    const originalHeight = videoElement.videoHeight;

    let sourceX = 0,
      sourceY = 0,
      sourceWidth = originalWidth,
      sourceHeight = originalHeight;

    if (roiConfig && (roiConfig.width < 100 || roiConfig.height < 100)) {
      sourceX = Math.round(originalWidth * (roiConfig.x / 100));
      sourceY = Math.round(originalHeight * (roiConfig.y / 100));
      sourceWidth = Math.round(originalWidth * (roiConfig.width / 100));
      sourceHeight = Math.round(originalHeight * (roiConfig.height / 100));
    }

    sourceWidth = Math.max(1, sourceWidth);
    sourceHeight = Math.max(1, sourceHeight);

    const imageBitmap = await self.createImageBitmap(
      videoElement,
      sourceX,
      sourceY,
      sourceWidth,
      sourceHeight
    );

    const workerPayload = {
      type: 'process_frame',
      timestamp: nowMs,
      roiConfig,
      testRules,
      testTolerance,
      requestSnapshot: !!state.snapshotPromise,
      imageBitmap,
    };

    state.worker.postMessage(workerPayload, [imageBitmap]);
  } catch (e: unknown) {
    const typedError = e as Error;
    console.error(
      `[GP FrameProc] Error creating ImageBitmap or sending frame:`,
      typedError
    );
    if (!typedError.message.includes('is already closed')) {
      pubsub.publish(UI_EVENTS.SHOW_ERROR, {
        messageKey: 'errorFrameProcessing',
        substitutions: { message: typedError.message },
        type: 'error',
      });
    }
  }
}