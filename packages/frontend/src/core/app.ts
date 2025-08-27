/* FILE: packages/frontend/src/core/app.ts */
// Main application class, initializes and coordinates core modules.
import { WebcamManager } from '#frontend/camera/manager.js';
import { AppStatusManager } from '#frontend/core/app-status-manager.js';
import type { AppStore } from '#frontend/core/state/app-store.js';
import { GestureProcessor } from '#frontend/gestures/processor.js';
import { CameraService } from '#frontend/services/camera.service.js';
import type { TranslationService } from '#frontend/services/translation.service.js';
import { webSocketService } from '#frontend/services/websocket-service.js';
import { UIController } from '#frontend/ui/ui-controller-core.js';

import { ALL_EVENTS } from '#shared/constants/index.js';
import { pubsub } from '#shared/core/pubsub.js';
import { normalizeNameForMtx } from '#shared/utils/index.js';

import type {
  RoiConfig,
  RtspSourceConfig,
} from '#shared/types/index.js';
import type { AppDOMElements as AppElements } from '#frontend/types/index.js';

export class App {
  ui: UIController | null = null;
  webcam: WebcamManager | null = null;
  cameraService: CameraService | null = null;
  gesture: GestureProcessor | null = null;
  appStatusManager: AppStatusManager | null = null;
  appStore: AppStore;
  translationService: TranslationService;
  elements: Partial<AppElements> = {};
  #frameAnalysisHandlerId: number | null = null;

  #videoOriginalParent: HTMLElement | null = null;
  #videoOriginalNextSibling: Node | null = null;

  constructor(
    passedElements: Partial<AppElements> = {},
    appStoreInstance: AppStore,
    translationServiceInstance: TranslationService
  ) {
    this.elements = passedElements;
    if (!appStoreInstance)
      throw new Error('App constructor requires an AppStore instance.');
    this.appStore = appStoreInstance;
    if (!translationServiceInstance)
      throw new Error('App constructor requires a TranslationService instance.');
    this.translationService = translationServiceInstance;

    this.setAppVersionDisplay();
  }

  public async initializeAppSequence(): Promise<void> {
    try {
      await this.translationService.waitUntilInitialized();

      this.appStatusManager = new AppStatusManager();
      this.appStatusManager.setAppRef(this);

      this.gesture = new GestureProcessor(this.appStore, this.elements);

      this.ui = new UIController(
        this.elements,
        this.appStore,
        this.appStatusManager,
        this.translationService,
        this.gesture
      );
      this.ui.setAppRef(this);

      await this.ui.initialize();

      const updateRoiCallbackForWebcamManager = async (
        sourceId: string | null,
        roiConfig: RoiConfig
      ) => {
        if (!sourceId || !sourceId.startsWith('rtsp:')) return;
        const streamName = normalizeNameForMtx(sourceId.substring(5));
        try {
          const response = await fetch(`/api/rtsp/${streamName}/roi`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(roiConfig),
          });
          if (!response.ok) {
            const errorText = await response
              .text()
              .catch(() => 'Unknown API error');
            pubsub.publish(ALL_EVENTS.UI.SHOW_ERROR, {
              message: `ROI update failed: ${errorText}`,
            });
          }
        } catch (_error) {
          pubsub.publish(ALL_EVENTS.UI.SHOW_ERROR, {
            message: `ROI update network error.`,
          });
        }
      };

      this.webcam = new WebcamManager(
        this.elements.videoElement as HTMLVideoElement,
        this.elements.outputCanvas as HTMLCanvasElement,
        this.appStore,
        this.gesture,
        updateRoiCallbackForWebcamManager
      );
      this.webcam.setAppRef(this);

      this.cameraService = new CameraService(this.webcam, this.appStore);

      if (this.ui) {
        this.ui.setWebcamManager(this.webcam);
        this.ui.setCameraService(this.cameraService);
        if (this.webcam)
          this.ui.setCameraSourceManager(this.webcam.getCameraSourceManager());
      }

      if (this.ui.getRenderer() && this.webcam) {
        const canvasRenderer = this.webcam.getCanvasRenderer();
        if (canvasRenderer)
          this.ui.getRenderer()?.setCanvasRenderer(canvasRenderer);
        else
          console.error(
            '[App] CRITICAL: CanvasRenderer instance is null on WebcamManager.'
          );
      } else
        console.error(
          '[App] CRITICAL: Could not wire up CanvasRenderer due to missing UI or WebcamManager instances.'
        );

      await this.ui.waitUntilReady();

      pubsub.subscribe(
        ALL_EVENTS.WEBCAM.STREAM_START,
        this._startFrameUpdates
      );
      pubsub.subscribe(ALL_EVENTS.WEBCAM.STREAM_STOP, this._cancelFrameUpdates);

      await this.webcam.initialize();

      this.setupLifecycleListeners();
    } catch (_error: unknown) {
      const typedError = _error as Error;
      console.error('[App] FATAL Error during initialization:', typedError);
      const appContainer = document.body;
      const uiWithFatalError = this.ui as {
        _showFatalError: (msg: string) => void;
      } | null;
      if (
        uiWithFatalError &&
        typeof uiWithFatalError._showFatalError === 'function'
      ) {
        uiWithFatalError._showFatalError(
          `Initialization Failed: ${typedError.message}\n${typedError.stack}`
        );
      } else {
        appContainer.innerHTML = `<div style="color: red; padding: 20px; font-family: sans-serif;"><h1>Application Initialization Failed</h1><p>Error: ${
          typedError.message
        }. Check console.</p><pre>${typedError.stack || ''}</pre></div>`;
      }
    }
  }

  public setAppVersionDisplay(): void {
    try {
      const versionDiv = this.elements.appVersionDisplaySettings;
      if (versionDiv) {
        const appVersion =
          typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev';
        versionDiv.textContent = `v. ${appVersion}`;
      } else console.warn('[App] Settings version display element not found.');
    } catch (_error: unknown) {
      console.error('[App] Failed to set app version display:', _error);
    }
  }

  public isAppWebcamRunning(): boolean {
    return this.appStatusManager?.isWebcamRunning() ?? false;
  }
  public isAppModelLoaded(): boolean {
    return this.appStatusManager?.isModelLoaded() ?? false;
  }

  public setupLifecycleListeners(): void {
    document.addEventListener('visibilitychange', this._handleVisibilityChange);
    window.addEventListener('pagehide', this._handlePageHide);
    pubsub.subscribe(ALL_EVENTS.UI.REQUEST_VIDEO_REPARENT, (p?: unknown) =>
      this.#handleVideoReparentRequest(
        p as { placeholderElement?: HTMLElement; release?: boolean }
      )
    );
    const hot = import.meta.hot;
    if (hot)
      hot.dispose(() => {
        document.removeEventListener(
          'visibilitychange',
          this._handleVisibilityChange
        );
        window.removeEventListener('pagehide', this._handlePageHide);
      });
  }

  private _handleVisibilityChange = (): void => {
    if (!this.webcam) return;
    if (document.visibilityState === 'hidden' && this.isAppWebcamRunning()) {
      this.webcam
        .stop()
        .catch((e) =>
          console.error('[App] Error stopping stream on visibility change:', e)
        );
    } else if (
      document.visibilityState === 'visible' &&
      webSocketService &&
      !webSocketService.isConnected()
    ) {
      webSocketService.forceReconnect();
    }
  };

  private _handlePageHide = (): void => {
    if (this.webcam && this.isAppWebcamRunning())
      this.webcam
        .stop()
        .catch((e) =>
          console.error('[App] Error stopping stream on page hide:', e)
        );
  };

  #handleVideoReparentRequest = (payload?: {
    placeholderElement?: HTMLElement;
    release?: boolean;
  }): void => {
    const videoContainerElement = this.elements.videoContainer as HTMLElement;
    if (!videoContainerElement) return;

    if (payload?.release) {
      if (this.#videoOriginalParent) {
        this.#videoOriginalParent.insertBefore(
          videoContainerElement,
          this.#videoOriginalNextSibling
        );
      } else {
        console.error(
          '[App] Cannot release video container: Original parent not stored.'
        );
      }
    } else if (payload?.placeholderElement) {
      this.#videoOriginalParent = videoContainerElement.parentElement;
      this.#videoOriginalNextSibling = videoContainerElement.nextSibling;
      payload.placeholderElement.appendChild(videoContainerElement);
    }
  };

  public async _startStreamWithSource(
    targetDeviceId: string | null | undefined
  ): Promise<void> {
    if (!this.webcam || !this.ui?._cameraSourceManager) {
      pubsub.publish(ALL_EVENTS.UI.SHOW_ERROR, {
        message: 'Cannot start stream (core missing).',
      });
      return;
    }

    const safeTargetId = targetDeviceId || '';
    pubsub.publish(ALL_EVENTS.CAMERA_SOURCE.REQUESTING_STREAM_START, safeTargetId);

    if (!this.appStatusManager?.isModelLoaded()) {
      pubsub.publish(ALL_EVENTS.UI.SHOW_ERROR, { messageKey: 'modelLoading' });
      pubsub.publish(ALL_EVENTS.UI.REQUEST_BUTTON_STATE_UPDATE);
      return;
    }
    let rtspConfig: RtspSourceConfig | undefined | null = null;
    if (safeTargetId.startsWith('rtsp:')) {
      const normalizedName = normalizeNameForMtx(safeTargetId.substring(5));
      const rtspSources = this.appStore.getState().rtspSources || [];
      rtspConfig =
        rtspSources.find(
          (s: RtspSourceConfig) => normalizeNameForMtx(s.name) === normalizedName
        ) || null;
      if (!rtspConfig) {
        pubsub.publish(ALL_EVENTS.UI.SHOW_ERROR, {
          message: `Config not found for ${normalizedName}`,
        });
        pubsub.publish(ALL_EVENTS.UI.REQUEST_BUTTON_STATE_UPDATE);
        return;
      }
    }
    try {
      if (this.appStatusManager.isWebcamRunning()) {
        await this.webcam.stop(false);
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      await this.webcam.start(safeTargetId, rtspConfig);
    } catch (e) {
      console.error(
        `[App] Error during startStream for source '${safeTargetId}':`,
        e
      );
      this.ui._cameraSourceManager?.clearSelectedSource();
      pubsub.publish(ALL_EVENTS.UI.REQUEST_BUTTON_STATE_UPDATE);
    }
  }

  private _startFrameUpdates = (): void => {
    this._cancelFrameUpdates();
    const frameLoop = (): void => {
      if (!this.webcam?.isStreaming()) {
        this._cancelFrameUpdates();
        return;
      }

      if (this.webcam?._videoElement) {
        this.gesture?.processFrame({
          videoElement: this.webcam._videoElement,
          roiConfig: this.gesture?._state.lastPublishedRoiConfig || null,
          timestamp: performance.now(),
        });
      }
      this.#frameAnalysisHandlerId = requestAnimationFrame(frameLoop);
    };
    this.#frameAnalysisHandlerId = requestAnimationFrame(frameLoop);
  };

  private _cancelFrameUpdates = (): void => {
    if (this.#frameAnalysisHandlerId) {
      cancelAnimationFrame(this.#frameAnalysisHandlerId);
    }
    this.#frameAnalysisHandlerId = null;
  };
}