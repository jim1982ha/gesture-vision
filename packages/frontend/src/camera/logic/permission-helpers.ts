/* FILE: packages/frontend/src/camera/logic/permission-helpers.ts */
import { PERMISSION_EVENTS, WEBCAM_EVENTS } from "#shared/constants/index.js";
import { pubsub } from "#shared/core/pubsub.js";
import { translate } from "#shared/services/translations.js";

import type { WebcamManager } from "#frontend/camera/manager.js";

const ENUMERATE_TIMEOUT_MS = 5000;
const GUM_LABEL_PROMPT_TIMEOUT_MS = 8000;

/**
 * Checks for camera permissions and enumerates available video devices.
 * If permission is not granted, it will prompt the user.
 * @param managerInstance The instance of WebcamManager to access its state and methods.
 * @returns A promise that resolves with an array of MediaDeviceInfo objects.
 */
export async function checkPermissionsAndEnumerate(managerInstance: WebcamManager): Promise<MediaDeviceInfo[]> {
  let permissionState: PermissionState = "prompt";
  try {
    if (navigator.permissions?.query) {
      const status = await navigator.permissions.query({ name: "camera" as PermissionName });
      permissionState = status.state;
      status.onchange = () => pubsub.publish(PERMISSION_EVENTS.CAMERA_CHANGED, status.state);
    }
    if (permissionState === "prompt") {
      const timeoutPromise = new Promise<never>((_, reject) => setTimeout(() => reject(new Error("getUserMedia prompt timeout")), GUM_LABEL_PROMPT_TIMEOUT_MS));
      const stream = await Promise.race([navigator.mediaDevices.getUserMedia({ video: true }), timeoutPromise]);
      stream.getTracks().forEach(track => track.stop());
      permissionState = "granted";
      pubsub.publish(PERMISSION_EVENTS.CAMERA_CHANGED, permissionState);
    }
    const enumeratePromise = navigator.mediaDevices.enumerateDevices();
    const enumerateTimeout = new Promise<MediaDeviceInfo[]>((_, reject) => setTimeout(() => reject(new Error("Enumeration Timeout")), ENUMERATE_TIMEOUT_MS));
    return await Promise.race([enumeratePromise, enumerateTimeout]);
  } catch (e: unknown) {
    if ((e as Error).name === "NotAllowedError") pubsub.publish(PERMISSION_EVENTS.CAMERA_CHANGED, "denied");
    else managerInstance._handleError(e as Error);
    return [];
  }
}

/**
 * Publishes the list of available video devices to the rest of the application.
 * @param managerInstance The instance of WebcamManager to access its state.
 * @param devices An array of MediaDeviceInfo objects.
 */
export function publishDeviceList(managerInstance: WebcamManager, devices: MediaDeviceInfo[]): void {
  const videoDevices = devices.filter((d) => d?.kind === "videoinput");
  const activeDeviceId = managerInstance._currentDeviceId;
  const hasCameraAccess = videoDevices.some((d) => d?.label && d.label !== "");
  const deviceListPayload = {
    devices: videoDevices.map((d, index) => {
      let finalLabel = d.label || translate("Camera", { defaultValue: `Camera ${index + 1}` });
      finalLabel = finalLabel.replace(/\s\([\s\S]*?\)$/, '');
      return {
        id: d.deviceId,
        label: finalLabel,
        active: d.deviceId === activeDeviceId,
      };
    }),
    hasSpecificDevices: videoDevices.length > 0,
    hasCameraAccess: hasCameraAccess,
  };
  managerInstance._publishEvent(WEBCAM_EVENTS.DEVICE_UPDATE, deviceListPayload);
}
