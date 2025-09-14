/* FILE: packages/frontend/src/camera/source-manager.ts */
// Manages available camera sources (webcams, RTSP streams) and user selection.
import type { AppStore } from '#frontend/core/state/app-store.js';
import { STORAGE_KEY_SELECTED_CAMERA_SOURCE } from '#frontend/constants/app-defaults.js';
import {
  CAMERA_SOURCE_EVENTS,
  UI_EVENTS,
  WEBCAM_EVENTS,
  PERMISSION_EVENTS,
  normalizeNameForMtx,
} from '#shared/index.js';
import { pubsub } from '#shared/core/pubsub.js';
import { secureStorage } from '#shared/services/security-utils.js';
import {
  checkPermissionsAndEnumerate,
  publishDeviceList,
} from './logic/permission-helpers.js';
import type { CameraManager } from '#frontend/camera/camera-manager.js';
import type { RtspSourceConfig } from '#shared/index.js';
import type { TranslationService } from '#frontend/services/translation.service.js';

interface DeviceInfo {
  id: string;
  label: string;
}

type CameraClickPayload = string | { deviceId: string; isFlip: boolean };

/**
 * Creates a map of RTSP sources from the application configuration.
 * @param rtspSourcesCache - The array of RTSP source configurations.
 * @returns A Map where the key is the generated device ID (e.g., 'rtsp:living_room') and the value is the display name.
 */
function createRtspDeviceMap(rtspSourcesCache: RtspSourceConfig[] | undefined): Map<string, string> {
    const rtspMap = new Map<string, string>();
    (rtspSourcesCache || []).forEach((rtspSrc) => {
      if (rtspSrc?.name) {
        const normalizedName = normalizeNameForMtx(rtspSrc.name);
        const rtspDeviceId = `rtsp:${normalizedName}`;
        rtspMap.set(rtspDeviceId, rtspSrc.name);
      }
    });
    return rtspMap;
  }
  
/**
 * Creates a map of webcam devices from the browser's enumerated devices.
 * On mobile, it consolidates all webcams under a single "Webcam" entry.
 * @param devices - The array of MediaDeviceInfo objects.
 * @param isMobile - A boolean indicating if the device is considered mobile.
 * @returns A Map where the key is the deviceId and the value is its user-friendly label.
 */
function createWebcamDeviceMap(devices: DeviceInfo[], isMobile: boolean, translationService: TranslationService): Map<string, string> {
    const webcamMap = new Map<string, string>();
    const validWebcams = Array.isArray(devices) ? devices.filter(d => d?.id && typeof d.id === 'string' && d.id.length > 0) : [];
  
    if (isMobile && validWebcams.length > 0) {
      webcamMap.set("webcam:mobile_default", translationService.translate("Webcam", { defaultValue: "Webcam" }));
    } else {
      validWebcams.forEach((d, index) => {
        let deviceLabel = d?.label;
        if (!deviceLabel || deviceLabel.trim() === "") {
          deviceLabel = translationService.translate("Camera", {
            defaultValue: `Camera ${index + 1}`
          });
        }
        deviceLabel = deviceLabel.replace(/\s\([\s\S]*?\)$/, '');
        webcamMap.set(d.id, deviceLabel);
      });
    }
    return webcamMap;
}

export class CameraSourceManager {
  #selectedCameraSource = '';
  #appStore: AppStore;
  #translationService: TranslationService;
  #combinedDeviceMap = new Map<string, string>();
  #lastWebcamDevices: DeviceInfo[] = [];
  #rtspSourcesCache: RtspSourceConfig[] = [];
  #isMobile = false;
  #mockCameraManager: Partial<CameraManager>;
  #unsubscribeStore: () => void;

  constructor(appStore: AppStore, translationService: TranslationService) {
    this.#appStore = appStore;
    this.#translationService = translationService;
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
      publishDeviceList(this.#mockCameraManager as CameraManager, devices, this.#translationService);
    } catch (error) {
      console.error('[SourceMgr] Device enumeration failed:', error);
      publishDeviceList(this.#mockCameraManager as CameraManager, [], this.#translationService);
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
    pubsub.subscribe(UI_EVENTS.CAMERA_LIST_ITEM_CLICKED, (payload?: unknown) =>
      this.#handleCameraSourceChange(payload as CameraClickPayload | null | undefined)
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
    this.#validateAndPublishMap();
  };

  #rebuildCombinedMap = (): void => {
    const webcamMap = createWebcamDeviceMap(this.#lastWebcamDevices, this.#isMobile, this.#translationService);
    const rtspMap = createRtspDeviceMap(this.#rtspSourcesCache);
    this.#combinedDeviceMap = new Map([...webcamMap, ...rtspMap]);
  };

  #validateAndPublishMap = (): void => {
    if (this.#selectedCameraSource && !this.#combinedDeviceMap.has(this.#selectedCameraSource)) {
      this.#selectedCameraSource = '';
      secureStorage.set(STORAGE_KEY_SELECTED_CAMERA_SOURCE, '');
    }
    pubsub.publish(CAMERA_SOURCE_EVENTS.MAP_UPDATED, new Map(this.#combinedDeviceMap));
  };

  #handleCameraSourceChange = (payload: CameraClickPayload | null | undefined): void => {
      const deviceId = typeof payload === 'object' && payload !== null ? payload.deviceId : payload;
      const isFlip = typeof payload === 'object' && payload !== null ? payload.isFlip : false;
      this.#setSelectedSource(deviceId, isFlip);
  }

  #setSelectedSource(deviceId: string | null | undefined, isFlip = false): void {
    const newSource = deviceId?.trim() ?? '';
    const isStreamActive = this.#appStore.getState().isWebcamRunning;

    if (this.#selectedCameraSource === newSource && isStreamActive && !isFlip) {
        return; 
    }

    this.#selectedCameraSource = newSource;
    secureStorage.set(STORAGE_KEY_SELECTED_CAMERA_SOURCE, newSource);
    pubsub.publish(CAMERA_SOURCE_EVENTS.CHANGED, newSource);
  }

  public triggerInitialStreamIfNeeded(): void {
    const streamIsActive = this.#appStore.getState().isWebcamRunning;
    if (this.#selectedCameraSource && !streamIsActive) {
      pubsub.publish(CAMERA_SOURCE_EVENTS.CHANGED, this.#selectedCameraSource);
    }
  }

  public getSelectedCameraSource = (): string => this.#selectedCameraSource;
  public getCombinedDeviceMap = (): Map<string, string> => new Map(this.#combinedDeviceMap);
  public destroy(): void { this.#unsubscribeStore(); }
}