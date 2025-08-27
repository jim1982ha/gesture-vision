/* FILE: packages/frontend/src/camera/manager.ts */
import type { App } from "#frontend/core/app.js";
import type { AppStore } from "#frontend/core/state/app-store.js";
import type { GestureProcessor } from "#frontend/gestures/processor.js";
import {
  CAMERA_SOURCE_EVENTS,
  UI_EVENTS,
  WEBCAM_EVENTS,
} from "#shared/constants/index.js";
import { pubsub } from "#shared/core/pubsub.js";
import { secureStorage } from "#shared/services/security-utils.js";
import type {
  RoiConfig,
  RtspSourceConfig,
} from "#shared/types/index.js";
import {
  DEFAULT_TARGET_FPS,
  DEFAULT_PROCESSING_WIDTH,
  STORAGE_KEY_MIRROR_STATE_PER_SOURCE,
  STORAGE_KEY_LAST_WEBCAM_ID,
  MOBILE_WEBCAM_PLACEHOLDER_ID,
  DEFAULT_WEBCAM_FACING_MODE,
  STORAGE_KEY_SELECTED_CAMERA_SOURCE,
} from "#frontend/constants/app-defaults.js";

import { CanvasRenderer } from "#frontend/camera/canvas-renderer.js";
import {
  checkPermissionsAndEnumerate,
  publishDeviceList,
} from "./logic/permission-helpers.js";
import {
  startRtspStream,
  startWebcamStream,
} from "#frontend/camera/logic/stream-helpers.js";
import { WebcamError } from "./webcam-error.js";
import { CameraSourceManager } from "./source-manager.js";

interface PerformanceStats {
  frameRate: number;
  resolution: { width: number; height: number };
  loadTime: number;
}

let streamPromiseAbortController: AbortController | null = null;

export class WebcamManager {
  _videoElement: HTMLVideoElement | null = null;
  _outputCanvasElement: HTMLCanvasElement | null = null;
  _stream: MediaStream | null = null;
  _currentDeviceId: string | null = "";
  _performanceStats: PerformanceStats = {
    frameRate: 0,
    resolution: { width: 0, height: 0 },
    loadTime: 0,
  };
  _isRTSPStreamActive = false;
  _rtspConnectorInstance:
    | import("#frontend/camera/rtsp/connector.js").RtspConnector
    | null = null;
  _activeOnDemandSource: string | null = null;
  _appStore: AppStore;
  _gestureProcessorRef: GestureProcessor | null = null;
  _appRef: App | null = null; // Reference to the main App
  _targetFrameIntervalMs = 1000 / DEFAULT_TARGET_FPS;
  _canvasRendererRef: CanvasRenderer | null = null;
  #mirrorStateMap = new Map<string, boolean>();
  #currentFacingMode: "user" | "environment" = DEFAULT_WEBCAM_FACING_MODE;
  #cameraSourceManager: CameraSourceManager;
  #unsubscribeStore: () => void;

  constructor(
    videoElement: HTMLVideoElement,
    outputCanvasElement: HTMLCanvasElement,
    appStore: AppStore,
    gestureProcessorRef: GestureProcessor | null,
    updateRoiConfigCallback: (
      sourceId: string | null,
      roiConfig: RoiConfig
    ) => void
  ) {
    if (!videoElement || !(videoElement instanceof HTMLVideoElement))
      throw new Error("WebcamManager requires a valid HTMLVideoElement.");
    if (
      !outputCanvasElement ||
      !(outputCanvasElement instanceof HTMLCanvasElement)
    )
      throw new Error(
        "WebcamManager requires a valid HTMLCanvasElement for output."
      );
    if (!appStore) console.warn("[WM] AppStore ref missing.");
    if (!gestureProcessorRef) console.warn("[WM] GestureProcessor ref missing.");

    this._appStore = appStore;
    this._gestureProcessorRef = gestureProcessorRef;
    this._videoElement = videoElement;
    this._outputCanvasElement = outputCanvasElement;

    if (this._videoElement) {
      this._videoElement.classList.add("video-placeholder-active");
      this._videoElement
        .closest(".video-container")
        ?.classList.remove("video-active");
    }

    this._loadMirrorState();
    this._loadDeviceIdPreference();
    const initialFpsPref =
      this._appStore.getState().targetFpsPreference || DEFAULT_TARGET_FPS;
    this._targetFrameIntervalMs = 1000 / initialFpsPref;

    if (this._outputCanvasElement && this._videoElement) {
      this._canvasRendererRef = new CanvasRenderer(
        {
          outputCanvas: this._outputCanvasElement,
          videoElement: this._videoElement,
        },
        this._appStore,
        updateRoiConfigCallback
      );
    } else {
      console.error(
        "[WM] Failed to create CanvasRenderer due to missing elements or AppStore."
      );
    }

    this.#cameraSourceManager = new CameraSourceManager(this._appStore);
    this._attachEventListeners();
    this.#unsubscribeStore = this._appStore.subscribe(
      (state) => {
        const newFps = state.targetFpsPreference || DEFAULT_TARGET_FPS;
        this._targetFrameIntervalMs = 1000 / newFps;
      }
    );
  }

  public setAppRef(app: App): void {
    this._appRef = app;
  }

  public async initialize(): Promise<void> {
    try {
      const devices = await checkPermissionsAndEnumerate(this);
      publishDeviceList(this, devices);
    } catch (error: unknown) {
      console.error("[WM] Initialization failed:", error);
      this._handleError(error as Error);
      publishDeviceList(this, []);
    }
  }

  public isStreaming(): boolean {
    return !!this._stream;
  }

  public canFlipCamera(): boolean {
    const supportedConstraints =
      navigator.mediaDevices.getSupportedConstraints();
    return !!supportedConstraints.facingMode;
  }

  public async flipCamera(): Promise<void> {
    if (!this.canFlipCamera() || !this._appRef) return;
    this.#currentFacingMode =
      this.#currentFacingMode === "user" ? "environment" : "user";
    this._switchDevice(MOBILE_WEBCAM_PLACEHOLDER_ID);
    await this._appRef._startStreamWithSource(MOBILE_WEBCAM_PLACEHOLDER_ID);
  }

  private _loadMirrorState = (): void => {
    try {
      const stored = secureStorage.get(
        STORAGE_KEY_MIRROR_STATE_PER_SOURCE
      ) as Record<string, boolean> | null;
      if (stored && typeof stored === "object" && !Array.isArray(stored)) {
        this.#mirrorStateMap = new Map(Object.entries(stored));
      }
    } catch (e) {
      console.error("[WM] Failed to load mirror state preferences:", e);
      this.#mirrorStateMap = new Map<string, boolean>();
    }
  };

  private _saveMirrorState = (): void => {
    secureStorage.set(
      STORAGE_KEY_MIRROR_STATE_PER_SOURCE,
      Object.fromEntries(this.#mirrorStateMap)
    );
  };

  public isMirrored(): boolean {
    const deviceId = this._currentDeviceId || "";
    const isRtsp = deviceId.startsWith("rtsp:");
    const storedState = this.#mirrorStateMap.get(deviceId);
    return storedState === undefined ? !isRtsp : storedState;
  }

  public toggleMirroringForCurrentStream = (): void => {
    const deviceId = this._currentDeviceId;
    if (!deviceId || !this._canvasRendererRef) return;
    const currentState = this.isMirrored();
    const newState = !currentState;
    this.#mirrorStateMap.set(deviceId, newState);
    this._saveMirrorState();
    this._canvasRendererRef.setMirroring(newState);
    this._canvasRendererRef.drawOutput();
    pubsub.publish(UI_EVENTS.REQUEST_BUTTON_STATE_UPDATE);
  };

  public getCanvasRenderer(): CanvasRenderer | null {
    return this._canvasRendererRef;
  }
  public getCameraSourceManager(): CameraSourceManager {
    return this.#cameraSourceManager;
  }

  public async start(
    targetDeviceId: string,
    selectedSourceConfig: RtspSourceConfig | null = null
  ): Promise<void> {
    if (streamPromiseAbortController) {
      streamPromiseAbortController.abort("New stream start initiated");
    }
    streamPromiseAbortController = new AbortController();
    const signal = streamPromiseAbortController.signal;

    this._currentDeviceId = targetDeviceId || "";
    const isRtsp = this._currentDeviceId.startsWith("rtsp:");

    if (this._stream) await this.stop(false);

    const startTime = performance.now();
    this._isRTSPStreamActive = isRtsp;
    this._activeOnDemandSource = null;

    const preferredMirrorState = this.isMirrored();
    this._canvasRendererRef?.setMirroring(preferredMirrorState);

    pubsub.publish(UI_EVENTS.SHOW_NOTIFICATION, {
      messageKey: "connecting",
      type: "info",
      duration: 10000,
    });

    try {
      if (signal.aborted) throw new DOMException(String(signal.reason), "AbortError");

      this._videoElement
        ?.closest(".video-container")
        ?.classList.add("video-active");
      this._videoElement?.classList.remove("video-placeholder-active");

      if (isRtsp) {
        await startRtspStream(
          this,
          this._currentDeviceId,
          selectedSourceConfig,
          signal
        );
      } else {
        await startWebcamStream(this, signal);
      }

      if (!this._stream)
        throw new WebcamError(
          "STREAM_ACQUISITION_FAILED",
          "Failed to acquire stream but no specific error was thrown."
        );

      this._performanceStats.loadTime = performance.now() - startTime;
      streamPromiseAbortController = null;
      const deviceName = selectedSourceConfig?.name || "Webcam";
      pubsub.publish(UI_EVENTS.SHOW_NOTIFICATION, {
        messageKey: "streamConnected",
        substitutions: { name: deviceName },
        type: "success",
        duration: 3000,
      });
    } catch (error: unknown) {
      streamPromiseAbortController = null;
      const typedError = error as Error;
      if (typedError.name === "AbortError") {
        if (typedError.message !== "New stream start initiated") {
          await this.stop(false);
        }
        this._publishEvent(WEBCAM_EVENTS.STREAM_CONNECTION_CANCELLED);
        return;
      }
      const specificError = this._mapToHAError(typedError);
      this._handleError(specificError);
      await this.stop();
      throw specificError;
    }
  }

  public async stop(publishStopEvent = true): Promise<void> {
    const wasStreamActive = !!this._stream;
    this._publishEvent(WEBCAM_EVENTS.STREAM_STOP, {
      initiatedBy: "WebcamManager.stop",
    });
    this._rtspConnectorInstance?.disconnect();
    if (this._stream) this._stream.getTracks().forEach((track) => track.stop());
    if (this._videoElement) {
      this._videoElement.onloadedmetadata = null;
      this._videoElement.onplaying = null;
      this._videoElement.onerror = null;
      this._videoElement.pause();
      this._videoElement.srcObject = null;
      this._videoElement.src = "";
      this._videoElement.load();
      this._videoElement.classList.add("video-placeholder-active");
      this._videoElement
        .closest(".video-container")
        ?.classList.remove("video-active");
    }
    this._stream = null;
    this._activeOnDemandSource = null;
    this._rtspConnectorInstance = null;
    this._isRTSPStreamActive = false;
    this.#resetPerformanceStats();
    if (wasStreamActive && publishStopEvent)
      pubsub.publish(UI_EVENTS.SHOW_NOTIFICATION, {
        messageKey: "streamStopped",
        type: "info",
        duration: 2000,
      });
  }

  public async cancelStreamConnection(): Promise<void> {
    if (streamPromiseAbortController)
      streamPromiseAbortController.abort("User cancelled connection process.");
    streamPromiseAbortController = null;
    this._rtspConnectorInstance?.abort();
    await this.stop(false);
    this._publishEvent(WEBCAM_EVENTS.STREAM_CONNECTION_CANCELLED);
  }

  public destroy(): void {
    this.stop(false);
    this.#unsubscribeStore();
    window.removeEventListener("resize", this._handleWindowResize);
    this._canvasRendererRef?.destroy();
  }

  private _attachEventListeners() {
    pubsub.subscribe(CAMERA_SOURCE_EVENTS.CHANGED, (id?: unknown) =>
      this._switchDevice(id as string | undefined)
    );
    window.addEventListener("resize", this._handleWindowResize);
  }

  private _handleWindowResize = (): void =>
    this._canvasRendererRef?.handleResize();

  public _handleError = (error: WebcamError | { code?: string; message?: string }): void => {
    const webcamError = this._mapToHAError(error);
    pubsub.publish(WEBCAM_EVENTS.ERROR, {
      code: webcamError.code,
      message: webcamError.message,
      retryPossible: this._isRetryPossible(webcamError.code),
    });
  };

  public _publishEvent = (event: string, data: unknown = null): void =>
    pubsub.publish(event, data);

  private _loadDeviceIdPreference = (): void => {
    this._currentDeviceId =
      (secureStorage.get(STORAGE_KEY_LAST_WEBCAM_ID) as string | null) ||
      (secureStorage.get(STORAGE_KEY_SELECTED_CAMERA_SOURCE) as string | null) ||
      "";
    if (!this._currentDeviceId) {
      const isMobile = window.matchMedia("(any-pointer: coarse)").matches;
      this._currentDeviceId = isMobile ? MOBILE_WEBCAM_PLACEHOLDER_ID : "";
    }
  };
  public _switchDevice = (deviceId: string | null | undefined): void => {
    const newId = deviceId ?? "";
    if (this._currentDeviceId !== newId) {
      this._currentDeviceId = newId;
      secureStorage.set(STORAGE_KEY_SELECTED_CAMERA_SOURCE, newId);
    }
  };
  #resetPerformanceStats = (): void => {
    this._performanceStats = {
      frameRate: 0,
      resolution: { width: 0, height: 0 },
      loadTime: 0,
    };
  };

  public _mapToHAError = (
    error: Error | { code?: string; message?: string }
  ): WebcamError => {
    if (error instanceof WebcamError) return error;
    let code = "UNKNOWN";
    let message = "An unknown webcam error occurred.";
    if (error instanceof DOMException) {
      message = `Camera error: ${error.name} - ${error.message}`;
      switch (error.name) {
        case "NotAllowedError":
        case "PermissionDeniedError":
          code = "PERMISSION_DENIED";
          message = "Camera access denied.";
          break;
        case "NotFoundError":
        case "DevicesNotFoundError":
          code = "DEVICE_NOT_FOUND";
          message = "Selected camera not found.";
          break;
        case "NotReadableError":
        case "TrackStartError":
          code = "DEVICE_IN_USE";
          message = "Camera in use or hardware issue.";
          break;
        case "OverconstrainedError":
        case "ConstraintNotSatisfiedError":
          code = "CONSTRAINTS_NOT_SATISFIED";
          message = `Camera does not support requested settings.`;
          break;
        case "TypeError":
          code = "INVALID_CONSTRAINTS";
          message = `Invalid settings requested.`;
          break;
        case "AbortError":
          code = "OPERATION_ABORTED";
          message = `Camera operation aborted.`;
          break;
        default:
          code = "DOM_EXCEPTION";
      }
    } else if (error instanceof Error) {
      const anyError = error as Error & { code?: string };
      code = anyError.code || "GENERIC_ERROR";
      message = error.message || `An error occurred: ${code}`;
    }
    return new WebcamError(code, message);
  };

  public _isRetryPossible = (errorCode: string): boolean =>
    ![
      "WEBCAM_PERMISSION_DENIED",
      "WEBCAM_GETUSERMEDIA_NOT_SUPPORTED",
      "WEBCAM_PERMISSION_REVOKED",
      "WEBCAM_RTSP_CONFIG_NOT_FOUND",
      "WEBCAM_RTSP_BACKEND_CONNECT_FAILED",
      "WEBCAM_INVALID_CONSTRAINTS",
    ].includes(errorCode);

  public _buildConstraints = (): MediaStreamConstraints => {
    const state = this._appStore.getState();
    const preferredWidth =
      state.processingResolutionWidthPreference || DEFAULT_PROCESSING_WIDTH;
    const preferredFps = state.targetFpsPreference || DEFAULT_TARGET_FPS;
    const constraints: MediaStreamConstraints = { audio: false, video: {} };
    if (typeof constraints.video === "boolean") constraints.video = {};
    (constraints.video as MediaTrackConstraints).width = { ideal: preferredWidth };
    (constraints.video as MediaTrackConstraints).frameRate = { ideal: preferredFps };

    const isMobile = window.matchMedia("(any-pointer: coarse)").matches;
    const isMobileWebcamPlaceholder =
      this._currentDeviceId === MOBILE_WEBCAM_PLACEHOLDER_ID;

    if (
      this._currentDeviceId &&
      !this._currentDeviceId.startsWith("rtsp:") &&
      !isMobileWebcamPlaceholder
    ) {
      (constraints.video as MediaTrackConstraints).deviceId = {
        exact: this._currentDeviceId,
      };
    } else if (isMobile && this.canFlipCamera()) {
      (constraints.video as MediaTrackConstraints).facingMode = {
        exact: this.#currentFacingMode,
      };
    }

    return constraints;
  };

  async #waitForVideoToPlay(
    videoElement: HTMLVideoElement,
    signal: AbortSignal
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const playingHandler = () => {
        cleanup();
        resolve();
      };
      const errorHandler = (e: Event | Error) => {
        if (e instanceof Error) {
          cleanup();
          reject(e);
          return;
        }
        const videoElementFromEvent = e.target as HTMLVideoElement;
        const mediaError = videoElementFromEvent?.error;
        if (mediaError) {
          cleanup();
          const msg =
            mediaError.message || `Video element error code: ${mediaError.code}`;
          reject(new WebcamError("VIDEO_ELEMENT_ERROR", `Video error: ${msg}`));
        } else {
          console.warn(
            "[WebcamManager] A non-fatal video 'error' event was ignored.",
            e
          );
        }
      };
      const abortHandler = () => {
        cleanup();
        reject(new DOMException("Stream start aborted.", "AbortError"));
      };
      const timeoutHandler = () => {
        cleanup();
        reject(
          new WebcamError(
            "VIDEO_PLAY_TIMEOUT",
            "Timeout waiting for video to play."
          )
        );
      };
      const cleanup = () => {
        videoElement.removeEventListener("playing", playingHandler);
        videoElement.removeEventListener("error", errorHandler as EventListener);
        signal.removeEventListener("abort", abortHandler);
        clearTimeout(timeoutId);
      };

      const timeoutId = setTimeout(timeoutHandler, 10000);

      videoElement.addEventListener("playing", playingHandler, { once: true });
      videoElement.addEventListener("error", errorHandler as EventListener);
      signal.addEventListener("abort", abortHandler, { once: true });

      videoElement.play().catch(errorHandler);
    });
  }

  public _handleStreamStartCommon = async (
    rtspSourceConfig: RtspSourceConfig | null = null
  ): Promise<void> => {
    const videoEl = this._videoElement;
    if (!this._stream || !videoEl) {
      await this.stop();
      return;
    }

    videoEl.srcObject = this._stream;
    videoEl.setAttribute("playsinline", "");
    videoEl.muted = true;

    try {
      await this.#waitForVideoToPlay(videoEl, streamPromiseAbortController!.signal);

      this._performanceStats.resolution = {
        width: videoEl.videoWidth || 0,
        height: videoEl.videoHeight || 0,
      };

      const actualTrack = this._stream.getVideoTracks()[0];
      if (actualTrack) {
        const deviceIdFromTrack = actualTrack.getSettings().deviceId;
        if (deviceIdFromTrack && !this._isRTSPStreamActive) {
          this._currentDeviceId = deviceIdFromTrack;
          secureStorage.set(STORAGE_KEY_LAST_WEBCAM_ID, this._currentDeviceId);
        }
      }

      const roiForProcessing = rtspSourceConfig?.roi || null;
      this._gestureProcessorRef?.setActiveStreamRoi(roiForProcessing);
      this._canvasRendererRef?.updateSourceInfo(
        this._currentDeviceId,
        roiForProcessing
      );

      this._publishEvent(WEBCAM_EVENTS.STREAM_START, {
        deviceId: this._currentDeviceId,
      });
    } catch (error: unknown) {
      console.error(
        "[WebcamManager] Error during stream start common handler:",
        error
      );
      throw error;
    }
  };
}
