/* FILE: packages/frontend/src/camera/rtsp/connector.ts */
// Manages the WebRTC connection to MediaMTX using WHEP (WebRTC-HTTP Egress Protocol).
import { WebcamError } from "../webcam-error.js";

const TRACK_TIMEOUT_MS = 18000;
const MAX_CONNECTION_ATTEMPTS = 3;

/**
 * Manages the WebRTC connection to MediaMTX using WHEP.
 */
export class RtspConnector {
  _peerConnection: RTCPeerConnection | null = null;
  _stream: MediaStream | null = null;
  _connectionAttempts = 0;
  #trackTimeoutTimer: number | null = null;
  #abortController: AbortController | null = null; 

  constructor() {}

  async connect(pathName: string): Promise<MediaStream> {
    if (!pathName) {
      throw new WebcamError("RTSP_CONNECTOR_CONFIG", "Path name is missing.");
    }
    this._connectionAttempts = 0;
    this.#abortController = new AbortController();
    return this._attemptConnection(pathName);
  }

  abort(): void {
    if (this.#abortController) {
      this.#abortController.abort("User cancelled connection");
    }
    // --- MEMORY LEAK FIX: Explicit Cleanup ---
    // Ensure that calling abort also immediately triggers resource cleanup.
    this.disconnect(); 
  }

  async _attemptConnection(pathName: string): Promise<MediaStream> {
    this._connectionAttempts++;
    this.#clearTrackTimeout();
  
    if (this.#abortController?.signal.aborted) {
      throw new DOMException("Connection aborted by user.", "AbortError");
    }
  
    try {
      this._peerConnection = new RTCPeerConnection();
      const signal = this.#abortController?.signal;
  
      this._peerConnection.oniceconnectionstatechange = () => {
        if (this._peerConnection?.iceConnectionState === "failed") {
          console.error("[RTSP] ICE connection failed.");
        }
      };
  
      const streamPromise = new Promise<MediaStream>((streamResolve, streamReject) => {
        if (!this._peerConnection) {
          streamReject(new Error("PeerConnection is null during track event setup."));
          return;
        }
        
        const cleanupAndReject = (error: Error) => {
            this.#clearTrackTimeout();
            streamReject(error);
        };

        this._peerConnection.ontrack = (event: RTCTrackEvent) => {
          this.#clearTrackTimeout();
          if (event.track.kind === "video" && event.streams?.[0]) {
            if (!this._stream) {
              this._stream = event.streams[0];
              streamResolve(this._stream);
            }
          }
        };

        this.#trackTimeoutTimer = window.setTimeout(() => {
          if (!this._stream) {
            console.error(`[RTSP] Timeout waiting for track for path: ${pathName}.`);
            cleanupAndReject(new WebcamError("RTSP_TRACK_TIMEOUT", `Timeout waiting for video track.`));
          }
        }, TRACK_TIMEOUT_MS);
      });
  
      this._peerConnection.addTransceiver("video", { direction: "recvonly" });
      const offer = await this._peerConnection.createOffer();
      await this._peerConnection.setLocalDescription(offer);
      
      const metaEnv = import.meta.env;
      const isProdLike = metaEnv.MODE === 'production' || metaEnv.MODE === 'apk';
      const whepBase = isProdLike ? (window.runtimeConfig?.WHEP_BASE_URL || metaEnv.VITE_PROD_WHEP_BASE_URL || '') : '/whep-proxy';
      const fullWhepUrl = `${whepBase.replace(/\/$/, "")}/${pathName.replace(/^\//, "")}/whep`;
      
      const response = await fetch(fullWhepUrl, {
        method: "POST",
        headers: { "Content-Type": "application/sdp" },
        body: this._peerConnection.localDescription!.sdp,
        signal,
      });
  
      if (!response.ok) {
        const errorText = await response.text().catch(() => `Status ${response.status}`);
        throw new WebcamError("RTSP_WHEP_REQUEST_FAILED", `WHEP request failed: ${response.status}. ${errorText}`);
      }
      
      const answerSdp = await response.text();
      if (!answerSdp) throw new WebcamError("RTSP_WHEP_NO_ANSWER", "Empty SDP answer received.");
  
      if (this.#abortController?.signal.aborted) throw new DOMException("Aborted after WHEP response.", "AbortError");
      
      await this._peerConnection.setRemoteDescription({ type: "answer", sdp: answerSdp });
      
      return await streamPromise;
  
    } catch (error) {
      this.#clearTrackTimeout(); // Ensure timeout is cleared on any failure
      this.disconnect();
      if ((error as Error).name === "AbortError") throw error;
  
      if (this._connectionAttempts < MAX_CONNECTION_ATTEMPTS) {
        await new Promise(resolve => setTimeout(resolve, 1000 * this._connectionAttempts));
        return this._attemptConnection(pathName);
      } else {
        const finalError = error instanceof WebcamError ? error : new WebcamError("RTSP_CONNECTION_FAILED", `Failed after ${MAX_CONNECTION_ATTEMPTS} attempts: ${(error as Error).message}`);
        throw finalError;
      }
    }
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
      try { this._peerConnection.close(); } catch (_e) { /* Ignored */ }
      this._peerConnection = null;
    }
    if (this._stream) {
      this._stream.getTracks().forEach((track) => track.stop());
    }
    this._stream = null;
  }
}