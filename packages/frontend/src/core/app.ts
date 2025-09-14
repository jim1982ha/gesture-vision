/* FILE: packages/frontend/src/core/app.ts */
// Main application class, initializes and coordinates core modules.
import type { AppStore } from './state/app-store.js';
import { GestureProcessor } from '#frontend/gestures/processor.js';
import { CameraService } from '#frontend/services/camera.service.js';
import { TranslationService } from '#frontend/services/translation.service.js';
import { UIController } from '#frontend/ui/ui-controller-core.js';
import {
  pubsub,
  WEBCAM_EVENTS,
  UI_EVENTS,
  CAMERA_SOURCE_EVENTS,
  DOCS_MODAL_EVENTS,
  GESTURE_EVENTS,
} from '#shared/index.js';
import { CameraManager } from '#frontend/camera/camera-manager.js';
import { AppStatusManager } from './app-status-manager.js';

export class App {
  ui: UIController;
  cameraService: CameraService;
  gesture: GestureProcessor;
  appStore: AppStore;
  translationService: TranslationService;
  cameraManager: CameraManager;
  statusManager: AppStatusManager;
  #frameAnalysisHandlerId: number | null = null;
  #videoOriginalParent: HTMLElement | null = null;
  #videoOriginalNextSibling: Node | null = null;

  #boundHandleVisibilityChange = this.#handleVisibilityChange.bind(this);

  constructor(
    appStore: AppStore
  ) {
    this.appStore = appStore;
    this.translationService = new TranslationService(this.appStore);
    this.statusManager = new AppStatusManager();

    const videoElement = document.getElementById("webcam") as HTMLVideoElement;
    const outputCanvas = document.getElementById("output_canvas") as HTMLCanvasElement;
    if (!videoElement || !outputCanvas) {
      throw new Error("Critical video or canvas element not found in DOM.");
    }

    this.gesture = new GestureProcessor(this.appStore, this.translationService);
    this.cameraManager = new CameraManager(videoElement, outputCanvas, this.appStore, this.gesture, this.translationService);
    this.gesture.setCanvasRenderer(this.cameraManager.getCanvasRenderer());

    this.cameraService = new CameraService(this.cameraManager);
    this.ui = new UIController(this);
    
    this.statusManager.setAppRef(this);

    this.setAppVersionDisplay();

    document.getElementById("appVersionDisplay")?.addEventListener('click', () => {
      pubsub.publish(DOCS_MODAL_EVENTS.REQUEST_OPEN, 'ABOUT');
    });
  }

  public async initializeAppSequence(): Promise<void> {
    try {
      console.info("[Init Step 1/4] Waiting for Translation Service...");
      await this.translationService.waitUntilInitialized();

      console.info("[Init Step 2/4] Initializing UI Controller...");
      await this.ui.initialize();

      console.info('[Init Step 3/4] Setting up core event listeners...');
      this.setupLifecycleListeners();
      
      console.info('[Init Step 4/4] Triggering initial stream if source is selected...');
      this.cameraManager.getCameraSourceManager().triggerInitialStreamIfNeeded();

    } catch (e) {
      console.error('[App] FATAL Error during initialization:', e);
      document.body.innerHTML = `<div style="color: red; padding: 20px;"><h1>App Init Failed</h1><p>${
        (e as Error).message
      }</p></div>`;
    }
  }

  public destroy(): void {
    document.removeEventListener('visibilitychange', this.#boundHandleVisibilityChange);
    this.ui.destroy();
    this.gesture.destroy();
    this.cameraManager.destroy();
  }

  public setAppVersionDisplay(): void {
    const versionDiv = document.getElementById("appVersionDisplaySettings");
    if (versionDiv)
      versionDiv.textContent = `v. ${
        typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev'
      }`;
  }

  public setupLifecycleListeners(): void {
    document.addEventListener('visibilitychange', this.#boundHandleVisibilityChange);

    pubsub.subscribe(WEBCAM_EVENTS.STREAM_START, this.#handleStreamStart);
    pubsub.subscribe(WEBCAM_EVENTS.STREAM_STOP, this.#handleStreamStop);
    pubsub.subscribe(WEBCAM_EVENTS.ERROR, this.#handleStreamStop);
    pubsub.subscribe(WEBCAM_EVENTS.STREAM_CONNECTION_CANCELLED, this.#handleStreamStop);

    pubsub.subscribe(CAMERA_SOURCE_EVENTS.CHANGED, (id?: unknown) =>
      this.startStreamWithSource(id as string | null | undefined)
    );
    pubsub.subscribe(CAMERA_SOURCE_EVENTS.REQUESTING_STREAM_START, () => {
      this.appStore.getState().actions.setIsStreamConnecting(true);
    });

    pubsub.subscribe(GESTURE_EVENTS.MODEL_LOADED, (status?: unknown) => {
        this.appStore.getState().actions.setModelLoadingStatus(status as { hand?: boolean; pose?: boolean });
    });
    
    pubsub.subscribe(UI_EVENTS.REQUEST_VIDEO_REPARENT, (p?: unknown) =>
      this.#handleVideoReparentRequest(
        p as { placeholderElement?: HTMLElement; release?: boolean }
      )
    );
  }

  #handleStreamStart = (): void => {
    this.#startFrameUpdates();
  };

  #handleStreamStop = (): void => {
    this.#cancelFrameUpdates();
  };

  #handleVisibilityChange(): void {
    if (
      document.visibilityState === 'hidden' &&
      this.cameraService.isStreamActive()
    ) {
      this.cameraService.stopStream().catch((e) => console.error(e));
    }
  }

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
      if (videoElement) {
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