/* FILE: packages/frontend/src/camera/source-manager.ts */
// Manages available camera sources (webcams, RTSP streams) and user selection.
import type { AppStore } from '#frontend/core/state/app-store.js';
import { STORAGE_KEY_SELECTED_CAMERA_SOURCE } from '#frontend/constants/app-defaults.js';
import {
  CAMERA_SOURCE_EVENTS,
  UI_EVENTS,
  WEBCAM_EVENTS,
  PERMISSION_EVENTS,
} from '#shared/index.js';
import { pubsub } from '#shared/core/pubsub.js';
import { secureStorage } from '#shared/services/security-utils.js';
import {
  createRtspDeviceMap,
  createWebcamDeviceMap,
} from './logic/source-map-utils.js';
import {
  checkPermissionsAndEnumerate,
  publishDeviceList,
} from './logic/permission-helpers.js';
import type { CameraManager } from '#frontend/camera/camera-manager.js';

import type { RtspSourceConfig } from '#shared/index.js';

interface DeviceInfo {
  id: string;
  label: string;
}

export class CameraSourceManager {
  #selectedCameraSource = '';
  #appStore: AppStore;
  #combinedDeviceMap = new Map<string, string>();
  #lastWebcamDevices: DeviceInfo[] = [];
  #rtspSourcesCache: RtspSourceConfig[] = [];
  #isMobile = false;
  #mockCameraManager: Partial<CameraManager>;
  #unsubscribeStore: () => void;

  constructor(appStore: AppStore) {
    this.#appStore = appStore;
    this.#isMobile = window.matchMedia('(any-pointer: coarse)').matches;
    this.#loadState();
    this.#rtspSourcesCache = this.#appStore.getState().rtspSources || [];

    this.#mockCameraManager = {
      getCurrentDeviceId: () => this.#selectedCameraSource,
    };

    this.#attachEventListeners();
    this.#unsubscribeStore = this.#appStore.subscribe((state) =>
      this.#handleRtspSourceUpdate(state.rtspSources)
    );
  }

  public async initialize(): Promise<void> {
    await this.refreshDeviceList();
  }

  public async refreshDeviceList(): Promise<void> {
    try {
      const devices = await checkPermissionsAndEnumerate(this.#mockCameraManager as CameraManager);
      publishDeviceList(this.#mockCameraManager as CameraManager, devices);
    } catch (error) {
      console.error('[SourceMgr] Device enumeration failed:', error);
      publishDeviceList(this.#mockCameraManager as CameraManager, []);
    }
  }

  #loadState(): void {
    try {
      this.#selectedCameraSource = (secureStorage.get(STORAGE_KEY_SELECTED_CAMERA_SOURCE) as string | null) ?? '';
    } catch (e: unknown) {
      console.error('[SourceMgr loadState ERR] Error loading state:', e);
      this.#selectedCameraSource = '';
    }
  }

  #attachEventListeners(): void {
    pubsub.subscribe(UI_EVENTS.CAMERA_LIST_ITEM_CLICKED, (deviceId?: unknown) =>
      this.#handleCameraSourceChange(deviceId as string | null | undefined)
    );
    pubsub.subscribe(WEBCAM_EVENTS.DEVICE_UPDATE, (data?: unknown) =>
      this.#handleWebcamDeviceUpdate(data as { devices?: DeviceInfo[] } | undefined)
    );
    pubsub.subscribe(PERMISSION_EVENTS.CAMERA_CHANGED, () => this.refreshDeviceList());
    pubsub.subscribe(UI_EVENTS.REQUEST_CAMERA_LIST_RENDER, () =>
      pubsub.publish(
        CAMERA_SOURCE_EVENTS.MAP_UPDATED,
        new Map(this.#combinedDeviceMap)
      )
    );
  }

  #handleRtspSourceUpdate = (newSources?: RtspSourceConfig[]): void => {
    if (JSON.stringify(this.#rtspSourcesCache) !== JSON.stringify(newSources || [])) {
      this.#rtspSourcesCache = newSources || [];
      this.#rebuildAndValidate();
    }
  };

  #handleWebcamDeviceUpdate = (webcamData?: { devices?: DeviceInfo[] }): void => {
    const newDevices = webcamData?.devices || [];
    if (JSON.stringify(this.#lastWebcamDevices) !== JSON.stringify(newDevices)) {
      this.#lastWebcamDevices = Array.isArray(newDevices) ? newDevices : [];
      this.#rebuildAndValidate();
    }
  };

  #rebuildAndValidate = (): void => {
    this.#rebuildCombinedMap();
    this.#validateAndPublishMapIfNeeded();
  };

  #rebuildCombinedMap = (): void => {
    const webcamMap = createWebcamDeviceMap(this.#lastWebcamDevices, this.#isMobile);
    const rtspMap = createRtspDeviceMap(this.#rtspSourcesCache);
    this.#combinedDeviceMap = new Map([...webcamMap, ...rtspMap]);
  };

  #validateAndPublishMapIfNeeded = (): void => {
    if (this.#selectedCameraSource && !this.#combinedDeviceMap.has(this.#selectedCameraSource)) {
      this.#setSelectedSource('');
    }
    pubsub.publish(CAMERA_SOURCE_EVENTS.MAP_UPDATED, new Map(this.#combinedDeviceMap));
  };

  #handleCameraSourceChange = (deviceId: string | null | undefined): void =>
    this.#setSelectedSource(deviceId);

  #setSelectedSource(deviceId: string | null | undefined): void {
    const newSource = deviceId?.trim() ?? '';
    const isStreamActive = this.#appStore.getState().isWebcamRunning;

    if (this.#selectedCameraSource === newSource && isStreamActive) {
        console.log(`[LOG] SourceManager: Clicked same active source ('${newSource}'), ignoring restart.`);
        return; 
    }
    console.log(`[LOG] SourceManager: Selection changed to '${newSource}' or stream is inactive. Publishing CHANGED event.`);

    this.#selectedCameraSource = newSource;
    secureStorage.set(STORAGE_KEY_SELECTED_CAMERA_SOURCE, newSource);
    pubsub.publish(CAMERA_SOURCE_EVENTS.CHANGED, newSource);
  }

  public getSelectedCameraSource = (): string => this.#selectedCameraSource;
  public getCombinedDeviceMap = (): Map<string, string> => new Map(this.#combinedDeviceMap);
  public destroy(): void { this.#unsubscribeStore(); }
}