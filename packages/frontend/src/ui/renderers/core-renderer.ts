/* FILE: packages/frontend/src/ui/renderers/core-renderer.ts */
// Renders the list of gesture configuration cards.
import {
  GESTURE_EVENTS, WEBCAM_EVENTS, CAMERA_SOURCE_EVENTS, UI_EVENTS, pubsub,
  normalizeNameForMtx
} from '#shared/index.js';
import type { RoiConfig, RtspSourceConfig } from '#shared/index.js';
import type { HistoryEntry, LandmarkVisibilityOverridePayload } from '#frontend/types/index.js';
import type { UIController } from '#frontend/ui/ui-controller-core.js';
import type { CanvasRenderer } from '#frontend/camera/canvas-renderer.js';

import { updateStatusDisplay, updateProgressRings } from './feedback-renderer.js';
import { updateCameraListUI } from './camera-list-renderer.js';
import { renderConfigList } from './config-list-renderer.js';
import { renderHistoryList } from './history-list-renderer.js';

interface RendererElements {
  configListDiv: HTMLElement | null;
  gestureHistoryDiv: HTMLElement | null;
  cameraList: HTMLElement | null;
  cameraListPlaceholder: HTMLElement | null;
  gestureProgressCircle: SVGCircleElement | null;
  cooldownProgressCircle: SVGCircleElement | null;
  currentGestureSpan: HTMLElement | null;
  confidenceBar: HTMLElement | null;
  holdTimeMetric: HTMLElement | null;
  holdTimeDisplay: HTMLElement | null;
  progressRingsOverlay: HTMLElement | null;
  gestureFeedbackOverlay: HTMLElement | null;
}

interface GestureStatusData {
  gesture: string; gestureText: string; realtimeConfidence: number;
  configuredThreshold: number | null; isCooldownActive?: boolean;
}
interface GestureProgressData {
  holdPercent: number; cooldownPercent: number; currentHoldMs?: number;
  requiredHoldMs?: number; remainingCooldownMs?: number;
}
interface StreamStartData { deviceId?: string | null; }

export class CoreRenderer {
  _elements: Partial<RendererElements> = {};
  _uiControllerRef: UIController;
  _canvasRenderer: CanvasRenderer | null = null;
  _isReady = false;

  _lastStatusUpdateTime = 0;
  _lastProgressUpdateTime = 0;
  _lastStatusGestureName: string | null = null;
  _lastRingsVisible = false;
  readonly _STATUS_UPDATE_INTERVAL_MS = 100;
  readonly _PROGRESS_UPDATE_INTERVAL_MS = 50;

  constructor(uiControllerRef: UIController) {
    this._uiControllerRef = uiControllerRef;
    this._queryElements();
  }

  public destroy(): void {}

  private _queryElements(): void {
    this._elements = {
        configListDiv: document.getElementById("configList"),
        gestureHistoryDiv: document.getElementById("gestureHistory"),
        cameraList: document.getElementById("cameraList"),
        cameraListPlaceholder: document.getElementById("cameraListPlaceholder"),
        gestureProgressCircle: document.querySelector<SVGCircleElement>(".gesture-progress"),
        cooldownProgressCircle: document.querySelector<SVGCircleElement>(".cooldown-progress"),
        currentGestureSpan: document.getElementById("currentGestureSpan"),
        confidenceBar: document.getElementById("confidenceBar"),
        holdTimeMetric: document.getElementById("holdTimeMetric"),
        holdTimeDisplay: document.getElementById("holdTimeDisplay"),
        progressRingsOverlay: document.getElementById("progress-rings-overlay"),
        gestureFeedbackOverlay: document.getElementById("gesture-feedback-overlay"),
    };
  }

  public initializePubSubEventListeners(): void {
    if (this._isReady) return;

    const createReadyHandler =
      <T>(handlerFn: (data: T) => void) =>
      (dataUnknown?: unknown) => {
        if (!this._uiControllerRef || !this._isReady) return;
        try { handlerFn(dataUnknown as T); } 
        catch (e: unknown) { console.error(`[UIRenderer Event ERR]`, e, dataUnknown); }
      };
    
    pubsub.subscribe(GESTURE_EVENTS.UPDATE_STATUS, createReadyHandler<GestureStatusData>(this.#handleStatusUpdate));
    pubsub.subscribe(GESTURE_EVENTS.UPDATE_PROGRESS, createReadyHandler<GestureProgressData>(this.#handleProgressUpdate));
    pubsub.subscribe(GESTURE_EVENTS.REQUEST_LANDMARK_VISIBILITY_OVERRIDE, createReadyHandler<LandmarkVisibilityOverridePayload>(p => this._canvasRenderer?.setLandmarkVisibilityOverride(p)));
    pubsub.subscribe(GESTURE_EVENTS.CLEAR_LANDMARK_VISIBILITY_OVERRIDE, createReadyHandler<void>(() => this._canvasRenderer?.clearLandmarkVisibilityOverride()));

    const handleStreamStateChange = (sourceId: string | null = null, eventType?: string) => {
      this.#updateCanvasRendererSourceInfo(sourceId);
      if (sourceId) this._uiControllerRef.updateButtonState();
      this._canvasRenderer?.drawOutput();
      if (sourceId === null || eventType === WEBCAM_EVENTS.STREAM_STOP || eventType === WEBCAM_EVENTS.ERROR) {
        updateStatusDisplay(this._elements, {});
        updateProgressRings(this._elements, { holdPercent: 0, cooldownPercent: 0 });
        this._lastRingsVisible = false; this._lastStatusGestureName = null;
      }
    };
    
    pubsub.subscribe(CAMERA_SOURCE_EVENTS.CHANGED, createReadyHandler<string|null|undefined>(id => handleStreamStateChange(id ?? null)));
    pubsub.subscribe(WEBCAM_EVENTS.STREAM_START, createReadyHandler<StreamStartData>(d => handleStreamStateChange(d?.deviceId ?? null, WEBCAM_EVENTS.STREAM_START)));
    pubsub.subscribe(WEBCAM_EVENTS.STREAM_STOP, createReadyHandler<void>(() => handleStreamStateChange(null, WEBCAM_EVENTS.STREAM_STOP)));
    pubsub.subscribe(WEBCAM_EVENTS.ERROR, createReadyHandler<void>(() => handleStreamStateChange(null, WEBCAM_EVENTS.ERROR)));
    pubsub.subscribe(CAMERA_SOURCE_EVENTS.MAP_UPDATED, createReadyHandler<Map<string, string>|undefined>(d => this.updateCameraListUI(d)));
    pubsub.subscribe(UI_EVENTS.REQUEST_SELECTED_CAMERA_DISPLAY_UPDATE, createReadyHandler<void>(() => this._uiControllerRef.updateButtonState()));
    pubsub.subscribe(UI_EVENTS.MODAL_OPENED_CAMERA_SELECT, createReadyHandler<void>(() => pubsub.publish(UI_EVENTS.REQUEST_CAMERA_LIST_RENDER)));

    this._isReady = true;
  }

  #handleStatusUpdate = (status: GestureStatusData): void => {
    const now = performance.now();
    const newGestureName = status?.gesture || '-';
    if (newGestureName !== this._lastStatusGestureName || now - this._lastStatusUpdateTime > this._STATUS_UPDATE_INTERVAL_MS) {
      updateStatusDisplay(this._elements, status || {}, this._uiControllerRef.appStore, this._uiControllerRef.translationService);
      this._lastStatusUpdateTime = now; this._lastStatusGestureName = newGestureName;
    }
  }

  #handleProgressUpdate = (progress: GestureProgressData): void => {
    const now = performance.now();
    const ringsShouldBeVisible = (progress?.holdPercent ?? 0) > 0 || (progress?.cooldownPercent ?? 0) > 0;
    if (ringsShouldBeVisible !== this._lastRingsVisible || now - this._lastProgressUpdateTime > this._PROGRESS_UPDATE_INTERVAL_MS) {
      updateProgressRings(this._elements, progress);
      this._lastProgressUpdateTime = now; this._lastRingsVisible = ringsShouldBeVisible;
    }
  }

  public async applyTranslations(): Promise<void> {
    await this.renderConfigList();
    await this.renderHistoryList();
    this.updateCameraListUI();
  }

  public setCanvasRenderer = (renderer: CanvasRenderer | null) => { this._canvasRenderer = renderer; }
  public renderConfigList = async (): Promise<void> => { if (this._elements.configListDiv) await renderConfigList(this._elements.configListDiv, this._uiControllerRef.appStore, this._uiControllerRef.pluginUIService, this._uiControllerRef); }
  public renderHistoryList = async (historyItems?: HistoryEntry[]): Promise<void> => { await renderHistoryList(this._elements.gestureHistoryDiv!, historyItems, this._uiControllerRef.pluginUIService, this._uiControllerRef.appStore, this._uiControllerRef.translationService.translate); }
  public updateCameraListUI = (deviceMap?: Map<string, string>): void => {
    const mapToUse = deviceMap instanceof Map ? deviceMap : this._uiControllerRef?.cameraService?.getCameraManager()?.getCameraSourceManager()?.getCombinedDeviceMap() || new Map<string, string>();
    updateCameraListUI({ cameraList: this._elements.cameraList ?? null, cameraListPlaceholder: this._elements.cameraListPlaceholder ?? null }, mapToUse, this._uiControllerRef);
  };
  
  #updateCanvasRendererSourceInfo = (sourceId: string | null): void => {
    let roi: RoiConfig | null = null;
    const isRtsp = !!sourceId?.startsWith('rtsp:');
    const appState = this._uiControllerRef?.appStore.getState();
    if (isRtsp && appState && sourceId) {
      const normName = normalizeNameForMtx(sourceId.substring(5));
      const sources = appState.rtspSources;
      const config = sources.find((s: RtspSourceConfig) => normalizeNameForMtx(s.name) === normName);
      if (config?.roi && !(config.roi.x === 0 && config.roi.y === 0 && config.roi.width === 100 && config.roi.height === 100)) {
        roi = config.roi;
      }
    }
    this._canvasRenderer?.updateSourceInfo(sourceId, roi);
  };
}