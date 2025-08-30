/* FILE: packages/frontend/src/camera/camera-manager.ts */
import { pubsub, UI_EVENTS, WEBCAM_EVENTS, normalizeNameForMtx } from '#shared/index.js';
import {
  DEFAULT_WEBCAM_FACING_MODE,
  MOBILE_WEBCAM_PLACEHOLDER_ID,
  STORAGE_KEY_LAST_WEBCAM_ID,
  STORAGE_KEY_MIRROR_STATE_PER_SOURCE,
  STORAGE_KEY_SELECTED_CAMERA_SOURCE,
} from '#frontend/constants/app-defaults.js';
import { secureStorage } from '#shared/services/security-utils.js';
import type { AppStore } from '#frontend/core/state/app-store.js';
import type { GestureProcessor } from '#frontend/gestures/processor.js';
import type { RoiConfig, RtspSourceConfig } from '#shared/index.js';

import { CanvasRenderer } from './canvas-renderer.js';
import { CameraSourceManager } from './source-manager.js';
import { CameraStreamService } from './stream-service.js';
import { WebcamError } from './webcam-error.js';

interface PerformanceStats {
  resolution: { width: number; height: number };
}

export class CameraManager {
  #videoElement: HTMLVideoElement;
  #stream: MediaStream | null = null;
  #currentDeviceId: string | null = '';
  #performanceStats: PerformanceStats = { resolution: { width: 0, height: 0 } };
  #appStore: AppStore;
  #gestureProcessorRef: GestureProcessor;
  #canvasRendererRef: CanvasRenderer;
  #mirrorStateMap = new Map<string, boolean>();
  #currentFacingMode: 'user' | 'environment' = DEFAULT_WEBCAM_FACING_MODE;
  #cameraSourceManager: CameraSourceManager;
  #streamService: CameraStreamService;

  constructor(
    videoElement: HTMLVideoElement,
    outputCanvasElement: HTMLCanvasElement,
    appStore: AppStore,
    gestureProcessorRef: GestureProcessor
  ) {
    this.#videoElement = videoElement;
    this.#appStore = appStore;
    this.#gestureProcessorRef = gestureProcessorRef;

    this.#cameraSourceManager = new CameraSourceManager(this.#appStore);
    this.#streamService = new CameraStreamService(this);

    this.#canvasRendererRef = new CanvasRenderer(
      { outputCanvas: outputCanvasElement, videoElement: this.#videoElement },
      this.#appStore,
      (sourceId: string | null, roiConfig: RoiConfig) => {
        if (!sourceId) return;
        const currentSources = this.#appStore.getState().rtspSources;
        const patchData = {
          rtspSources: currentSources.map((s) =>
            `rtsp:${normalizeNameForMtx(s.name)}` === sourceId
              ? { ...s, roi: roiConfig }
              : s
          ),
        };
        this.#appStore.getState().actions.requestBackendPatch(patchData);
      }
    );
    this.#loadPreferences();
    this.#attachEventListeners();
  }

  public async initialize(): Promise<void> {
    await this.#cameraSourceManager.initialize();
  }

  #loadPreferences(): void {
    this.#currentDeviceId =
      (secureStorage.get(STORAGE_KEY_SELECTED_CAMERA_SOURCE) as string | null) ?? '';
    try {
      const stored = secureStorage.get(
        STORAGE_KEY_MIRROR_STATE_PER_SOURCE
      ) as Record<string, boolean> | null;
      if (stored) this.#mirrorStateMap = new Map(Object.entries(stored));
    } catch (e) {
      console.error('[CameraManager] Failed to load mirror state:', e);
    }
  }

  #attachEventListeners(): void {
    window.addEventListener('resize', () =>
      this.#canvasRendererRef.handleResize()
    );
    this.#appStore.subscribe((state, prevState) => {
      if (state.rtspSources !== prevState.rtspSources && this.isStreaming()) {
        this.#handleLiveRtspConfigUpdate(state.rtspSources);
      }
    });
  }

  #handleLiveRtspConfigUpdate(newSources: RtspSourceConfig[]): void {
    if (!this.isStreamingRtsp() || !this.#currentDeviceId) return;
  
    const currentNormalizedName = this.#currentDeviceId.substring(5);
    const newConfig = newSources.find(s => normalizeNameForMtx(s.name) === currentNormalizedName);
    
    if (newConfig) {
      const oldConfig = this.#appStore.getState().rtspSources.find(s => normalizeNameForMtx(s.name) === currentNormalizedName);
      const newRoi = newConfig.roi || null;
      const oldRoi = oldConfig?.roi || null;

      if (JSON.stringify(newRoi) !== JSON.stringify(oldRoi)) {
        this.#canvasRendererRef.updateSourceInfo(this.#currentDeviceId, newRoi);
        this.#gestureProcessorRef.setActiveStreamRoi(newRoi);
      }
    }
  }

  public async start(
    targetDeviceId: string,
    selectedSourceConfig: RtspSourceConfig | null
  ): Promise<void> {
    if (this.#stream) await this.stop(false);

    this.#currentDeviceId = targetDeviceId;
    this.#canvasRendererRef.setMirroring(this.isMirrored());

    this.#videoElement
      .closest('.video-container')
      ?.classList.add('video-active');

    try {
      const newStream = await this.#streamService.acquireStream(
        targetDeviceId,
        selectedSourceConfig,
        this.#currentFacingMode
      );
      this.#stream = newStream;
      this.#videoElement.srcObject = newStream;
      await this.#waitForVideoToPlay();
      this.#handleStreamStartSuccess(selectedSourceConfig);
    } catch (error) {
      const specificError = this.#mapToWebcamError(error as Error);
      pubsub.publish(WEBCAM_EVENTS.ERROR, {
        code: specificError.code,
        message: specificError.message,
      });
      await this.stop();
      throw specificError;
    }
  }

  async #waitForVideoToPlay(): Promise<void> {
    return new Promise((resolve, reject) => {
      const playingHandler = () => {
        cleanup();
        resolve();
      };
      const errorHandler = (e: Event) => {
        cleanup();
        const mediaError = (e.target as HTMLVideoElement)?.error;
        reject(
          new WebcamError(
            'VIDEO_ELEMENT_ERROR',
            `Video error: ${mediaError?.message || `Code ${mediaError?.code}`}`
          )
        );
      };
      const cleanup = () => {
        this.#videoElement.removeEventListener('playing', playingHandler);
        this.#videoElement.removeEventListener('error', errorHandler);
        clearTimeout(timeoutId);
      };
      const timeoutId = setTimeout(() => {
        cleanup();
        reject(
          new WebcamError(
            'VIDEO_PLAY_TIMEOUT',
            'Timeout waiting for video to play.'
          )
        );
      }, 10000);
      this.#videoElement.addEventListener('playing', playingHandler, {
        once: true,
      });
      this.#videoElement.addEventListener('error', errorHandler, { once: true });
      this.#videoElement.play().catch(errorHandler);
    });
  }

  #handleStreamStartSuccess(rtspSourceConfig: RtspSourceConfig | null): void {
    this.#performanceStats.resolution = {
      width: this.#videoElement.videoWidth,
      height: this.#videoElement.videoHeight,
    };
    const actualTrack = this.#stream?.getVideoTracks()[0];
    if (actualTrack && !this.isStreamingRtsp()) {
      const deviceIdFromTrack = actualTrack.getSettings().deviceId;
      if (deviceIdFromTrack) {
        this.#currentDeviceId = deviceIdFromTrack;
        secureStorage.set(STORAGE_KEY_LAST_WEBCAM_ID, deviceIdFromTrack);
      }
    }
    const roiForProcessing = rtspSourceConfig?.roi || null;
    this.#gestureProcessorRef.setActiveStreamRoi(roiForProcessing);
    this.#canvasRendererRef.updateSourceInfo(
      this.#currentDeviceId,
      roiForProcessing
    );
    
    // An initial draw to clear canvas or show first frame. The loop handles subsequent frames.
    this.#canvasRendererRef.drawOutput();

    pubsub.publish(WEBCAM_EVENTS.STREAM_START, {
      deviceId: this.#currentDeviceId,
    });
  }

  public async stop(publishStopEvent = true): Promise<void> {
    this.#streamService.stopStream();
    if (this.#stream) this.#stream.getTracks().forEach((track) => track.stop());
    this.#stream = null;
    this.#videoElement.srcObject = null;
    this.#videoElement.pause();
    this.#videoElement
      .closest('.video-container')
      ?.classList.remove('video-active');
    this.#performanceStats = { resolution: { width: 0, height: 0 } };
    
    // Explicitly clear the canvas and its state when stopping the stream.
    this.#canvasRendererRef.clearVideoSource();

    if (publishStopEvent) pubsub.publish(WEBCAM_EVENTS.STREAM_STOP);
  }

  public stopStream(): Promise<void> {
    return this.stop(true);
  }

  public async flipCamera(): Promise<void> {
    if (!this.canFlipCamera()) return;
    this.#currentFacingMode =
      this.#currentFacingMode === 'user' ? 'environment' : 'user';
    pubsub.publish(
      UI_EVENTS.CAMERA_LIST_ITEM_CLICKED,
      MOBILE_WEBCAM_PLACEHOLDER_ID
    );
  }

  public isStreaming(): boolean {
    return !!this.#stream;
  }
  public isStreamingRtsp(): boolean {
    return !!this.#currentDeviceId?.startsWith('rtsp:');
  }
  public canFlipCamera(): boolean {
    return 'facingMode' in navigator.mediaDevices.getSupportedConstraints();
  }
  public getCanvasRenderer = (): CanvasRenderer => this.#canvasRendererRef;
  public getCameraSourceManager = (): CameraSourceManager =>
    this.#cameraSourceManager;
  public getVideoElement = (): HTMLVideoElement | null => this.#videoElement;
  public getCurrentDeviceId = (): string | null => this.#currentDeviceId;
  public getCurrentFacingMode = (): 'user' | 'environment' =>
    this.#currentFacingMode;
  public getAppStore = (): AppStore => this.#appStore;
  public getGestureProcessor = (): GestureProcessor => this.#gestureProcessorRef;

  public isMirrored(): boolean {
    const deviceId = this.#currentDeviceId || '';
    return this.#mirrorStateMap.get(deviceId) ?? !deviceId.startsWith('rtsp:');
  }

  public toggleMirroringForCurrentStream(): void {
    const deviceId = this.#currentDeviceId;
    if (!deviceId) return;
    const newState = !this.isMirrored();
    this.#mirrorStateMap.set(deviceId, newState);
    secureStorage.set(
      STORAGE_KEY_MIRROR_STATE_PER_SOURCE,
      Object.fromEntries(this.#mirrorStateMap)
    );
    this.#canvasRendererRef.setMirroring(newState);
    this.#canvasRendererRef.drawOutput();
    pubsub.publish(UI_EVENTS.REQUEST_BUTTON_STATE_UPDATE);
  }

  #mapToWebcamError = (error: Error): WebcamError => {
    if (error instanceof WebcamError) return error;
    let code = 'UNKNOWN';
    let message = `Camera error: ${error.name} - ${error.message}`;
    if (error.name === 'NotAllowedError') {
      code = 'PERMISSION_DENIED';
      message = 'Camera access was denied.';
    } else if (error.name === 'NotFoundError') {
      code = 'DEVICE_NOT_FOUND';
      message = 'The selected camera could not be found.';
    }
    return new WebcamError(code, message);
  };
}