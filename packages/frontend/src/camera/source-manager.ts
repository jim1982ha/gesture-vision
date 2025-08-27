/* FILE: packages/frontend/src/camera/source-manager.ts */
// Manages available camera sources (webcams, RTSP streams) and user selection.
import type { AppStore } from "#frontend/core/state/app-store.js";
import { STORAGE_KEY_SELECTED_CAMERA_SOURCE } from "#frontend/constants/app-defaults.js";
import {
  CAMERA_SOURCE_EVENTS,
  UI_EVENTS,
  WEBCAM_EVENTS,
  PERMISSION_EVENTS,
} from "#shared/constants/index.js";
import { pubsub } from "#shared/core/pubsub.js";
import { secureStorage } from "#shared/services/security-utils.js";
import {
  createRtspDeviceMap,
  createWebcamDeviceMap,
} from "./logic/source-map-utils.js";
import {
  checkPermissionsAndEnumerate,
  publishDeviceList,
} from "./logic/permission-helpers.js";
import type { WebcamManager } from "#frontend/camera/manager.js";

import type { RtspSourceConfig } from "#shared/types/index.js";

interface DeviceInfo {
  id: string;
  label: string;
}

export class CameraSourceManager {
  #selectedCameraSource = "";
  #appStore: AppStore;
  #combinedDeviceMap = new Map<string, string>();
  #lastWebcamDevices: DeviceInfo[] = [];
  #rtspSourcesCache: RtspSourceConfig[] = [];
  #isMobile = false;
  #mockWebcamManager: Partial<WebcamManager>;
  #unsubscribeStore: () => void;

  constructor(appStore: AppStore) {
    if (!appStore)
      console.error("[CameraSourceManager CON] AppStore ref missing!");
    this.#appStore = appStore;
    this.#isMobile = window.matchMedia("(any-pointer: coarse)").matches;
    this.#loadState();
    this.#rtspSourcesCache = this.#appStore.getState().rtspSources || [];

    this.#mockWebcamManager = {
      _currentDeviceId: this.#selectedCameraSource,
      _handleError: (e: Error | { code?: string; message?: string }) =>
        console.error("[SourceMgr GUM Helper]", e),
      _publishEvent: (e: string, d: unknown) => pubsub.publish(e, d),
      _switchDevice: (_id: string | null | undefined) => {},
    };

    this.#attachEventListeners();
    this.#unsubscribeStore = this.#appStore.subscribe((state) => 
        this.#handleRtspSourceUpdate(state.rtspSources)
    );
    this.#checkPermissionsAndEnumerateWebcams().catch((e) => console.error(e));
  }

  async #checkPermissionsAndEnumerateWebcams() {
    try {
      const devices = await checkPermissionsAndEnumerate(
        this.#mockWebcamManager as WebcamManager
      );
      publishDeviceList(this.#mockWebcamManager as WebcamManager, devices);
    } catch (error) {
      console.error("[SourceMgr] Initial permission/enumeration failed:", error);
      publishDeviceList(this.#mockWebcamManager as WebcamManager, []);
    }
  }

  #loadState(): void {
    try {
      this.#selectedCameraSource =
        (secureStorage.get(STORAGE_KEY_SELECTED_CAMERA_SOURCE) as
          | string
          | null) ?? "";
    } catch (e: unknown) {
      console.error("[SourceMgr loadState ERR] Error loading state:", e);
      this.#selectedCameraSource = "";
      try {
        secureStorage.remove(STORAGE_KEY_SELECTED_CAMERA_SOURCE);
      } catch {
        /* Ignore */
      }
    }
  }

  #attachEventListeners(): void {
    pubsub.subscribe(UI_EVENTS.CAMERA_LIST_ITEM_CLICKED, (deviceIdUnknown?: unknown) =>
      this.#handleCameraSourceChange(deviceIdUnknown as string | null | undefined)
    );
    pubsub.subscribe(WEBCAM_EVENTS.DEVICE_UPDATE, (webcamDataUnknown?: unknown) =>
      this.#handleWebcamDeviceUpdate(
        webcamDataUnknown as { devices?: DeviceInfo[] } | undefined
      )
    );
    pubsub.subscribe(PERMISSION_EVENTS.CAMERA_CHANGED, this.#checkPermissionsAndEnumerateWebcams.bind(this));
    pubsub.subscribe(UI_EVENTS.REQUEST_CAMERA_LIST_RENDER, () =>
      pubsub.publish(CAMERA_SOURCE_EVENTS.MAP_UPDATED, new Map(this.#combinedDeviceMap))
    );
  }

  #handleRtspSourceUpdate = (newRtspSources?: RtspSourceConfig[]): void => {
    const changed =
      JSON.stringify(this.#rtspSourcesCache) !==
      JSON.stringify(newRtspSources || []);
    if (changed) {
      this.#rtspSourcesCache = newRtspSources || [];
      this.#rebuildAndValidate();
    }
  };

  #handleWebcamDeviceUpdate = (webcamData?: {
    devices?: DeviceInfo[];
  }): void => {
    const newDevices = webcamData?.devices || [];
    const oldDeviceSummary = JSON.stringify(this.#lastWebcamDevices);
    const newDeviceSummary = JSON.stringify(newDevices);

    if (oldDeviceSummary !== newDeviceSummary) {
      this.#lastWebcamDevices = Array.isArray(newDevices) ? newDevices : [];
      this.#rebuildAndValidate();
    }
  };

  #rebuildAndValidate = (): void => {
    this.#rebuildCombinedMap();
    this.#validateAndPublishMapIfNeeded();
  };

  #rebuildCombinedMap = (): void => {
    const webcamMap = createWebcamDeviceMap(
      this.#lastWebcamDevices,
      this.#isMobile
    );
    const rtspMap = createRtspDeviceMap(this.#rtspSourcesCache);
    this.#combinedDeviceMap = new Map([...webcamMap, ...rtspMap]);
  };

  #validateAndPublishMapIfNeeded = (): void => {
    const currentSelection = this.#selectedCameraSource;
    let selectionWasReset = false;

    if (currentSelection && !this.#combinedDeviceMap.has(currentSelection)) {
      console.warn(
        `%c[SourceMgr Validate WARN] Specific selection '${currentSelection}' is no longer valid. Resetting.`,
        "color: orange;"
      );
      this.#setSelectedSource("");
      selectionWasReset = true;
    }

    pubsub.publish(
      CAMERA_SOURCE_EVENTS.MAP_UPDATED,
      new Map(this.#combinedDeviceMap)
    );
    if (selectionWasReset)
      pubsub.publish(UI_EVENTS.REQUEST_SELECTED_CAMERA_DISPLAY_UPDATE);
  };

  #handleCameraSourceChange = (deviceId: string | null | undefined): void =>
    this.#setSelectedSource(deviceId);

  #setSelectedSource(deviceId: string | null | undefined): void {
    const newSource = deviceId?.trim() ?? "";
    if (this.#selectedCameraSource === newSource) return;

    this.#selectedCameraSource = newSource;
    this.#mockWebcamManager._currentDeviceId = newSource;
    try {
      secureStorage.set(STORAGE_KEY_SELECTED_CAMERA_SOURCE, newSource);
    } catch (e: unknown) {
      console.warn(
        `[SourceMgr setSelectedSource WARN] Failed to save preference:`,
        e
      );
    }

    pubsub.publish(CAMERA_SOURCE_EVENTS.CHANGED, newSource);
  }

  public clearSelectedSource(): void {
    this.#setSelectedSource("");
  }
  public getSelectedCameraSource(): string {
    return this.#selectedCameraSource;
  }
  public getCombinedDeviceMap(): Map<string, string> {
    return new Map(this.#combinedDeviceMap);
  }
  public getRtspSources(): RtspSourceConfig[] {
    return this.#appStore.getState().rtspSources || [];
  }
  public destroy(): void {
    this.#unsubscribeStore();
  }
}
