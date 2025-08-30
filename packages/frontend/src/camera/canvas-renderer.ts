/* FILE: packages/frontend/src/camera/canvas-renderer.ts */
import { Landmark } from "@mediapipe/tasks-vision";

import type { AppStore } from "#frontend/core/state/app-store.js";

import { RoiInteractionHandler } from "./interaction/roi-interaction-handler.js";
import { LandmarkDrawer } from "./rendering/landmark-drawer.js";
import { RoiDrawer, type ROICoordinates } from "./rendering/roi-drawer.js";

interface LandmarkVisibilityOverride {
  hand: boolean;
  pose: boolean;
  numHands?: number;
}
interface FrameRenderData {
    handLandmarks?: Landmark[][];
    poseLandmarks?: Landmark[][];
    roiConfig?: ROICoordinates | null;
}

export class CanvasRenderer {
  #canvasElement: HTMLCanvasElement;
  #videoElement: HTMLVideoElement;
  #canvasCtx: CanvasRenderingContext2D;
  #appStore: AppStore;

  #landmarkDrawer: LandmarkDrawer;
  #roiDrawer: RoiDrawer;
  #roiInteractionHandler: RoiInteractionHandler;

  #lastHandLandmarksData: Landmark[][] = [];
  #lastPoseLandmarksData: Landmark[][] = [];
  #currentAuthoritativeRoiConfig: ROICoordinates | null = null;
  #isMirrored = false;
  #isSourceActive = false;
  #landmarkVisibilityOverride: LandmarkVisibilityOverride | null = null;
  #focusPointsForDrawing: Set<number> | null = null;

  constructor(
    elements: { outputCanvas: HTMLCanvasElement; videoElement: HTMLVideoElement },
    appStore: AppStore,
    updateRoiConfigCallback: (sourceId: string | null, roiConfig: ROICoordinates) => void
  ) {
    if (!elements.outputCanvas || !elements.videoElement || !appStore) {
      throw new Error("CanvasRenderer requires critical elements and an AppStore reference.");
    }
    this.#canvasElement = elements.outputCanvas;
    this.#videoElement = elements.videoElement;
    this.#appStore = appStore;

    const ctx = this.#canvasElement.getContext("2d");
    if (!ctx) throw new Error("Failed to get 2D context from canvas.");
    this.#canvasCtx = ctx;

    this.#landmarkDrawer = new LandmarkDrawer();
    this.#roiDrawer = new RoiDrawer();
    this.#roiInteractionHandler = new RoiInteractionHandler(this.#canvasElement, this.#videoElement, updateRoiConfigCallback, () => this.drawOutput(), this.#appStore);
  }

  public getCanvasElement(): HTMLCanvasElement {
    return this.#canvasElement;
  }

  public setFocusPointsForDrawing(focusPoints: number[] | null): void {
    this.#focusPointsForDrawing = focusPoints ? new Set(focusPoints) : null;
  }

  public setLandmarkVisibilityOverride(override: LandmarkVisibilityOverride | null): void {
    this.#landmarkVisibilityOverride = override;
    this.drawOutput();
  }

  public clearLandmarkVisibilityOverride(): void {
    if (this.#landmarkVisibilityOverride) {
      this.#landmarkVisibilityOverride = null;
      this.drawOutput();
    }
  }

  public setMirroring(isMirrored: boolean): void { this.#isMirrored = isMirrored; }

  public updateSourceInfo(sourceId: string | null, authoritativeRoiConfig: ROICoordinates | null): void {
    this.#isSourceActive = !!sourceId;
    this.#currentAuthoritativeRoiConfig = authoritativeRoiConfig;
    this.#roiInteractionHandler.updateSourceInfo(sourceId, authoritativeRoiConfig);
  }
  
  public updateLandmarkData(data: FrameRenderData | undefined): void {
    if (!data) return;
    this.#lastHandLandmarksData = data.handLandmarks || [];
    this.#lastPoseLandmarksData = data.poseLandmarks || [];
    if (data.roiConfig !== undefined) {
        this.#currentAuthoritativeRoiConfig = data.roiConfig;
    }
  }

  public handleResize(): void {
    this.#roiInteractionHandler.handleResize();
    this.drawOutput();
  }

  public drawOutput(): void {
    const { videoWidth, videoHeight, readyState } = this.#videoElement;
    if (!this.#isSourceActive || !videoWidth || !videoHeight || readyState < 2) {
      this.clearCanvas(); return;
    }

    const { clientWidth: displayWidth, clientHeight: displayHeight } = this.#canvasElement;
    if (this.#canvasElement.width !== displayWidth || this.#canvasElement.height !== displayHeight) {
      if (displayWidth > 0 && displayHeight > 0) {
        this.#canvasElement.width = displayWidth; this.#canvasElement.height = displayHeight;
      } else return;
    }

    // --- Draw Video (with mirroring) ---
    this.#canvasCtx.save();
    this.#canvasCtx.clearRect(0, 0, displayWidth, displayHeight);
    if (this.#isMirrored) {
      this.#canvasCtx.translate(displayWidth, 0);
      this.#canvasCtx.scale(-1, 1);
    }
    
    const videoAspect = videoWidth / videoHeight, canvasAspect = displayWidth / displayHeight;
    let sWidth = videoWidth, sHeight = videoHeight, sx = 0, sy = 0;
    if (videoAspect > canvasAspect) { sWidth = videoHeight * canvasAspect; sx = (videoWidth - sWidth) / 2; } 
    else { sHeight = videoWidth / canvasAspect; sy = (videoHeight - sHeight) / 2; }
    this.#canvasCtx.drawImage(this.#videoElement, sx, sy, sWidth, sHeight, 0, 0, displayWidth, displayHeight);
    
    this.#canvasCtx.restore();

    // --- Draw Overlays and Landmarks (on non-mirrored context) ---
    this.#drawRoiOverlay(videoWidth, videoHeight, sx, sy, sWidth, sHeight, displayWidth, displayHeight);
    
    this.#drawAllLandmarks(displayWidth, displayHeight, videoWidth, videoHeight);
  }

  #drawRoiOverlay(videoWidth: number, videoHeight: number, sx: number, sy: number, sWidth: number, sHeight: number, displayWidth: number, displayHeight: number): void {
    const roiToDraw = this.#roiInteractionHandler.getRoiToDraw() ?? this.#currentAuthoritativeRoiConfig;
    const isRtspSource = this.#roiInteractionHandler.getCurrentSourceId()?.startsWith("rtsp:") ?? false;
    const isRoiEffective = roiToDraw && !(roiToDraw.x === 0 && roiToDraw.y === 0 && roiToDraw.width === 100 && roiToDraw.height === 100);

    if (isRtspSource && isRoiEffective && roiToDraw) {
        const scaleX = displayWidth / sWidth, scaleY = displayHeight / sHeight;
        const roiOnCanvasPx = {
            x: (roiToDraw.x / 100 * videoWidth - sx) * scaleX,
            y: (roiToDraw.y / 100 * videoHeight - sy) * scaleY,
            width: (roiToDraw.width / 100 * videoWidth) * scaleX,
            height: (roiToDraw.height / 100 * videoHeight) * scaleY,
        };
        this.#roiInteractionHandler.setLastRoiDisplayCoordinates(roiOnCanvasPx);
        this.#canvasCtx.fillStyle = "rgba(0, 0, 0, 0.5)";
        this.#canvasCtx.fillRect(0, 0, displayWidth, roiOnCanvasPx.y);
        this.#canvasCtx.fillRect(0, roiOnCanvasPx.y + roiOnCanvasPx.height, displayWidth, this.#canvasElement.height - (roiOnCanvasPx.y + roiOnCanvasPx.height));
        this.#canvasCtx.fillRect(0, roiOnCanvasPx.y, roiOnCanvasPx.x, roiOnCanvasPx.height);
        this.#canvasCtx.fillRect(roiOnCanvasPx.x + roiOnCanvasPx.width, roiOnCanvasPx.y, this.#canvasElement.width - (roiOnCanvasPx.x + roiOnCanvasPx.width), roiOnCanvasPx.height);
        this.#roiDrawer.draw(this.#canvasCtx, roiOnCanvasPx.x, roiOnCanvasPx.y, roiOnCanvasPx.width, roiOnCanvasPx.height);
    } else {
        this.#roiInteractionHandler.setLastRoiDisplayCoordinates(null);
    }
  }

  #drawAllLandmarks(displayWidth: number, displayHeight: number, videoWidth: number, videoHeight: number): void {
    const state = this.#appStore.getState();
    const ov = this.#landmarkVisibilityOverride;
    
    const showHand = ov ? ov.hand : state.showHandLandmarks;
    const showPose = ov ? ov.pose : state.showPoseLandmarks;

    if (!showHand && !showPose) return;
    
    const bodyStyles = getComputedStyle(document.body);
    const primaryColor = bodyStyles.getPropertyValue("--primary").trim() || "#1850d6";
    const secondaryColor = bodyStyles.getPropertyValue("--secondary").trim() || "#6c757d";
    const focusColor = bodyStyles.getPropertyValue("--warning").trim() || "#ffc107";
    const targetRect = { x: 0, y: 0, width: displayWidth, height: displayHeight };

    if (showHand && this.#lastHandLandmarksData?.length > 0) {
      this.#landmarkDrawer.draw(this.#canvasCtx, this.#lastHandLandmarksData, targetRect.x, targetRect.y, targetRect.width, targetRect.height, { color: primaryColor, lineWidth: 2, radius: 4, connections: LandmarkDrawer.getHandConnections() }, videoWidth, videoHeight, this.#currentAuthoritativeRoiConfig, this.#isMirrored, this.#focusPointsForDrawing, focusColor);
    }
    if (showPose && this.#lastPoseLandmarksData?.length > 0) {
      this.#landmarkDrawer.draw(this.#canvasCtx, this.#lastPoseLandmarksData, targetRect.x, targetRect.y, targetRect.width, targetRect.height, { color: secondaryColor, lineWidth: 3, radius: 5, connections: LandmarkDrawer.getPoseConnections() }, videoWidth, videoHeight, this.#currentAuthoritativeRoiConfig, this.#isMirrored, this.#focusPointsForDrawing, focusColor);
    }
  }

  public clearVideoSource(): void {
    this.#isSourceActive = false;
    this.#lastHandLandmarksData = [];
    this.#lastPoseLandmarksData = [];
    this.clearCanvas();
  }

  public clearCanvas(): void {
    if (!this.#canvasCtx || !this.#canvasElement) return;
    if (this.#canvasElement.width !== this.#canvasElement.clientWidth) this.#canvasElement.width = this.#canvasElement.clientWidth;
    if (this.#canvasElement.height !== this.#canvasElement.clientHeight) this.#canvasElement.height = this.#canvasElement.clientHeight;
    if (this.#canvasElement.width > 0 && this.#canvasElement.height > 0) this.#canvasCtx.clearRect(0, 0, this.#canvasElement.width, this.#canvasElement.height);
  }

  public destroy(): void { this.#roiInteractionHandler.destroy(); }
}