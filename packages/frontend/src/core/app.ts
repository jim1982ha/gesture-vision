/* FILE: packages/frontend/src/core/app.ts */
// Main application class, initializes and coordinates core modules.
import { AppStatusManager } from './app-status-manager.js';
import type { AppStore } from './state/app-store.js';
import type { AllDOMElements } from './dom-elements.js';
import { GestureProcessor } from '#frontend/gestures/processor.js';
import { CameraService } from '#frontend/services/camera.service.js';
import type { TranslationService } from '#frontend/services/translation.service.js';
import { UIController } from '#frontend/ui/ui-controller-core.js';
import {
  pubsub,
  WEBCAM_EVENTS,
  UI_EVENTS,
  CAMERA_SOURCE_EVENTS,
  DOCS_MODAL_EVENTS,
  normalizeNameForMtx,
} from '#shared/index.js';
import type { RtspSourceConfig } from '#shared/index.js';
import { CameraManager } from '#frontend/camera/camera-manager.js';

export class App {
  ui: UIController;
  cameraService: CameraService;
  gesture: GestureProcessor;
  appStatusManager: AppStatusManager;
  appStore: AppStore;
  translationService: TranslationService;
  elements: Partial<AllDOMElements>;
  cameraManager: CameraManager;
  #frameAnalysisHandlerId: number | null = null;
  #videoOriginalParent: HTMLElement | null = null;
  #videoOriginalNextSibling: Node | null = null;

  constructor(
    elements: Partial<AllDOMElements>,
    appStore: AppStore,
    translationService: TranslationService
  ) {
    this.elements = elements;
    this.appStore = appStore;
    this.translationService = translationService;
    this.appStatusManager = new AppStatusManager();

    // Create GestureProcessor first. It does not need the renderer in its constructor.
    this.gesture = new GestureProcessor(this.appStore);

    // Now create CameraManager, passing the valid GestureProcessor instance.
    // The CameraManager constructor will create the CanvasRenderer.
    this.cameraManager = new CameraManager(
      elements.videoElement as HTMLVideoElement,
      elements.outputCanvas as HTMLCanvasElement,
      this.appStore,
      this.gesture
    );

    // Finally, provide the GestureProcessor with its required CanvasRenderer reference.
    this.gesture.setCanvasRenderer(this.cameraManager.getCanvasRenderer());

    this.cameraService = new CameraService(this.cameraManager);
    this.ui = new UIController(this);

    this.setAppVersionDisplay();

    this.elements.appVersionDisplaySettings?.addEventListener('click', () => {
      pubsub.publish(DOCS_MODAL_EVENTS.REQUEST_OPEN, 'ABOUT');
    });
  }

  public async initializeAppSequence(): Promise<void> {
    try {
      console.info('[Init Step 1/4] Waiting for Translation Service...');
      await this.translationService.waitUntilInitialized();
      console.info('[Init Step 1/4] Translation Service is ready.');

      console.info('[Init Step 2/4] Initializing App Status Manager...');
      this.appStatusManager.setAppRef(this);
      console.info('[Init Step 2/4] App Status Manager is ready.');

      console.info('[Init Step 3/4] Initializing UI Controller...');
      await this.ui.initialize();
      console.info('[Init Step 3/4] UI Controller is ready.');

      console.info('[Init Step 4/4] Setting up core event listeners...');
      this.setupLifecycleListeners();
      pubsub.subscribe(WEBCAM_EVENTS.STREAM_START, this.#startFrameUpdates);
      pubsub.subscribe(WEBCAM_EVENTS.STREAM_STOP, this.#cancelFrameUpdates);
      pubsub.subscribe(CAMERA_SOURCE_EVENTS.CHANGED, (id?: unknown) =>
        this.startStreamWithSource(id as string | null | undefined)
      );
      console.info('[Init Step 4/4] Core event listeners are active.');

    } catch (e) {
      console.error('[App] FATAL Error during initialization:', e);
      document.body.innerHTML = `<div style="color: red; padding: 20px;"><h1>App Init Failed</h1><p>${
        (e as Error).message
      }</p></div>`;
    }
  }

  public setAppVersionDisplay(): void {
    const versionDiv = this.elements.appVersionDisplaySettings;
    if (versionDiv)
      versionDiv.textContent = `v. ${
        typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev'
      }`;
  }

  public setupLifecycleListeners(): void {
    document.addEventListener('visibilitychange', this.#handleVisibilityChange);
    pubsub.subscribe(UI_EVENTS.REQUEST_VIDEO_REPARENT, (p?: unknown) =>
      this.#handleVideoReparentRequest(
        p as { placeholderElement?: HTMLElement; release?: boolean }
      )
    );
  }

  #handleVisibilityChange = (): void => {
    if (
      document.visibilityState === 'hidden' &&
      this.cameraService.isStreamActive()
    ) {
      this.cameraService.stopStream().catch((e) => console.error(e));
    }
  };

  #handleVideoReparentRequest = (payload?: {
    placeholderElement?: HTMLElement;
    release?: boolean;
  }): void => {
    const videoContainer = this.elements.videoContainer as HTMLElement;
    if (!videoContainer) return;

    if (payload?.release) {
      if (this.#videoOriginalParent)
        this.#videoOriginalParent.insertBefore(
          videoContainer,
          this.#videoOriginalNextSibling
        );
    } else if (payload?.placeholderElement) {
      this.#videoOriginalParent = videoContainer.parentElement;
      this.#videoOriginalNextSibling = videoContainer.nextSibling;
      payload.placeholderElement.appendChild(videoContainer);
    }
  };

  public async startStreamWithSource(
    targetDeviceId: string | null | undefined
  ): Promise<void> {
    const safeTargetId = targetDeviceId || '';
    pubsub.publish(CAMERA_SOURCE_EVENTS.REQUESTING_STREAM_START, safeTargetId);

    let rtspConfig: RtspSourceConfig | null = null;
    if (safeTargetId.startsWith('rtsp:')) {
      const rtspSources = this.appStore.getState().rtspSources || [];
      rtspConfig =
        rtspSources.find(
          (s) => `rtsp:${normalizeNameForMtx(s.name)}` === safeTargetId
        ) || null;
      if (!rtspConfig) {
        pubsub.publish(UI_EVENTS.SHOW_ERROR, {
          message: `Config not found for ${safeTargetId}`,
        });
        return;
      }
    }

    try {
      await this.cameraService.startStream({
        cameraId: safeTargetId,
        rtspSourceConfig: rtspConfig,
      });
    } catch (e) {
      console.error(`[App] Error starting stream for '${safeTargetId}':`, e);
    }
  }

  #startFrameUpdates = (): void => {
    this.#cancelFrameUpdates();
    const frameLoop = (): void => {
      if (!this.cameraService.isStreamActive()) {
        this.#cancelFrameUpdates();
        return;
      }
      
      const videoElement = this.cameraManager?.getVideoElement();
      const canvasElement = this.cameraManager?.getCanvasRenderer()?.getCanvasElement();

      if (videoElement && canvasElement) {
        // First, synchronously draw the current video frame and any available landmarks to the canvas for display.
        this.cameraManager.getCanvasRenderer().drawOutput();
        
        // Then, asynchronously process the raw video frame for gestures.
        // This ensures the AI always processes a non-mirrored frame, fixing the landmark mirroring bug.
        this.gesture.processFrame({
            videoElement: videoElement,
            imageSourceElement: videoElement, // Use the raw video as the source for AI
            roiConfig: this.gesture.getStateLogic().getActiveStreamRoi(),
            timestamp: performance.now(),
          }).catch(error => {
            console.error("[App] Unhandled error in frame processing promise:", error);
          });
      }

      this.#frameAnalysisHandlerId = requestAnimationFrame(frameLoop);
    };
    this.#frameAnalysisHandlerId = requestAnimationFrame(frameLoop);
  };

  #cancelFrameUpdates = (): void => {
    if (this.#frameAnalysisHandlerId)
      cancelAnimationFrame(this.#frameAnalysisHandlerId);
    this.#frameAnalysisHandlerId = null;
  };
}