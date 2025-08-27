/* FILE: packages/frontend/src/camera/rtsp/connector.ts */
// Manages the WebRTC connection to MediaMTX using WHEP (WebRTC-HTTP Egress Protocol).
import { WebcamError } from "../webcam-error.js";

/**
 * Manages the WebRTC connection to MediaMTX using WHEP.
 */
export class RtspConnector {
  _peerConnection: RTCPeerConnection | null = null;
  _stream: MediaStream | null = null;
  _connectionAttempts = 0;
  _maxConnectionAttempts = 3;
  #trackTimeoutTimer: number | null = null;
  #abortController: AbortController | null = null; 

  constructor() {
  }

  async connect(pathName: string): Promise<MediaStream> {

    if (!pathName) {
      throw new WebcamError("RTSP_CONNECTOR_CONFIG", "Path name is missing.");
    }
    this._connectionAttempts = 0;
    this.#abortController = new AbortController();

    // The backend now handles the API call, so we just proceed to connect.
    return this._attemptConnection(pathName);
  }

  abort(): void {
    if (this.#abortController) {
      this.#abortController.abort("User cancelled connection");
    }
    this.disconnect(); 
  }

  _attemptConnection(originalPathName: string): Promise<MediaStream> {
    this._connectionAttempts++;
    const pathForUrl = originalPathName;
    this.#clearTrackTimeout();

    return new Promise<MediaStream>((resolve, reject) => {
      (async () => {
        if (this.#abortController?.signal.aborted) {
          reject(new DOMException("Connection aborted by user.", "AbortError"));
          return;
        }

        try {
          this._peerConnection = new RTCPeerConnection();
          const signal = this.#abortController?.signal;

          this._peerConnection.oniceconnectionstatechange = () => {
            if (this._peerConnection?.iceConnectionState === "failed") {
              console.error("[RTSP] ICE connection failed.");
            }
          };
          this._peerConnection.onconnectionstatechange = () => {};

          const streamPromise = new Promise<MediaStream>((streamResolve, streamReject) => {
            if (!this._peerConnection) { 
                streamReject(new Error("PeerConnection is null during track event setup."));
                return;
            }
            this._peerConnection.ontrack = (event: RTCTrackEvent) => { 
              this.#clearTrackTimeout();
              if (
                event.track.kind === "video" &&
                event.streams &&
                event.streams[0]
              ) {
                if (!this._stream) { 
                  this._stream = event.streams[0];
                  streamResolve(this._stream);
                }
              }
            };
            this.#trackTimeoutTimer = window.setTimeout(() => { 
              if (!this._stream) { 
                console.error(`[RTSP] Timeout waiting for track for path: ${pathForUrl}.`);
                streamReject(
                  new WebcamError("RTSP_TRACK_TIMEOUT", `Timeout waiting for video track for path ${pathForUrl}.`)
                );
              }
            }, 18000); 
          });

          this._peerConnection.addTransceiver("video", { direction: "recvonly" });

          const offer = await this._peerConnection.createOffer();
          await this._peerConnection.setLocalDescription(offer);
          
          const metaEnv = import.meta.env;
          const isProdLike = metaEnv.MODE === 'production' || metaEnv.MODE === 'apk';
          let fullWhepUrl: string;

          if (isProdLike) {
            const whepBase = window.runtimeConfig?.WHEP_BASE_URL || metaEnv.VITE_PROD_WHEP_BASE_URL || '';
            const whepPath = `/${pathForUrl.replace(/^\//, "")}/whep`;
            fullWhepUrl = `${whepBase.replace(/\/$/, "")}${whepPath}`;
          } else {
            fullWhepUrl = `/whep-proxy/${pathForUrl.replace(/^\//, "")}/whep`;
          }
          
          const sdpOffer = this._peerConnection.localDescription!.sdp; 
          const headers: Record<string, string> = { "Content-Type": "application/sdp" };
          
          const response = await fetch(fullWhepUrl, {
            method: "POST", headers, body: sdpOffer, signal: signal, 
          });

          if (!response.ok) {
            const errorText = await response.text().catch(() => `Status ${response.status}`);
            console.error(`[RTSP] WHEP Fail Body: ${errorText}`);
            throw new WebcamError("RTSP_WHEP_REQUEST_FAILED", `WHEP request failed for path '${pathForUrl}': ${response.status}. ${errorText}`);
          }

          const answerSdp = await response.text();
          if (!answerSdp) {
            throw new WebcamError("RTSP_WHEP_NO_ANSWER", `Empty SDP answer for path '${pathForUrl}'.`);
          }
          if (this.#abortController?.signal.aborted) {
            throw new DOMException("Connection aborted by user after WHEP response.", "AbortError");
          }
          await this._peerConnection.setRemoteDescription({ type: "answer", sdp: answerSdp });

          const receivedStream = await streamPromise;
          resolve(receivedStream);
        } catch (error: unknown) {
          const typedError = error as Error;
          this.#clearTrackTimeout();
          this.disconnect(); 

          if (typedError.name === "AbortError") {
            reject(typedError); 
            return;
          }

          if (this._connectionAttempts < this._maxConnectionAttempts) {
            window.setTimeout(() => { 
              if (this.#abortController?.signal.aborted) {
                reject(new DOMException("Connection aborted by user during retry.", "AbortError"));
                return;
              }
              this._attemptConnection(originalPathName).then(resolve).catch(reject);
            }, 1000 * this._connectionAttempts);
          } else {
            const webError = typedError instanceof WebcamError ? typedError : new WebcamError("RTSP_CONNECTION_FAILED", `Failed to connect to path '${pathForUrl}' (Original: ${originalPathName}) after ${this._maxConnectionAttempts} attempts: ${typedError.message}`);
            reject(webError);
          }
        }
      })();
    });
  }

  #clearTrackTimeout(): void {
    if (this.#trackTimeoutTimer) {
      clearTimeout(this.#trackTimeoutTimer);
      this.#trackTimeoutTimer = null;
    }
  }

  disconnect(): void {
    this.#clearTrackTimeout();
    if (this._peerConnection) {
      this._peerConnection.onicecandidate = null;
      this._peerConnection.ontrack = null;
      this._peerConnection.oniceconnectionstatechange = null;
      this._peerConnection.onconnectionstatechange = null;
      try {
        this._peerConnection.close();
      } catch (_e) { /* Ignored */ }
      this._peerConnection = null;
    }
    if (this._stream) {
      this._stream.getTracks().forEach((track) => track.stop());
    }
    this._stream = null;
  }
}