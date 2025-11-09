/* FILE: packages/frontend/src/camera/source-manager.ts */
// Manages available camera sources (webcams, RTSP streams) and user selection.
import type { AppStore } from '#frontend/core/state/app-store.js';
import { STORAGE_KEY_SELECTED_CAMERA_SOURCE } from '#frontend/constants/index.js';
import {
  CAMERA_SOURCE_EVENTS, UI_EVENTS, PERMISSION_EVENTS, normalizeNameForMtx,
} from '#shared/index.js';
import { pubsub } from '#shared/core/pubsub.js';
import { secureStorage } from '#shared/services/security-utils.js';
import type { RtspSourceConfig } from '#shared/index.js';
import type { TranslationService } from '#frontend/services/translation.service.js';

interface DeviceInfo {
  id: string;
  label: string;
}

const ENUMERATE_TIMEOUT_MS = 5000;
const GUM_LABEL_PROMPT_TIMEOUT_MS = 8000;

export class CameraSourceManager {
  #selectedCameraSource = '';
  #appStore: AppStore;
  #translationService: TranslationService;
  #combinedDeviceMap = new Map<string, string>();
  #lastWebcamDevices: DeviceInfo[] = [];
  #rtspSourcesCache: RtspSourceConfig[] = [];
  #isMobile = false;
  #unsubscribeStore: () => void;

  constructor(appStore: AppStore, translationService: TranslationService) {
    this.#appStore = appStore;
    this.#translationService = translationService;
    this.#isMobile = window.matchMedia('(any-pointer: coarse)').matches;
    this.#loadState();
    this.#rtspSourcesCache = this.#appStore.getState().rtspSources || [];

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
      const devices = await this.#checkPermissionsAndEnumerate();
      const webcamDevices = devices
        .filter((d) => d?.kind === 'videoinput')
        .map((d, index) => {
            let finalLabel = d.label || this.#translationService.translate('Camera', { defaultValue: `Camera ${index + 1}` });
            finalLabel = finalLabel.replace(/\s\([\s\S]*?\)$/, '');
            return { id: d.deviceId, label: finalLabel };
        });

      this.#lastWebcamDevices = webcamDevices;
      this.#rebuildAndValidate();
    } catch (error) {
      console.error('[SourceMgr] Device enumeration failed:', error);
      this.#lastWebcamDevices = [];
      this.#rebuildAndValidate();
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

  #rebuildAndValidate = (): void => {
    const webcamMap = this.#createWebcamDeviceMap(this.#lastWebcamDevices, this.#isMobile);
    const rtspMap = this.#createRtspDeviceMap(this.#rtspSourcesCache);
    this.#combinedDeviceMap = new Map([...webcamMap, ...rtspMap]);

    if (this.#selectedCameraSource && !this.#combinedDeviceMap.has(this.#selectedCameraSource)) {
      this.#selectedCameraSource = '';
      secureStorage.set(STORAGE_KEY_SELECTED_CAMERA_SOURCE, '');
    }
    pubsub.publish(CAMERA_SOURCE_EVENTS.MAP_UPDATED, new Map(this.#combinedDeviceMap));
  };

  public setSelectedCameraSource(deviceId: string | null | undefined): void {
    const newSource = deviceId?.trim() ?? '';
    this.#selectedCameraSource = newSource;
    secureStorage.set(STORAGE_KEY_SELECTED_CAMERA_SOURCE, newSource);
  }

  public triggerInitialStreamIfNeeded(): void {
    const streamIsActive = this.#appStore.getState().isWebcamRunning;
    if (this.#selectedCameraSource && !streamIsActive) {
      pubsub.publish(CAMERA_SOURCE_EVENTS.CHANGED, this.#selectedCameraSource);
    }
  }
  
  async #checkPermissionsAndEnumerate(): Promise<MediaDeviceInfo[]> {
    let permissionState: PermissionState = 'prompt';
    try {
      if (navigator.permissions?.query) {
        const status = await navigator.permissions.query({ name: 'camera' as PermissionName });
        permissionState = status.state;
        status.onchange = () => pubsub.publish(PERMISSION_EVENTS.CAMERA_CHANGED, status.state);
      }
      if (permissionState === 'prompt') {
        const timeoutPromise = new Promise<never>((_, reject) => setTimeout(() => reject(new Error('getUserMedia prompt timeout')), GUM_LABEL_PROMPT_TIMEOUT_MS));
        const stream = await Promise.race([navigator.mediaDevices.getUserMedia({ video: true }), timeoutPromise]);
        stream.getTracks().forEach((track) => track.stop());
        permissionState = 'granted';
        pubsub.publish(PERMISSION_EVENTS.CAMERA_CHANGED, permissionState);
      }
      const enumeratePromise = navigator.mediaDevices.enumerateDevices();
      const enumerateTimeout = new Promise<MediaDeviceInfo[]>((_, reject) => setTimeout(() => reject(new Error('Enumeration Timeout')), ENUMERATE_TIMEOUT_MS));
      return await Promise.race([enumeratePromise, enumerateTimeout]);
    } catch (e: unknown) {
      if ((e as Error).name === 'NotAllowedError') pubsub.publish(PERMISSION_EVENTS.CAMERA_CHANGED, 'denied');
      else console.error('[PermissionHelper]', e);
      return [];
    }
  }

  #createRtspDeviceMap(rtspSourcesCache: RtspSourceConfig[] | undefined): Map<string, string> {
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
  
  #createWebcamDeviceMap(devices: DeviceInfo[], isMobile: boolean): Map<string, string> {
    const webcamMap = new Map<string, string>();
    const validWebcams = Array.isArray(devices) ? devices.filter(d => d?.id && typeof d.id === 'string' && d.id.length > 0) : [];
  
    if (isMobile && validWebcams.length > 0) {
      webcamMap.set("webcam:mobile_default", this.#translationService.translate("Webcam", { defaultValue: "Webcam" }));
    } else {
      validWebcams.forEach((d) => {
        webcamMap.set(d.id, d.label);
      });
    }
    return webcamMap;
  }

  public getSelectedCameraSource = (): string => this.#selectedCameraSource;
  public getCombinedDeviceMap = (): Map<string, string> => new Map(this.#combinedDeviceMap);
  public destroy(): void { this.#unsubscribeStore(); }
}