/* FILE: packages/frontend/src/services/camera.service.ts */
import { pubsub, UI_EVENTS, WEBSOCKET_EVENTS, PERMISSION_EVENTS, CAMERA_SOURCE_EVENTS, normalizeNameForMtx, type RtspSourceConfig, WEBCAM_EVENTS } from '#shared/index.js';
import { secureStorage } from '#shared/services/security-utils.js';
import { DEFAULT_WEBCAM_FACING_MODE, MOBILE_WEBCAM_PLACEHOLDER_ID, STORAGE_KEY_LAST_WEBCAM_ID, STORAGE_KEY_SELECTED_CAMERA_SOURCE, STORAGE_KEY_MIRROR_STATE_PER_SOURCE } from '#frontend/constants/index.js';
import { WebcamError } from '#frontend/camera/webcam-error.js';
import { RtspConnector } from '#frontend/camera/rtsp/connector.js';
import { webSocketService } from './websocket-service.js';
import type { AppStore, AppState } from '#frontend/core/state/app-store.js';
import type { GestureProcessor } from '#frontend/gestures/processor.js';
import type { CanvasRenderer } from '#frontend/camera/canvas-renderer.js';
import type { TranslationService } from './translation.service.js';
import type { SnapshotData } from '#frontend/types/index.js';

let streamPromiseAbortController: AbortController | null = null;

export interface CameraServiceDependencies {
  videoElement: HTMLVideoElement;
  outputCanvas: HTMLCanvasElement;
  appStore: AppStore;
  gestureProcessor: GestureProcessor;
  canvasRenderer: CanvasRenderer;
  translationService: TranslationService;
}

export interface StartStreamOptions {
  cameraId: string;
}

export class CameraService {
  #videoElement: HTMLVideoElement;
  #canvasElement: HTMLCanvasElement;
  #appStore: AppStore;
  #gestureProcessor: GestureProcessor;
  #canvasRenderer: CanvasRenderer;
  #translationService: TranslationService;
  #stream: MediaStream | null = null;
  #currentSourceId: string | null = '';
  #mirrorStateMap = new Map<string, boolean>();
  #currentFacingMode: 'user' | 'environment' = DEFAULT_WEBCAM_FACING_MODE;
  #animationFrameId: number | null = null;
  #rtspConnector: RtspConnector | null = null;
  #activeOnDemandSource: string | null = null;
  #deviceMap = new Map<string, string>();
  #isMobile = false;
  #subscriptions: (() => void)[] = [];

  constructor(dependencies: CameraServiceDependencies) {
    this.#videoElement = dependencies.videoElement;
    this.#canvasElement = dependencies.outputCanvas;
    this.#appStore = dependencies.appStore;
    this.#gestureProcessor = dependencies.gestureProcessor;
    this.#canvasRenderer = dependencies.canvasRenderer;
    this.#translationService = dependencies.translationService;
    this.#isMobile = window.matchMedia('(any-pointer: coarse)').matches;
  }

  public initialize(): void {
    this.#loadPreferences();
    this.#rebuildAndValidateDeviceList(); 
    this.#subscribeToEvents();
    setTimeout(() => this.refreshDeviceList(), 100);
  }

  public destroy(): void {
    this.#subscriptions.forEach(unsub => unsub());
    this.#subscriptions = [];
    if (this.#animationFrameId) cancelAnimationFrame(this.#animationFrameId);
  }

  #subscribeToEvents(): void {
    const storeUnsubscribe = this.#appStore.subscribe((state, prevState) => this.#handleStoreChange(state, prevState));
    const permissionSub = pubsub.subscribe(PERMISSION_EVENTS.CAMERA_CHANGED, () => this.refreshDeviceList());
    const mirrorSub = pubsub.subscribe(UI_EVENTS.REQUEST_MIRROR_TOGGLE, this.toggleMirroringForCurrentStream);
    const stopStreamSub = pubsub.subscribe(UI_EVENTS.REQUEST_STOP_STREAM, () => this.stopStream());
    const fullscreenExitSub = pubsub.subscribe(UI_EVENTS.VIDEO_EXIT_FULLSCREEN, () => this.#appStore.getState().actions.toggleVideoExpanded());
    this.#subscriptions.push(storeUnsubscribe, permissionSub, mirrorSub, stopStreamSub, fullscreenExitSub);
  }

  #handleStoreChange(state: AppState, prevState: AppState): void {
    const { rtspSources, processingResolutionWidthPreference, showHandLandmarks, showPoseLandmarks, lowLightBrightness, lowLightContrast } = state;
    if (JSON.stringify(rtspSources) !== JSON.stringify(prevState.rtspSources)) {
      this.#rebuildAndValidateDeviceList();
      if (this.isStreaming()) this.#handleLiveRtspConfigUpdate(rtspSources);
    }
    if (processingResolutionWidthPreference !== prevState.processingResolutionWidthPreference && this.isStreaming() && !this.isStreamingRtsp()) {
      this.startStream({ cameraId: this.#currentSourceId || '' }).catch(e => console.error("Error restarting stream after resolution change:", e));
    }
    if (showHandLandmarks !== prevState.showHandLandmarks || showPoseLandmarks !== prevState.showPoseLandmarks) {
      this.#canvasRenderer.drawOutput();
    }
    if (lowLightBrightness !== prevState.lowLightBrightness || lowLightContrast !== prevState.lowLightContrast) {
        this.#applyVideoFilters(lowLightBrightness, lowLightContrast);
    }
  }

  #loadPreferences(): void {
    this.#currentSourceId = (secureStorage.get(STORAGE_KEY_SELECTED_CAMERA_SOURCE) as string | null) ?? '';
    try {
      const stored = secureStorage.get(STORAGE_KEY_MIRROR_STATE_PER_SOURCE) as Record<string, boolean> | null;
      if (stored) this.#mirrorStateMap = new Map(Object.entries(stored));
    } catch (e) { console.error('[CameraService] Failed to load mirror state:', e); }
  }

  #applyVideoFilters(brightness: number, contrast: number): void {
      if (this.#videoElement) {
          this.#videoElement.style.filter = `brightness(${brightness}%) contrast(${contrast}%)`;
      }
  }

  public async startStream(options: StartStreamOptions): Promise<void> {
    if (!options.cameraId) return;
    if (this.isStreamActive()) await this.stopStream(false);
    const { actions } = this.#appStore.getState();
    actions.setIsStreamConnecting(true);
    try {
      this.#currentSourceId = options.cameraId;
      this.#videoElement.classList.toggle('mirrored', this.isMirrored());
      this.#videoElement.closest('.video-container')?.classList.add('video-active');
      
      const stream = await this.#acquireStream(options.cameraId);
      this.#stream = stream;
      this.#videoElement.srcObject = stream;
      await this.#waitForVideoToPlay();
      await this.#handleStreamStartSuccess();
    } catch (error) {
      const specificError = error instanceof WebcamError ? error : new WebcamError('UNKNOWN', (error as Error).message);
      pubsub.publish(WEBCAM_EVENTS.ERROR, { code: specificError.code, message: specificError.message });
      await this.stopStream();
      throw specificError;
    } finally {
      actions.setIsStreamConnecting(false);
    }
  }

  public isStreamActive = (): boolean => !!this.#stream;

  public stopStream = async (publishStopEvent = true): Promise<void> => {
    if (this.#animationFrameId) { cancelAnimationFrame(this.#animationFrameId); this.#animationFrameId = null; }
    if (streamPromiseAbortController) { streamPromiseAbortController.abort('Stream stop initiated'); streamPromiseAbortController = null; }
    
    // FIX: Automatically exit fullscreen (expanded mode) if stream stops
    if (this.#appStore.getState().isVideoExpanded) {
        this.#appStore.getState().actions.toggleVideoExpanded();
    }

    this.#rtspConnector?.disconnect();
    this.#rtspConnector = null;
    
    if (this.#activeOnDemandSource) {
      webSocketService.sendMessage({ type: WEBSOCKET_EVENTS.RTSP_DISCONNECT_REQUEST, payload: { pathName: this.#activeOnDemandSource } });
      this.#activeOnDemandSource = null;
    }
    
    this.#gestureProcessor.enableProcessing(false);
    this.#stream?.getTracks().forEach((track) => track.stop());
    this.#stream = null; this.#videoElement.srcObject = null; this.#videoElement.pause();
    this.#videoElement.closest('.video-container')?.classList.remove('video-active');
    this.#canvasRenderer.clearVideoSource();
    
    this.#videoElement.style.filter = '';

    if (publishStopEvent) {
      pubsub.publish(WEBCAM_EVENTS.STREAM_STOP);
      this.#appStore.getState().actions.setWebcamRunningStatus(false);
    }
  };

  async #acquireStream(targetDeviceId: string): Promise<MediaStream> {
    if (streamPromiseAbortController) streamPromiseAbortController.abort('New stream start initiated');
    streamPromiseAbortController = new AbortController();
    const signal = streamPromiseAbortController.signal;
    
    try {
      if (signal.aborted) throw new DOMException('Aborted before start', 'AbortError');
      const isRtsp = targetDeviceId.startsWith('rtsp:');
      const stream = isRtsp ? await this.#startRtspStream(targetDeviceId, signal) : await this.#startWebcamStream(targetDeviceId, signal);
      
      if (!stream) throw new WebcamError('STREAM_ACQUISITION_FAILED', 'Failed to acquire stream.');
      streamPromiseAbortController = null;
      return stream;
    } catch (error) {
      streamPromiseAbortController = null;
      throw error;
    }
  }

  async #startWebcamStream(targetDeviceId: string, signal: AbortSignal): Promise<MediaStream> {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new WebcamError('HTTPS_REQUIRED', 'HTTPS Required');
    }

    const { processingResolutionWidthPreference, targetFpsPreference } = this.#appStore.getState();
    const constraints: MediaStreamConstraints = {
      audio: false,
      video: { width: { ideal: processingResolutionWidthPreference }, frameRate: { ideal: targetFpsPreference } },
    };

    if (targetDeviceId && targetDeviceId !== MOBILE_WEBCAM_PLACEHOLDER_ID) {
      (constraints.video as MediaTrackConstraints).deviceId = { exact: targetDeviceId };
    } else if (targetDeviceId === MOBILE_WEBCAM_PLACEHOLDER_ID && this.canFlipCamera()) {
      (constraints.video as MediaTrackConstraints).facingMode = { exact: this.#currentFacingMode };
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      if (signal.aborted) { stream.getTracks().forEach(t => t.stop()); throw new DOMException('Aborted after stream aquired', 'AbortError'); }
      return stream;
    } catch (error) {
       console.error("[CameraService] getUserMedia error:", error);
       throw error;
    }
  }

  async #startRtspStream(targetDeviceId: string, signal: AbortSignal): Promise<MediaStream> {
    const normalizedPathName = targetDeviceId.substring(5);
    const rtspConfig = this.#appStore.getState().rtspSources.find(s => normalizeNameForMtx(s.name) === normalizedPathName);
    
    if (!rtspConfig) throw new WebcamError('RTSP_CONFIG_NOT_FOUND', `Config for '${targetDeviceId}' not found.`);
    
    await webSocketService.request(WEBSOCKET_EVENTS.RTSP_CONNECT_REQUEST, { pathName: normalizedPathName, url: rtspConfig.url }, 10000);
    if (rtspConfig.sourceOnDemand) this.#activeOnDemandSource = normalizedPathName;
    
    this.#rtspConnector = new RtspConnector();
    signal.addEventListener('abort', () => this.#rtspConnector?.abort());
    return this.#rtspConnector.connect(normalizedPathName);
  }

  async #waitForVideoToPlay(): Promise<void> {
    return new Promise((resolve, reject) => {
      const video = this.#videoElement;
      const timeoutId = window.setTimeout(() => { cleanup(); reject(new WebcamError('VIDEO_PLAY_TIMEOUT')); }, 10000);
      const onError = (e: Event) => { cleanup(); const mediaError = (e.target as HTMLVideoElement)?.error; reject(new WebcamError('VIDEO_ELEMENT_ERROR', mediaError ? `Code ${mediaError.code}: ${mediaError.message}` : '')); };
      const onPlaying = () => { clearTimeout(timeoutId); cleanup(); resolve(); };
      const onLoadedData = () => { video.play().then(onPlaying).catch(onError); };
      const cleanup = () => { video.removeEventListener('loadeddata', onLoadedData); video.removeEventListener('error', onError); };
      video.addEventListener('loadeddata', onLoadedData, { once: true });
      video.addEventListener('error', onError, { once: true });
    });
  }

  async #handleStreamStartSuccess(): Promise<void> {
    this.#appStore.getState().actions.setWebcamRunningStatus(true);
    if (!this.isStreamingRtsp()) {
      const deviceId = this.#stream?.getVideoTracks()[0]?.getSettings().deviceId;
      if (deviceId) { this.#currentSourceId = deviceId; secureStorage.set(STORAGE_KEY_LAST_WEBCAM_ID, deviceId); }
      
      this.refreshDeviceList();
    }
    const roi = this.isStreamingRtsp() ? this.#appStore.getState().rtspSources.find(s => `rtsp:${normalizeNameForMtx(s.name)}` === this.#currentSourceId)?.roi ?? null : null;
    
    const state = this.#appStore.getState();
    this.#applyVideoFilters(state.lowLightBrightness, state.lowLightContrast);

    this.#gestureProcessor.setActiveStreamRoi(roi);
    this.#canvasRenderer.updateSourceInfo(this.#currentSourceId, roi);
    this.#canvasRenderer.handleResize();
    
    pubsub.publish(WEBCAM_EVENTS.STREAM_START, { deviceId: this.#currentSourceId });
    
    await this.#gestureProcessor.waitUntilModelsReady();
    this.#gestureProcessor.enableProcessing(true);
    this.#processingLoop();
  }

  #processingLoop = (timestamp?: number): void => {
    if (!this.isStreamActive()) return;
    this.#gestureProcessor.processFrame({
      videoElement: this.#videoElement,
      imageSourceElement: this.#videoElement,
      roiConfig: this.#gestureProcessor.getActiveStreamRoi(),
      timestamp: timestamp || performance.now()
    });
    this.#animationFrameId = requestAnimationFrame(this.#processingLoop);
  };

  #handleLiveRtspConfigUpdate(newSources: RtspSourceConfig[]): void {
    if (!this.isStreamingRtsp() || !this.#currentSourceId) return;
    const currentNormalizedName = this.#currentSourceId.substring(5);
    const newConfig = newSources.find(s => normalizeNameForMtx(s.name) === currentNormalizedName);
    const oldConfig = this.#appStore.getState().rtspSources.find(s => normalizeNameForMtx(s.name) === currentNormalizedName);
    
    if (!newConfig || newConfig.url !== oldConfig?.url) {
      pubsub.publish(UI_EVENTS.SHOW_NOTIFICATION, { messageKey: !newConfig ? 'notificationStreamStoppedConfigChanged' : 'notificationStreamUrlChanged', type: 'warning' });
      this.stopStream();
      return;
    }
    if (JSON.stringify(newConfig.roi) !== JSON.stringify(oldConfig?.roi)) {
      const newRoi = newConfig.roi || null;
      this.#canvasRenderer.updateSourceInfo(this.#currentSourceId, newRoi);
      this.#gestureProcessor.setActiveStreamRoi(newRoi);
    }
  }

  public async refreshDeviceList(): Promise<void> {
    if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
        console.warn("[CameraService] navigator.mediaDevices is undefined. HTTPS required.");
        pubsub.publish(UI_EVENTS.SHOW_ERROR, { messageKey: "httpsRequired" });
        return;
    }

    try {
      let devices = await navigator.mediaDevices.enumerateDevices();
      let webcamDevices = devices.filter(d => d.kind === 'videoinput');

      const hasUnlabeledDevices = webcamDevices.length > 0 && webcamDevices.some(d => !d.label);

      if (hasUnlabeledDevices) {
          console.log("[CameraService] Detected unlabeled devices. Requesting permission...");
          try {
              const stream = await navigator.mediaDevices.getUserMedia({ video: true });
              stream.getTracks().forEach(t => t.stop());
              devices = await navigator.mediaDevices.enumerateDevices();
              webcamDevices = devices.filter(d => d.kind === 'videoinput');
          } catch (permError) {
              console.warn("[CameraService] Permission denied or failed:", permError);
          }
      }

      const webcamList = webcamDevices.map((d, i) => ({ 
          id: d.deviceId, 
          label: d.label || `${this.#translationService.translate('Camera')} ${i + 1}` 
      }));

      const webcamMap = this.#isMobile && webcamList.length > 0
        ? new Map([[MOBILE_WEBCAM_PLACEHOLDER_ID, this.#translationService.translate("Webcam")]])
        : new Map(webcamList.map(d => [d.id, d.label]));

      this.#deviceMap = new Map([...webcamMap, ...this.#createRtspDeviceMap(this.#appStore.getState().rtspSources)]);
      this.#rebuildAndValidateDeviceList();
      
    } catch (error) {
      console.error('[CameraService] Device enumeration failed:', error);
      this.#rebuildAndValidateDeviceList();
    }
  }

  #rebuildAndValidateDeviceList = (): void => {
    const rtspMap = this.#createRtspDeviceMap(this.#appStore.getState().rtspSources);
    const oldWebcamEntries = Array.from(this.#deviceMap.entries()).filter(([id]) => !id.startsWith('rtsp:'));
    this.#deviceMap = new Map([...oldWebcamEntries, ...rtspMap]);
    
    if (this.#currentSourceId && !this.#deviceMap.has(this.#currentSourceId)) {
      this.setSelectedCameraSource('');
    }
    
    pubsub.publish(CAMERA_SOURCE_EVENTS.MAP_UPDATED, new Map(this.#deviceMap));
  };

  #createRtspDeviceMap(rtspSources: RtspSourceConfig[]): Map<string, string> {
    return new Map((rtspSources || []).map(src => [`rtsp:${normalizeNameForMtx(src.name)}`, src.name]));
  }

  public setSelectedCameraSource = (deviceId: string | null | undefined): void => {
    this.#currentSourceId = deviceId?.trim() ?? '';
    secureStorage.set(STORAGE_KEY_SELECTED_CAMERA_SOURCE, this.#currentSourceId);
  }

  public isStreaming = (): boolean => this.isStreamActive();
  public isStreamingRtsp = (): boolean => !!this.#currentSourceId?.startsWith('rtsp:');
  
  public canFlipCamera = (): boolean => {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getSupportedConstraints) return false;
      return 'facingMode' in navigator.mediaDevices.getSupportedConstraints();
  };

  public getStreamElements = (): { video: HTMLVideoElement; canvas: HTMLCanvasElement } => ({ video: this.#videoElement, canvas: this.#canvasElement });
  public getCurrentDeviceId = (): string | null => this.#currentSourceId;
  public getLandmarkSnapshot = (): Promise<SnapshotData> => this.#gestureProcessor.getSnapshot();

  public isMirrored(): boolean {
    const deviceId = this.#currentSourceId || '';
    return this.#mirrorStateMap.get(deviceId) ?? !deviceId.startsWith('rtsp:');
  }

  public flipCamera = async (): Promise<void> => {
    if (!this.canFlipCamera()) return;
    this.#currentFacingMode = this.#currentFacingMode === 'user' ? 'environment' : 'user';
    this.#appStore.getState().actions.setIsStreamConnecting(true);
    try {
      await this.startStream({ cameraId: MOBILE_WEBCAM_PLACEHOLDER_ID });
    } catch (_error) {
      this.#currentFacingMode = this.#currentFacingMode === 'user' ? 'environment' : 'user';
    } finally {
      this.#appStore.getState().actions.setIsStreamConnecting(false);
    }
  };

  public toggleMirroringForCurrentStream = (): void => {
    const deviceId = this.#currentSourceId;
    if (!deviceId) return;
    const newState = !this.isMirrored();
    this.#mirrorStateMap.set(deviceId, newState);
    secureStorage.set(STORAGE_KEY_MIRROR_STATE_PER_SOURCE, Object.fromEntries(this.#mirrorStateMap));
    
    if (this.isStreaming()) {
      this.#videoElement.classList.toggle('mirrored', newState);
      this.#canvasRenderer.drawOutput();
    }
    pubsub.publish(UI_EVENTS.REQUEST_BUTTON_STATE_UPDATE);
  }
}