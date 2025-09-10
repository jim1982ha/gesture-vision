/* FILE: packages/frontend/src/core/app.ts */
// Main application class, initializes and coordinates core modules.
import { AppStatusManager } from './app-status-manager.js';
import type { AppStore } from './state/app-store.js';
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
} from '#shared/index.js';
import { CameraManager } from '#frontend/camera/camera-manager.js';

export class App {
  ui: UIController;
  cameraService: CameraService;
  gesture: GestureProcessor;
  appStatusManager: AppStatusManager;
  appStore: AppStore;
  translationService: TranslationService;
  cameraManager: CameraManager;
  #frameAnalysisHandlerId: number | null = null;
  #videoOriginalParent: HTMLElement | null = null;
  #videoOriginalNextSibling: Node | null = null;

  constructor(
    appStore: AppStore,
    translationService: TranslationService
  ) {
    this.appStore = appStore;
    this.translationService = translationService;
    this.appStatusManager = new AppStatusManager();

    const videoElement = document.getElementById("webcam") as HTMLVideoElement;
    const outputCanvas = document.getElementById("output_canvas") as HTMLCanvasElement;
    if (!videoElement || !outputCanvas) {
      throw new Error("Critical video or canvas element not found in DOM.");
    }

    this.gesture = new GestureProcessor(this.appStore);
    this.cameraManager = new CameraManager(videoElement, outputCanvas, this.appStore, this.gesture);
    this.gesture.setCanvasRenderer(this.cameraManager.getCanvasRenderer());

    this.cameraService = new CameraService(this.cameraManager);
    this.ui = new UIController(this);

    this.setAppVersionDisplay();

    document.getElementById("appVersionDisplaySettings")?.addEventListener('click', () => {
      pubsub.publish(DOCS_MODAL_EVENTS.REQUEST_OPEN, 'ABOUT');
    });
  }

  public async initializeAppSequence(): Promise<void> {
    try {
      console.info("[Init Step 1/4] Waiting for Translation Service...");
      await this.translationService.waitUntilInitialized();
      console.info("[Init Step 1/4] Translation Service is ready.");

      console.info("[Init Step 2/4] Initializing App Status Manager...");
      this.appStatusManager.setAppRef(this);
      console.info("[Init Step 2/4] App Status Manager is ready.");

      console.info("[Init Step 3/4] Initializing UI Controller...");
      await this.ui.initialize();
      console.info("[Init Step 3/4] UI Controller is ready.");

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
    const versionDiv = document.getElementById("appVersionDisplaySettings");
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
    const videoContainer = document.querySelector(".video-container") as HTMLElement;
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

    try {
      // The CameraService is now responsible for finding the RTSP config if needed,
      // simplifying the controller's logic.
      await this.cameraService.startStream({ cameraId: safeTargetId });
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
        this.cameraManager.getCanvasRenderer().drawOutput();
        this.gesture.processFrame({
            videoElement: videoElement,
            imageSourceElement: videoElement,
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