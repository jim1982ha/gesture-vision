/* FILE: packages/frontend/src/services/camera.service.ts */
import { CAMERA_SERVICE_EVENTS, WEBCAM_EVENTS } from '#shared/constants/index.js';
import { pubsub } from '#shared/core/pubsub.js';
import type { WebcamManager } from '#frontend/camera/manager.js';
import type { Landmark } from '@mediapipe/tasks-vision';
import type { AppStore } from '#frontend/core/state/app-store.js';
import { normalizeNameForMtx } from '#shared/utils/index.js';
import type { RtspSourceConfig } from '#shared/types/index.js';

export interface StartStreamOptions {
  gestureType: 'hand' | 'pose';
  cameraId: string;
}

/**
 * Provides a formal, decoupled interface for plugins to interact with the application's camera system.
 * This service acts as a safe wrapper around the core WebcamManager.
 */
export class CameraService {
  #webcamManager: WebcamManager;
  #appStore: AppStore;

  constructor(webcamManager: WebcamManager, appStore: AppStore) {
    if (!webcamManager) {
      throw new Error("CameraService requires a valid WebcamManager instance.");
    }
    if (!appStore) {
      throw new Error("CameraService requires a valid AppStore instance.");
    }
    this.#webcamManager = webcamManager;
    this.#appStore = appStore;
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
      console.warn("[CameraService] startStream called without a cameraId.");
      return;
    }
    
    const targetDeviceId = options.cameraId;
    let rtspConfig: RtspSourceConfig | null = null;
    
    if (targetDeviceId.startsWith("rtsp:")) {
      const normalizedName = normalizeNameForMtx(targetDeviceId.substring(5));
      const rtspSources = this.#appStore.getState().rtspSources;
      rtspConfig = rtspSources.find(s => normalizeNameForMtx(s.name) === normalizedName) || null;
      if (!rtspConfig) {
        throw new Error(`[CameraService] Configuration for RTSP source '${normalizedName}' not found.`);
      }
    }

    if (this.isStreamActive()) {
      await this.stopStream();
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    await this.#webcamManager.start(targetDeviceId, rtspConfig);
  }

  public async stopStream(): Promise<void> {
    if (this.#webcamManager.isStreaming()) {
      await this.#webcamManager.stop();
    }
  }

  public isStreamActive(): boolean {
    return this.#webcamManager.isStreaming();
  }

  public getLandmarkSnapshot(): Promise<{ landmarks: Landmark[] | null; imageData: ImageBitmap | null }> {
    if (!this.#webcamManager._gestureProcessorRef) {
      return Promise.reject(new Error("GestureProcessor not available to capture snapshot."));
    }
    return this.#webcamManager._gestureProcessorRef.getLandmarkSnapshot();
  }

  public getWebcamManager(): WebcamManager {
    return this.#webcamManager;
  }
}