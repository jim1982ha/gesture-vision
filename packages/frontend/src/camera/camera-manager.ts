/* FILE: packages/frontend/src/camera/camera-manager.ts */
import { pubsub, UI_EVENTS, WEBCAM_EVENTS, normalizeNameForMtx, type RtspSourceConfig } from '#shared/index.js';
import { DEFAULT_WEBCAM_FACING_MODE, MOBILE_WEBCAM_PLACEHOLDER_ID, STORAGE_KEY_LAST_WEBCAM_ID, STORAGE_KEY_SELECTED_CAMERA_SOURCE, STORAGE_KEY_MIRROR_STATE_PER_SOURCE } from '#frontend/constants/index.js';
import { secureStorage } from '#shared/services/security-utils.js';
import type { AppStore } from '#frontend/core/state/app-store.js';
import type { GestureProcessor } from '#frontend/gestures/processor.js';
import type { TranslationService } from '#frontend/services/translation.service.js';
import { CanvasRenderer } from './canvas-renderer.js';
import { CameraSourceManager } from './source-manager.js';
import { CameraStreamService } from './stream-service.js';
import { WebcamError } from './webcam-error.js';
import { CameraStateBridge } from './state-bridge.js';

export class CameraManager {
  #videoElement: HTMLVideoElement;
  #stream: MediaStream | null = null;
  #currentDeviceId: string | null = '';
  #appStore: AppStore;
  #gestureProcessorRef: GestureProcessor;
  #canvasRendererRef: CanvasRenderer;
  #mirrorStateMap = new Map<string, boolean>();
  #currentFacingMode: 'user' | 'environment' = DEFAULT_WEBCAM_FACING_MODE;
  #cameraSourceManager: CameraSourceManager;
  #streamService: CameraStreamService;
  #stateBridge: CameraStateBridge;
  #animationFrameId: number | null = null;

  constructor(
    videoElement: HTMLVideoElement,
    outputCanvasElement: HTMLCanvasElement,
    appStore: AppStore,
    gestureProcessorRef: GestureProcessor,
    translationService: TranslationService
  ) {
    this.#videoElement = videoElement;
    this.#appStore = appStore;
    this.#gestureProcessorRef = gestureProcessorRef;

    this.#cameraSourceManager = new CameraSourceManager(this.#appStore, translationService);
    this.#streamService = new CameraStreamService(this);
    this.#canvasRendererRef = new CanvasRenderer({ outputCanvas: outputCanvasElement, videoElement: this.#videoElement }, this.#appStore, (sourceId, roiConfig) => {
        if (!sourceId) return;
        const currentSources = this.#appStore.getState().rtspSources;
        const patchData = { rtspSources: currentSources.map((s) => `rtsp:${normalizeNameForMtx(s.name)}` === sourceId ? { ...s, roi: roiConfig } : s) };
        this.#appStore.getState().actions.requestBackendPatch(patchData);
    });
    this.#stateBridge = new CameraStateBridge(this, this.#appStore);
    
    this.#loadPreferences();
  }

  public async initialize(): Promise<void> { await this.#cameraSourceManager.initialize(); }

  public destroy(): void {
    this.#stateBridge.destroy();
    this.#cameraSourceManager.destroy();
    if (this.#animationFrameId) cancelAnimationFrame(this.#animationFrameId);
  }

  #loadPreferences(): void {
    this.#currentDeviceId = (secureStorage.get(STORAGE_KEY_SELECTED_CAMERA_SOURCE) as string | null) ?? '';
    try {
      const stored = secureStorage.get(STORAGE_KEY_MIRROR_STATE_PER_SOURCE) as Record<string, boolean> | null;
      if (stored) this.#mirrorStateMap = new Map(Object.entries(stored));
    } catch (e) { console.error('[CameraManager] Failed to load mirror state:', e); }
  }

  public handleLiveRtspConfigUpdate(newSources: RtspSourceConfig[]): void {
    if (!this.isStreamingRtsp() || !this.#currentDeviceId) return;
    const currentNormalizedName = this.#currentDeviceId.substring(5);
    const newConfig = newSources.find(s => normalizeNameForMtx(s.name) === currentNormalizedName);
    const oldConfig = this.#appStore.getState().rtspSources.find(s => normalizeNameForMtx(s.name) === currentNormalizedName);
  
    if (!newConfig || newConfig.url !== oldConfig?.url) {
      const messageKey = !newConfig ? 'notificationStreamStoppedConfigChanged' : 'notificationStreamUrlChanged';
      pubsub.publish(UI_EVENTS.SHOW_NOTIFICATION, { messageKey, type: 'warning' });
      this.stop();
      return;
    }
  
    const newRoi = newConfig.roi || null;
    if (JSON.stringify(newRoi) !== JSON.stringify(oldConfig?.roi || null)) {
      this.#canvasRendererRef.updateSourceInfo(this.#currentDeviceId, newRoi);
      this.#gestureProcessorRef.setActiveStreamRoi(newRoi);
    }
  }

  public async start(targetDeviceId: string, selectedSourceConfig: RtspSourceConfig | null): Promise<void> {
    if (this.#stream) await this.stop(false);

    this.#currentDeviceId = targetDeviceId;
    this.#videoElement.classList.toggle('mirrored', this.isMirrored());

    const container = this.#videoElement.closest('.video-container');
    container?.classList.add('video-active', 'initial-show');
    setTimeout(() => container?.classList.remove('initial-show'), 4100);

    try {
      const newStream = await this.#streamService.acquireStream(targetDeviceId, selectedSourceConfig, this.#currentFacingMode);
      this.#stream = newStream;
      this.#videoElement.srcObject = newStream;
      await this.#waitForVideoToPlay();
      await this.#handleStreamStartSuccess(selectedSourceConfig);
    } catch (error) {
      const specificError = this.#mapToWebcamError(error as Error);
      pubsub.publish(WEBCAM_EVENTS.ERROR, { code: specificError.code, message: specificError.message });
      await this.stop();
      throw specificError;
    }
  }

  async #waitForVideoToPlay(): Promise<void> {
    return new Promise((resolve, reject) => {
      const video = this.#videoElement;
      const timeoutId = window.setTimeout(() => { cleanup(); reject(new WebcamError('VIDEO_PLAY_TIMEOUT', 'Timeout waiting for video to play.')); }, 10000);
      const cleanup = () => { video.removeEventListener('loadeddata', onLoadedData); video.removeEventListener('error', onError); };
      const onError = (e: Event) => { cleanup(); const mediaError = (e.target as HTMLVideoElement)?.error; reject(new WebcamError('VIDEO_ELEMENT_ERROR', mediaError ? `Video playback error: ${mediaError.message} (Code: ${mediaError.code})` : 'An unknown error occurred.')); };
      const onPlaying = () => { clearTimeout(timeoutId); cleanup(); resolve(); };
      const onLoadedData = () => { video.play().then(onPlaying).catch(onError); };
      video.addEventListener('loadeddata', onLoadedData, { once: true });
      video.addEventListener('error', onError, { once: true });
    });
  }

  async #handleStreamStartSuccess(rtspSourceConfig: RtspSourceConfig | null): Promise<void> {
    this.#appStore.getState().actions.setWebcamRunningStatus(true);
    if (!this.isStreamingRtsp()) {
        console.log(`[CameraManager] Stream started. Resolution: ${this.#videoElement.videoWidth}x${this.#videoElement.videoHeight}.`);
    }
    const actualTrack = this.#stream?.getVideoTracks()[0];
    if (actualTrack && !this.isStreamingRtsp()) {
      const deviceIdFromTrack = actualTrack.getSettings().deviceId;
      if (deviceIdFromTrack) { this.#currentDeviceId = deviceIdFromTrack; secureStorage.set(STORAGE_KEY_LAST_WEBCAM_ID, deviceIdFromTrack); }
    }

    const roiForProcessing = this.isStreamingRtsp() ? (rtspSourceConfig?.roi || null) : null;
    this.#gestureProcessorRef.setActiveStreamRoi(roiForProcessing);
    this.#canvasRendererRef.updateSourceInfo(this.#currentDeviceId, roiForProcessing);
    this.#canvasRendererRef.drawOutput();

    pubsub.publish(WEBCAM_EVENTS.STREAM_START, { deviceId: this.#currentDeviceId });
    
    await this.#gestureProcessorRef.waitUntilModelsReady();
    
    this.#gestureProcessorRef.enableProcessing(true);
    
    try {
        for (let i = 0; i < 3; i++) {
            await this.#gestureProcessorRef.processFrame({ videoElement: this.#videoElement, imageSourceElement: this.#videoElement, roiConfig: roiForProcessing, timestamp: performance.now() }, true);
            await new Promise(resolve => setTimeout(resolve, 50));
        }
    } catch (e) {
        console.warn("[CameraManager] Error during processor priming:", e);
    }

    this.#processingLoop();
  }

  public async stop(publishStopEvent = true): Promise<void> {
    if (this.#animationFrameId) { cancelAnimationFrame(this.#animationFrameId); this.#animationFrameId = null; }
    this.#gestureProcessorRef.enableProcessing(false);
    this.#streamService.stopStream();
    if (this.#stream) this.#stream.getTracks().forEach((track) => track.stop());
    this.#stream = null; this.#videoElement.srcObject = null; this.#videoElement.pause();
    this.#videoElement.closest('.video-container')?.classList.remove('video-active', 'initial-show');
    this.#canvasRendererRef.clearVideoSource();
    if (publishStopEvent) pubsub.publish(WEBCAM_EVENTS.STREAM_STOP);
  }
  
  #processingLoop = (timestamp?: number): void => {
    if (!this.isStreaming()) return;
    this.#gestureProcessorRef.processFrame({ videoElement: this.#videoElement, imageSourceElement: this.#videoElement, roiConfig: this.#gestureProcessorRef.getStateLogic().getActiveStreamRoi(), timestamp: timestamp || performance.now() });
    this.#animationFrameId = requestAnimationFrame(this.#processingLoop);
  };

  public async flipCamera(): Promise<void> {
    if (!this.canFlipCamera()) return;

    this.#currentFacingMode = this.#currentFacingMode === 'user' ? 'environment' : 'user';

    const { actions } = this.#appStore.getState();
    actions.setIsStreamConnecting(true);
    try {
      await this.start(MOBILE_WEBCAM_PLACEHOLDER_ID, null);
    } catch (error) {
      console.error('[CameraManager] Error during flipCamera:', error);
      this.#currentFacingMode = this.#currentFacingMode === 'user' ? 'environment' : 'user';
    } finally {
      actions.setIsStreamConnecting(false);
    }
  }

  public isStreaming = (): boolean => !!this.#stream;
  public isStreamingRtsp = (): boolean => !!this.#currentDeviceId?.startsWith('rtsp:');
  public canFlipCamera = (): boolean => 'facingMode' in navigator.mediaDevices.getSupportedConstraints();
  public getCanvasRenderer = (): CanvasRenderer => this.#canvasRendererRef;
  public getCameraSourceManager = (): CameraSourceManager => this.#cameraSourceManager;
  public getVideoElement = (): HTMLVideoElement | null => this.#videoElement;
  public getCurrentDeviceId = (): string | null => this.#currentDeviceId;
  public getCurrentFacingMode = (): 'user' | 'environment' => this.#currentFacingMode;
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
    secureStorage.set(STORAGE_KEY_MIRROR_STATE_PER_SOURCE, Object.fromEntries(this.#mirrorStateMap));
    if (this.isStreaming()) { this.#videoElement.classList.toggle('mirrored', newState); this.#canvasRendererRef.drawOutput(); }
    pubsub.publish(UI_EVENTS.REQUEST_BUTTON_STATE_UPDATE);
  }

  #mapToWebcamError = (error: Error): WebcamError => {
    if (error instanceof WebcamError) return error;
    let code: string;
    switch (error.name) {
        case 'NotAllowedError': code = 'PERMISSION_DENIED'; break;
        case 'NotFoundError': code = 'DEVICE_NOT_FOUND'; break;
        default: code = 'UNKNOWN';
    }
    return new WebcamError(code, error.message);
  };
}