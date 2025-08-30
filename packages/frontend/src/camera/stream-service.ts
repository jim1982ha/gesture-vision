/* FILE: packages/frontend/src/camera/stream-service.ts */
import { WEBSOCKET_EVENTS } from '#shared/index.js';
import { webSocketService } from '#frontend/services/websocket-service.js';
import { MOBILE_WEBCAM_PLACEHOLDER_ID } from '#frontend/constants/app-defaults.js';
import { RtspConnector } from './rtsp/connector.js';
import { WebcamError } from './webcam-error.js';
import type { CameraManager } from './camera-manager.js';
import type { RtspSourceConfig } from '#shared/index.js';

let streamPromiseAbortController: AbortController | null = null;

export class CameraStreamService {
  #cameraManagerRef: CameraManager;
  #rtspConnectorInstance: RtspConnector | null = null;
  #activeOnDemandSource: string | null = null;

  constructor(cameraManager: CameraManager) {
    this.#cameraManagerRef = cameraManager;
  }

  public async acquireStream(
    targetDeviceId: string,
    selectedSourceConfig: RtspSourceConfig | null,
    facingMode: 'user' | 'environment'
  ): Promise<MediaStream> {
    if (streamPromiseAbortController) {
      streamPromiseAbortController.abort('New stream start initiated');
    }
    streamPromiseAbortController = new AbortController();
    const signal = streamPromiseAbortController.signal;

    try {
      if (signal.aborted)
        throw new DOMException('Aborted before start', 'AbortError');

      const isRtsp = targetDeviceId.startsWith('rtsp:');
      const stream = isRtsp
        ? await this.#startRtspStream(targetDeviceId, selectedSourceConfig, signal)
        : await this.#startWebcamStream(targetDeviceId, facingMode, signal);

      if (!stream) {
        throw new WebcamError(
          'STREAM_ACQUISITION_FAILED',
          'Failed to acquire stream, but no specific error was thrown.'
        );
      }
      streamPromiseAbortController = null;
      return stream;
    } catch (error) {
      streamPromiseAbortController = null;
      if ((error as Error).name === 'AbortError') {
        if ((error as Error).message !== 'New stream start initiated') {
          await this.#cameraManagerRef.stop(false);
        }
      }
      throw error;
    }
  }

  public stopStream(): void {
    if (streamPromiseAbortController) {
      streamPromiseAbortController.abort('Stream stop initiated');
      streamPromiseAbortController = null;
    }
    this.#rtspConnectorInstance?.disconnect();
    this.#rtspConnectorInstance = null;
    if (this.#activeOnDemandSource) {
      webSocketService.sendMessage({
        type: WEBSOCKET_EVENTS.RTSP_DISCONNECT_REQUEST,
        payload: { pathName: this.#activeOnDemandSource },
      });
      this.#activeOnDemandSource = null;
    }
  }

  async #startWebcamStream(
    targetDeviceId: string,
    facingMode: 'user' | 'environment',
    _signal: AbortSignal
  ): Promise<MediaStream> {
    const constraints = this.#buildConstraints(targetDeviceId, facingMode);
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new WebcamError(
        'GETUSERMEDIA_NOT_SUPPORTED',
        'getUserMedia API not supported.'
      );
    }

    try {
      return await navigator.mediaDevices.getUserMedia(constraints);
    } catch (error) {
      console.error('Error getting user media:', error);
      throw error;
    }
  }

  async #startRtspStream(
    targetDeviceId: string,
    selectedSourceConfig: RtspSourceConfig | null,
    signal: AbortSignal
  ): Promise<MediaStream> {
    const normalizedPathName = targetDeviceId.substring(5);
    if (!selectedSourceConfig) {
      throw new WebcamError(
        'RTSP_CONFIG_NOT_FOUND',
        `Config for RTSP source ID '${targetDeviceId}' not found.`
      );
    }

    if (selectedSourceConfig.sourceOnDemand) {
      webSocketService.sendMessage({
        type: WEBSOCKET_EVENTS.RTSP_CONNECT_REQUEST,
        payload: {
          pathName: normalizedPathName,
          url: selectedSourceConfig.url,
        },
      });
      this.#activeOnDemandSource = normalizedPathName;
    }

    this.#rtspConnectorInstance = new RtspConnector();
    signal.addEventListener('abort', () => this.#rtspConnectorInstance?.abort());
    return this.#rtspConnectorInstance.connect(normalizedPathName);
  }

  #buildConstraints(
    targetDeviceId: string,
    facingMode: 'user' | 'environment'
  ): MediaStreamConstraints {
    const { processingResolutionWidthPreference, targetFpsPreference } =
      this.#cameraManagerRef.getAppStore().getState();
    const constraints: MediaStreamConstraints = {
      audio: false,
      video: {
        width: { ideal: processingResolutionWidthPreference },
        frameRate: { ideal: targetFpsPreference },
      },
    };
    if (targetDeviceId && targetDeviceId !== MOBILE_WEBCAM_PLACEHOLDER_ID) {
      (constraints.video as MediaTrackConstraints).deviceId = {
        exact: targetDeviceId,
      };
    } else if (
      targetDeviceId === MOBILE_WEBCAM_PLACEHOLDER_ID &&
      this.#cameraManagerRef.canFlipCamera()
    ) {
      (constraints.video as MediaTrackConstraints).facingMode = {
        exact: facingMode,
      };
    }
    return constraints;
  }
}