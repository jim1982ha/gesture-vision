/* FILE: packages/frontend/src/camera/logic/stream-helpers.ts */
import { WEBSOCKET_EVENTS } from '#shared/constants/index.js';
import { webSocketService } from '#frontend/services/websocket-service.js';

import { RtspConnector } from "../rtsp/connector.js";
import { WebcamError } from "../webcam-error.js";

import type { WebcamManager } from "../manager.js";
import type { RtspSourceConfig } from '#shared/types/index.js';

/**
 * Starts a webcam stream using the specified device ID.
 * @param managerInstance The instance of WebcamManager.
 * @param signal An AbortSignal to cancel the operation.
 */
export async function startWebcamStream(managerInstance: WebcamManager, signal: AbortSignal): Promise<void> {
  const currentConstraints = managerInstance._buildConstraints();
  if (!navigator.mediaDevices?.getUserMedia) throw new WebcamError("GETUSERMEDIA_NOT_SUPPORTED", "getUserMedia API not supported.");

  let stream: MediaStream | null = null;
  try {
    if (signal.aborted) throw new DOMException(String(signal.reason), "AbortError");
    stream = await navigator.mediaDevices.getUserMedia(currentConstraints);
  } catch (getUserMediaError: unknown) {
    const typedError = getUserMediaError as Error;
    if (typedError.name === "AbortError") throw typedError;
    if (typedError.name !== "NotAllowedError" && (currentConstraints.video as MediaTrackConstraints)?.deviceId) {
      console.warn("[WM] Specific device failed. Retrying with default...");
      const defaultConstraints = managerInstance._buildConstraints();
      if (signal.aborted) throw new DOMException(String(signal.reason), "AbortError");
      stream = await navigator.mediaDevices.getUserMedia(defaultConstraints);
      managerInstance._switchDevice("");
    } else throw typedError;
  }
  if (!stream) throw new WebcamError("STREAM_NULL", "getUserMedia resolved but stream is null.");
  managerInstance._stream = stream;
  await managerInstance._handleStreamStartCommon();
}

/**
 * Starts an RTSP stream by connecting via the RtspConnector.
 * @param managerInstance The instance of WebcamManager.
 * @param targetDeviceId The full RTSP device ID (e.g., 'rtsp:living_room').
 * @param selectedSourceConfig The configuration for the selected RTSP source.
 * @param signal An AbortSignal to cancel the operation.
 */
export async function startRtspStream(managerInstance: WebcamManager, targetDeviceId: string, selectedSourceConfig: RtspSourceConfig | null, signal: AbortSignal): Promise<void> {
  const normalizedPathName = targetDeviceId.substring(5);
  if (!normalizedPathName) throw new WebcamError("RTSP_INVALID_ID", `Invalid RTSP ID: ${targetDeviceId}`);
  if (!selectedSourceConfig) throw new WebcamError("RTSP_CONFIG_NOT_FOUND", `Config for RTSP source ID '${targetDeviceId}' not found.`);

  try {
    if (signal.aborted) throw new DOMException(String(signal.reason), "AbortError");
    webSocketService.sendMessage({ type: WEBSOCKET_EVENTS.RTSP_CONNECT_REQUEST, payload: { pathName: normalizedPathName, url: selectedSourceConfig.url } });
    managerInstance._activeOnDemandSource = selectedSourceConfig.sourceOnDemand ? normalizedPathName : null;
  } catch (e: unknown) {
    const typedError = e as Error;
    if (typedError.name === "AbortError") throw typedError;
    const errorMessage = typedError.message || String(e);
    const err = new WebcamError("RTSP_WEBSOCKET_FAILED", `Failed to send RTSP connect request for '${selectedSourceConfig.name}': ${errorMessage}`);
    managerInstance._handleError(err);
    throw err;
  }
  
  if (signal.aborted) throw new DOMException(String(signal.reason), "AbortError");

  managerInstance._rtspConnectorInstance = new RtspConnector();
  if (signal.aborted) { managerInstance._rtspConnectorInstance.disconnect(); throw new DOMException(String(signal.reason), "AbortError"); }
  managerInstance._stream = await managerInstance._rtspConnectorInstance.connect(normalizedPathName);
  await managerInstance._handleStreamStartCommon(selectedSourceConfig);
}
