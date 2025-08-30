/* FILE: packages/frontend/src/ui/ui-renderer-core.ts */
// Orchestrates UI updates based on application state changes.
import type { CanvasRenderer } from '#frontend/camera/canvas-renderer.js';
import {
  updateStatusDisplay,
  updateProgressRings,
  showGestureAlert,
} from './renderers/feedback-renderer.js';
import {
  GESTURE_EVENTS,
  WEBCAM_EVENTS,
  CAMERA_SOURCE_EVENTS,
  UI_EVENTS,
  pubsub,
  normalizeNameForMtx,
} from '#shared/index.js';
import type { RoiConfig, RtspSourceConfig } from '#shared/index.js';
import type { HistoryEntry } from '#frontend/types/index.js';
import type { UIController } from './ui-controller-core.js';

export interface RendererElements {
  outputCanvas: HTMLCanvasElement | null;
  videoElement: HTMLVideoElement | null;
  configListDiv: HTMLElement | null;
  gestureHistoryDiv: HTMLElement | null;
  cameraList: HTMLElement | null;
  cameraListPlaceholder: HTMLElement | null;
  themeList: HTMLElement | null;
  cameraSelectButtonMobile: HTMLButtonElement | null;
  gestureProgressCircle: SVGCircleElement | null;
  cooldownProgressCircle: SVGCircleElement | null;
  currentGestureSpan: HTMLElement | null;
  currentConfidenceSpan: HTMLElement | null;
  confidenceBar: HTMLElement | null;
  holdTimeDisplay: HTMLElement | null;
  holdTimeMetric: HTMLElement | null;
  progressTimersContainer: HTMLElement | null;
  topCenterStatus: HTMLElement | null;
  gestureAlertDiv: HTMLElement | null;
  gestureAlertTextSpan: HTMLElement | null;
  gestureSettingsTitle: HTMLElement | null;
  historyTitle: HTMLElement | null;
  cameraModalTitleText: HTMLElement | null;
  settingsModalTitle: HTMLElement | null;
  rtspSourceListContainer: HTMLElement | null;
  rtspListPlaceholder: HTMLElement | null;
  inactiveConfigListDiv: HTMLElement | null;
}

interface GestureStatusData {
  gesture: string;
  confidence: string;
  realtimeConfidence: number;
  configuredThreshold: number | null;
  isCooldownActive?: boolean;
}
interface GestureProgressData {
  holdPercent: number;
  cooldownPercent: number;
  currentHoldMs?: number;
  requiredHoldMs?: number;
  remainingCooldownMs?: number;
}
interface GestureAlertData {
  gesture: string;
  actionType: string;
}
interface StreamStartData {
  deviceId?: string | null;
}
interface LandmarkVisibilityOverridePayload {
  hand: boolean;
  pose: boolean;
  numHands: number;
}

export class UIRenderer {
  _elements: Partial<RendererElements> = {};
  _uiControllerRef: UIController;
  _canvasRenderer: CanvasRenderer | null = null;
  _isReady = false;
  _lastStatusUpdateTime = 0;
  _lastProgressUpdateTime = 0;
  readonly _STATUS_UPDATE_INTERVAL_MS = 100;
  readonly _PROGRESS_UPDATE_INTERVAL_MS = 50;

  constructor(uiControllerRef: UIController) {
    this._uiControllerRef = uiControllerRef;
  }

  public updateElements(elements: Partial<RendererElements>): void {
    this._elements = elements;
  }

  public initializePubSubEventListeners(): void {
    if (this._isReady) return;

    const createReadyHandler =
      <T>(handlerFn: (data: T) => void) =>
      (dataUnknown?: unknown) => {
        if (!this._uiControllerRef || !this._isReady) return;
        try {
          handlerFn(dataUnknown as T);
        } catch (e: unknown) {
          console.error(`[UIRenderer Event ERR]`, e, dataUnknown);
        }
      };

    pubsub.subscribe(
      GESTURE_EVENTS.UPDATE_STATUS,
      createReadyHandler<GestureStatusData>((status) => {
        const now = performance.now();
        if (
          !status ||
          status.gesture === '-' ||
          now - this._lastStatusUpdateTime > this._STATUS_UPDATE_INTERVAL_MS
        ) {
          updateStatusDisplay(this._elements, status || ({} as GestureStatusData));
          this._lastStatusUpdateTime = now;
        }
      })
    );
    pubsub.subscribe(
      GESTURE_EVENTS.UPDATE_PROGRESS,
      createReadyHandler<GestureProgressData>((progress) => {
        const now = performance.now();
        if (
          !progress ||
          (progress.holdPercent === 0 && progress.cooldownPercent === 0) ||
          now - this._lastProgressUpdateTime > this._PROGRESS_UPDATE_INTERVAL_MS
        ) {
          updateProgressRings(this._elements, progress);
          this._lastProgressUpdateTime = now;
        }
      })
    );
    pubsub.subscribe(
      GESTURE_EVENTS.DETECTED_ALERT,
      createReadyHandler<GestureAlertData>((d) =>
        showGestureAlert(this._elements, d, this._uiControllerRef?.pluginUIService)
      )
    );
    pubsub.subscribe(
      GESTURE_EVENTS.REQUEST_LANDMARK_VISIBILITY_OVERRIDE,
      createReadyHandler<LandmarkVisibilityOverridePayload>((payload) =>
        this._canvasRenderer?.setLandmarkVisibilityOverride(payload)
      )
    );
    pubsub.subscribe(
      GESTURE_EVENTS.CLEAR_LANDMARK_VISIBILITY_OVERRIDE,
      createReadyHandler<void>(() =>
        this._canvasRenderer?.clearLandmarkVisibilityOverride()
      )
    );

    const handleStreamStateChange = (
      sourceId: string | null = null,
      eventType?: string
    ) => {
      this.#updateCanvasRendererSourceInfo(sourceId);
      if (sourceId) this._uiControllerRef.updateButtonState();
      
      this._canvasRenderer?.drawOutput();

      if (
        sourceId === null ||
        eventType === WEBCAM_EVENTS.STREAM_STOP ||
        eventType === WEBCAM_EVENTS.ERROR
      ) {
        updateStatusDisplay(this._elements, {} as GestureStatusData);
        updateProgressRings(this._elements, {
          holdPercent: 0,
          cooldownPercent: 0,
        });
        if (this._elements.progressTimersContainer)
          this._elements.progressTimersContainer.style.display = 'none';
      }
    };
    pubsub.subscribe(
      CAMERA_SOURCE_EVENTS.CHANGED,
      createReadyHandler<string | null | undefined>((id) =>
        handleStreamStateChange(id ?? null)
      )
    );
    pubsub.subscribe(
      WEBCAM_EVENTS.STREAM_START,
      createReadyHandler<StreamStartData>((d) =>
        handleStreamStateChange(d?.deviceId ?? null, WEBCAM_EVENTS.STREAM_START)
      )
    );
    pubsub.subscribe(
      WEBCAM_EVENTS.STREAM_STOP,
      createReadyHandler<void>(() =>
        handleStreamStateChange(null, WEBCAM_EVENTS.STREAM_STOP)
      )
    );
    pubsub.subscribe(
      WEBCAM_EVENTS.ERROR,
      createReadyHandler<void>(() => handleStreamStateChange(null, WEBCAM_EVENTS.ERROR))
    );
    pubsub.subscribe(
      CAMERA_SOURCE_EVENTS.MAP_UPDATED,
      createReadyHandler<Map<string, string> | undefined>((d) =>
        this.updateCameraListUI(d)
      )
    );
    pubsub.subscribe(
      UI_EVENTS.REQUEST_SELECTED_CAMERA_DISPLAY_UPDATE,
      createReadyHandler<void>(() => this._uiControllerRef.updateButtonState())
    );
    pubsub.subscribe(
      UI_EVENTS.MODAL_OPENED_CAMERA_SELECT,
      createReadyHandler<void>(() =>
        pubsub.publish(UI_EVENTS.REQUEST_CAMERA_LIST_RENDER)
      )
    );

    this._isReady = true;
  }

  public async applyTranslations(): Promise<void> {
    const { updateTranslationsForComponent } = await import(
      './ui-translation-updater.js'
    );
    updateTranslationsForComponent([
      { element: this._elements.gestureSettingsTitle, config: 'gestureSettings' },
      { element: this._elements.historyTitle, config: 'history' },
      {
        element: this._elements.cameraModalTitleText,
        config: 'selectCameraSource',
      },
    ]);
    await this.renderConfigList();
    await this.renderHistoryList();
    this.updateCameraListUI();
  }

  public setCanvasRenderer(renderer: CanvasRenderer | null): void {
    this._canvasRenderer = renderer;
  }
  public async renderConfigList(): Promise<void> {
    const { renderConfigList } = await import('./renderers/config-list-renderer.js');
    await renderConfigList(
      this._elements,
      this._uiControllerRef.appStore?.getState().gestureConfigs,
      this._uiControllerRef.appStore,
      this._uiControllerRef.pluginUIService,
      this._uiControllerRef
    );
  }

  public async renderHistoryList(historyItems?: HistoryEntry[]): Promise<void> {
    const { renderHistoryList } = await import('./renderers/history-list-renderer.js');
    await renderHistoryList(
      this._elements.gestureHistoryDiv!,
      historyItems,
      this._uiControllerRef.pluginUIService,
      this._uiControllerRef.appStore
    );
  }

  public updateCameraListUI(deviceMap?: Map<string, string>): void {
    import('./renderers/camera-list-renderer.js').then(
      ({ updateCameraListUI }) => {
        const mapToUse =
          deviceMap instanceof Map
            ? deviceMap
            : this._uiControllerRef?.cameraService?.getCameraManager()?.getCameraSourceManager()?.getCombinedDeviceMap() ||
              new Map<string, string>();
        updateCameraListUI(
          {
            cameraList: this._elements.cameraList as HTMLElement | null,
            cameraListPlaceholder:
              this._elements.cameraListPlaceholder as HTMLElement | null,
          },
          mapToUse,
          this._uiControllerRef
        );
      }
    );
  }

  #updateCanvasRendererSourceInfo = (sourceId: string | null): void => {
    let roi: RoiConfig | null = null;
    const isRtsp = !!sourceId?.startsWith('rtsp:');
    const appState = this._uiControllerRef?.appStore.getState();
    if (isRtsp && appState && sourceId) {
      const normName = normalizeNameForMtx(sourceId.substring(5));
      const sources = appState.rtspSources;
      const config = sources.find(
        (s: RtspSourceConfig) => normalizeNameForMtx(s.name) === normName
      );
      if (
        config?.roi &&
        !(
          config.roi.x === 0 &&
          config.roi.y === 0 &&
          config.roi.width === 100 &&
          config.roi.height === 100
        )
      ) {
        roi = config.roi;
      }
    }
    this._canvasRenderer?.updateSourceInfo(sourceId, roi);
  };
}