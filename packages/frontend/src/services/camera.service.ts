/* FILE: packages/frontend/src/services/camera.service.ts */
import {
  CAMERA_SERVICE_EVENTS,
  WEBCAM_EVENTS,
  pubsub,
  type RtspSourceConfig,
} from '#shared/index.js';
import type { CameraManager } from '#frontend/camera/camera-manager.js';
import type { Landmark } from '@mediapipe/tasks-vision';

export interface StartStreamOptions {
  cameraId: string;
  rtspSourceConfig?: RtspSourceConfig | null;
}

/**
 * Provides a formal, decoupled interface for plugins to interact with the application's camera system.
 * This service acts as a safe wrapper around the core CameraManager.
 */
export class CameraService {
  #cameraManager: CameraManager;

  constructor(cameraManager: CameraManager) {
    if (!cameraManager) {
      throw new Error('CameraService requires a valid CameraManager instance.');
    }
    this.#cameraManager = cameraManager;
    this.#subscribeToWebcamEvents();
  }

  #subscribeToWebcamEvents(): void {
    pubsub.subscribe(WEBCAM_EVENTS.STREAM_START, (data?: unknown) => {
      pubsub.publish(CAMERA_SERVICE_EVENTS.STREAM_STARTED, data);
    });
    pubsub.subscribe(WEBCAM_EVENTS.ERROR, (error?: unknown) => {
      pubsub.publish(CAMERA_SERVICE_EVENTS.STREAM_ERROR, error);
    });
  }

  public async startStream(options: StartStreamOptions): Promise<void> {
    if (!options.cameraId) {
      console.warn('[CameraService] startStream called without a cameraId.');
      return;
    }

    if (this.isStreamActive()) {
      await this.stopStream();
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    await this.#cameraManager.start(
      options.cameraId,
      options.rtspSourceConfig || null
    );
  }

  public async stopStream(): Promise<void> {
    if (this.#cameraManager.isStreaming()) {
      await this.#cameraManager.stop();
    }
  }

  public isStreamActive(): boolean {
    return this.#cameraManager.isStreaming();
  }

  public getLandmarkSnapshot(): Promise<{
    landmarks: Landmark[] | null;
    imageData: ImageData | null;
  }> {
    const gestureProcessor = this.#cameraManager.getGestureProcessor();
    if (!gestureProcessor) {
      return Promise.reject(
        new Error('GestureProcessor not available to capture snapshot.')
      );
    }
    return gestureProcessor.getLandmarkSnapshot();
  }

  public getCameraManager(): CameraManager {
    return this.#cameraManager;
  }
}