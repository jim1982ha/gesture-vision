/* FILE: packages/frontend/src/camera/logic/source-map-utils.ts */
import { translate } from "#shared/services/translations.js";
import { normalizeNameForMtx } from "#shared/utils/index.js";

import type { RtspSourceConfig } from "#shared/types/index.js";

interface DeviceInfo {
    id: string;
    label: string;
}

/**
 * Creates a map of RTSP sources from the application configuration.
 * @param rtspSourcesCache - The array of RTSP source configurations.
 * @returns A Map where the key is the generated device ID (e.g., 'rtsp:living_room') and the value is the display name.
 */
export function createRtspDeviceMap(rtspSourcesCache: RtspSourceConfig[] | undefined): Map<string, string> {
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
export function createWebcamDeviceMap(devices: DeviceInfo[], isMobile: boolean): Map<string, string> {
    const webcamMap = new Map<string, string>();
    const validWebcams = Array.isArray(devices) ? devices.filter(d => d?.id && typeof d.id === 'string' && d.id.length > 0) : [];
  
    if (isMobile && validWebcams.length > 0) {
      webcamMap.set("webcam:mobile_default", translate("Webcam", { defaultValue: "Webcam" }));
    } else {
      validWebcams.forEach((d, index) => {
        let deviceLabel = d?.label;
        if (!deviceLabel || deviceLabel.trim() === "") {
          deviceLabel = translate("Camera", {
            defaultValue: `Camera ${index + 1}`
          });
        }
        deviceLabel = deviceLabel.replace(/\s\([\s\S]*?\)$/, '');
        webcamMap.set(d.id, deviceLabel);
      });
    }
    return webcamMap;
}
