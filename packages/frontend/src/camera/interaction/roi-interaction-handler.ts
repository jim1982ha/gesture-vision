/* FILE: packages/frontend/src/camera/interaction/roi-interaction-handler.ts */
import type { AppStore } from '#frontend/core/state/app-store.js';
import type { ROICoordinates } from '../rendering/roi-drawer.js';

interface DraggingState {
    active: boolean;
    target: string | null;
    initialMouseX: number;
    initialMouseY: number;
    initialRoiRectPx: ROICoordinates | null;
    initialPercentageRoiConfig: ROICoordinates | null;
    cachedVideoWidth: number;
    cachedVideoHeight: number;
    cachedDisplayWidth: number;
    cachedDisplayHeight: number;
    cachedVideoScale: number;
    cachedVideoContentPixelX: number;
    cachedVideoContentPixelY: number;
    cachedVideoContentPixelWidth: number;
    cachedVideoContentPixelHeight: number;
}

export class RoiInteractionHandler {
    #canvasElement: HTMLCanvasElement;
    #videoElement: HTMLVideoElement;
    #updateRoiConfigCallback: (sourceId: string | null, roiConfig: ROICoordinates) => void;
    #triggerRedrawCallback: () => void;
    #currentSourceId: string | null = null;
    #lastRoiDisplayCoordinatesPx: ROICoordinates | null = null;
    #authoritativeRoiConfigPercent: ROICoordinates | null = null;
    #currentDragRoiConfigPercent: ROICoordinates | null = null;
    #draggingState: DraggingState = {
        active: false, target: null, initialMouseX: 0, initialMouseY: 0,
        initialRoiRectPx: null, initialPercentageRoiConfig: null,
        cachedVideoWidth: 0, cachedVideoHeight: 0, cachedDisplayWidth: 0, cachedDisplayHeight: 0,
        cachedVideoScale: 1, cachedVideoContentPixelX: 0, cachedVideoContentPixelY: 0,
        cachedVideoContentPixelWidth: 0, cachedVideoContentPixelHeight: 0
    };
    #roiDragCompletedTimestamp = 0;
    readonly ROI_DRAW_OVERRIDE_MS = 200;
    #boundHandleMouseDown: (event: MouseEvent) => void;
    #boundHandleMouseMoveWindow: (event: MouseEvent) => void;
    #boundHandleMouseUpWindow: (event: MouseEvent) => void;
    #boundHandleMouseMoveCanvas: (event: MouseEvent) => void;
    #boundHandleMouseLeaveCanvas: (event: MouseEvent) => void;

    constructor(
        canvasElement: HTMLCanvasElement,
        videoElement: HTMLVideoElement,
        updateRoiConfigCallback: (sourceId: string | null, roiConfig: ROICoordinates) => void,
        triggerRedrawCallback: () => void,
        _appStore: AppStore // Marked as unused
    ) {
        this.#canvasElement = canvasElement;
        this.#videoElement = videoElement;
        this.#updateRoiConfigCallback = updateRoiConfigCallback;
        this.#triggerRedrawCallback = triggerRedrawCallback;
        this.#boundHandleMouseDown = this.#handleMouseDown.bind(this);
        this.#boundHandleMouseMoveWindow = this.#handleMouseMoveWindow.bind(this);
        this.#boundHandleMouseUpWindow = this.#handleMouseUpWindow.bind(this);
        this.#boundHandleMouseMoveCanvas = this.#handleMouseMoveCanvas.bind(this);
        this.#boundHandleMouseLeaveCanvas = this.#handleMouseLeaveCanvas.bind(this);
        this.#initializeEventListeners();
    }

    #initializeEventListeners(): void {
        this.#canvasElement.addEventListener("mousedown", this.#boundHandleMouseDown);
        this.#canvasElement.addEventListener("mousemove", this.#boundHandleMouseMoveCanvas);
        this.#canvasElement.addEventListener("mouseleave", this.#boundHandleMouseLeaveCanvas);
        window.addEventListener("mousemove", this.#boundHandleMouseMoveWindow);
        window.addEventListener("mouseup", this.#boundHandleMouseUpWindow);
    }

    public destroy(): void {
        this.#canvasElement.removeEventListener("mousedown", this.#boundHandleMouseDown);
        this.#canvasElement.removeEventListener("mousemove", this.#boundHandleMouseMoveCanvas);
        this.#canvasElement.removeEventListener("mouseleave", this.#boundHandleMouseLeaveCanvas);
        window.removeEventListener("mousemove", this.#boundHandleMouseMoveWindow);
        window.removeEventListener("mouseup", this.#boundHandleMouseUpWindow);
    }

    public updateSourceInfo(sourceId: string | null, authoritativeRoiConfigPercent: ROICoordinates | null): void {
        this.#currentSourceId = sourceId;
        this.#authoritativeRoiConfigPercent = authoritativeRoiConfigPercent ? this.#roundRoiValues(authoritativeRoiConfigPercent) : null;
        this.#currentDragRoiConfigPercent = null;
        this.#recalculateLastRoiDisplayCoordinatesFromConfig();
        if (this.#draggingState.active) {
            this.#draggingState.active = false;
            this.#canvasElement.style.cursor = "default";
        }
    }

    public handleResize(): void {
        const configToRecalculateFrom = this.#draggingState.active ? this.#currentDragRoiConfigPercent : this.#authoritativeRoiConfigPercent;
        if (configToRecalculateFrom) {
            this.#recalculateLastRoiDisplayCoordinatesFromConfig(configToRecalculateFrom);
        } else {
            this.#lastRoiDisplayCoordinatesPx = null;
        }
    }

    public isDragging(): boolean {
        return this.#draggingState.active;
    }

    public getRoiToDraw(): ROICoordinates | null {
        const now = performance.now();
        let roiToReturn: ROICoordinates | null;

        if (this.#draggingState.active && this.#currentDragRoiConfigPercent) {
            roiToReturn = this.#currentDragRoiConfigPercent;
        } else if (this.#currentDragRoiConfigPercent && now - this.#roiDragCompletedTimestamp < this.ROI_DRAW_OVERRIDE_MS) {
            roiToReturn = this.#currentDragRoiConfigPercent;
        } else {
            roiToReturn = this.#authoritativeRoiConfigPercent;
        }
        return roiToReturn;
    }

    public setLastRoiDisplayCoordinates(coords: ROICoordinates | null): void {
        if (!this.#draggingState.active) {
            this.#lastRoiDisplayCoordinatesPx = coords ? { ...coords } : null;
        }
    }

    public getLastRoiDisplayCoordinates(): ROICoordinates | null {
        return this.#lastRoiDisplayCoordinatesPx;
    }

    #recalculateLastRoiDisplayCoordinatesFromConfig(roiConfigPercentForCalc?: ROICoordinates | null): void {
        const currentRoiConfig = roiConfigPercentForCalc || this.#authoritativeRoiConfigPercent;

        if (!currentRoiConfig || !this.#videoElement || !this.#canvasElement ||
            !this.#videoElement.videoWidth || !this.#videoElement.videoHeight) {
            this.#lastRoiDisplayCoordinatesPx = null;
            return;
        }

        const { videoWidth, videoHeight } = this.#videoElement;
        const { clientWidth: displayWidth, clientHeight: displayHeight } = this.#canvasElement;

        if (videoWidth === 0 || videoHeight === 0 || displayWidth === 0 || displayHeight === 0) {
            this.#lastRoiDisplayCoordinatesPx = null;
            return;
        }

        const videoAspect = videoWidth / videoHeight;
        const displayAspect = displayWidth / displayHeight;

        let videoScale = 1, videoOffsetX = 0, videoOffsetY = 0;

        if (videoAspect > displayAspect) {
            videoScale = displayHeight / videoHeight;
            videoOffsetX = (displayWidth - videoWidth * videoScale) / 2;
        } else {
            videoScale = displayWidth / videoWidth;
            videoOffsetY = (displayHeight - videoHeight * videoScale) / 2;
        }

        const roiPxX = videoOffsetX + (currentRoiConfig.x / 100) * videoWidth * videoScale;
        const roiPxY = videoOffsetY + (currentRoiConfig.y / 100) * videoHeight * videoScale;
        const roiPxWidth = (currentRoiConfig.width / 100) * videoWidth * videoScale;
        const roiPxHeight = (currentRoiConfig.height / 100) * videoHeight * videoScale;

        this.#lastRoiDisplayCoordinatesPx = {
            x: roiPxX, y: roiPxY, width: roiPxWidth, height: roiPxHeight
        };
    }

    #isRoiEditingAllowed(): boolean {
        return !!this.#currentSourceId?.startsWith("rtsp:");
    }

    #handleMouseDown(event: MouseEvent): void {
        if (event.target !== this.#canvasElement || !this.#isRoiEditingAllowed()) {
            return;
        }

        // If no ROI exists yet, calculate the bounds for a full 100x100 frame so it can be grabbed.
        if (!this.#lastRoiDisplayCoordinatesPx) {
            this.#recalculateLastRoiDisplayCoordinatesFromConfig({ x: 0, y: 0, width: 100, height: 100 });
            if (!this.#lastRoiDisplayCoordinatesPx) return; // Video not ready
        }

        const rect = this.#canvasElement.getBoundingClientRect();
        const mouseXCanvas = event.clientX - rect.left;
        const mouseYCanvas = event.clientY - rect.top;

        const target = this.#getDragTarget(mouseXCanvas, mouseYCanvas);
        
        if (target) {
            const { videoWidth, videoHeight } = this.#videoElement;
            const { clientWidth: displayWidth, clientHeight: displayHeight } = this.#canvasElement;

            if (!videoWidth || !videoHeight || !displayWidth || !displayHeight) {
                return;
            }

            const startingConfig = this.#authoritativeRoiConfigPercent 
                ? { ...this.#authoritativeRoiConfigPercent }
                : { x: 0, y: 0, width: 100, height: 100 };

            this.#currentDragRoiConfigPercent = this.#roundRoiValues(startingConfig);

            this.#draggingState = {
                active: true, target, initialMouseX: event.clientX, initialMouseY: event.clientY,
                initialRoiRectPx: { ...this.#lastRoiDisplayCoordinatesPx },
                initialPercentageRoiConfig: this.#currentDragRoiConfigPercent ? { ...this.#currentDragRoiConfigPercent } : null,
                cachedVideoWidth: videoWidth, cachedVideoHeight: videoHeight,
                cachedDisplayWidth: displayWidth, cachedDisplayHeight: displayHeight,
                cachedVideoScale: 1, cachedVideoContentPixelX: 0, cachedVideoContentPixelY: 0,
                cachedVideoContentPixelWidth: 0, cachedVideoContentPixelHeight: 0,
            };

            const videoAspect = videoWidth / videoHeight;
            const displayAspect = displayWidth / displayHeight;

            if (videoAspect > displayAspect) {
                this.#draggingState.cachedVideoScale = displayHeight / videoHeight;
                this.#draggingState.cachedVideoContentPixelX = (displayWidth - videoWidth * this.#draggingState.cachedVideoScale) / 2;
                this.#draggingState.cachedVideoContentPixelY = 0;
            } else {
                this.#draggingState.cachedVideoScale = displayWidth / videoWidth;
                this.#draggingState.cachedVideoContentPixelX = 0;
                this.#draggingState.cachedVideoContentPixelY = (displayHeight - videoHeight * this.#draggingState.cachedVideoScale) / 2;
            }
            this.#draggingState.cachedVideoContentPixelWidth = videoWidth * this.#draggingState.cachedVideoScale;
            this.#draggingState.cachedVideoContentPixelHeight = videoHeight * this.#draggingState.cachedVideoScale;

            this.#canvasElement.style.cursor = this.#getCursorForTarget(target);
            event.preventDefault();
        }
    }

    #handleMouseMoveWindow(event: MouseEvent): void {
        const ds = this.#draggingState;
        if (!ds.active || !ds.initialRoiRectPx || !ds.initialPercentageRoiConfig) return;

        if (typeof this.#updateRoiConfigCallback !== "function") {
          if (ds.active) { this.#canvasElement.style.cursor = "default"; ds.active = false; }
          return;
        }

        if (ds.cachedVideoWidth === 0 || ds.cachedVideoHeight === 0) {
            this.#triggerRedrawCallback();
            return;
        }

        const deltaX = event.clientX - ds.initialMouseX;
        const deltaY = event.clientY - ds.initialMouseY;

        const newRoiRectPx: ROICoordinates = {
            x: ds.initialRoiRectPx.x,
            y: ds.initialRoiRectPx.y,
            width: ds.initialRoiRectPx.width,
            height: ds.initialRoiRectPx.height
        };

        switch (ds.target) {
            case "move": newRoiRectPx.x += deltaX; newRoiRectPx.y += deltaY; break;
            case "tl": newRoiRectPx.x += deltaX; newRoiRectPx.y += deltaY; newRoiRectPx.width -= deltaX; newRoiRectPx.height -= deltaY; break;
            case "tr": newRoiRectPx.y += deltaY; newRoiRectPx.width += deltaX; newRoiRectPx.height -= deltaY; break;
            case "bl": newRoiRectPx.x += deltaX; newRoiRectPx.width -= deltaX; newRoiRectPx.height += deltaY; break;
            case "br": newRoiRectPx.width += deltaX; newRoiRectPx.height += deltaY; break;
            case "t": newRoiRectPx.y += deltaY; newRoiRectPx.height -= deltaY; break;
            case "b": newRoiRectPx.height += deltaY; break;
            case "l": newRoiRectPx.x += deltaX; newRoiRectPx.width -= deltaX; break;
            case "r": newRoiRectPx.width += deltaX; break;
        }

        const minPixelSize = 20;
        if (newRoiRectPx.width < minPixelSize) {
            if (ds.target === "tl" || ds.target === "l" || ds.target === "bl") newRoiRectPx.x = ds.initialRoiRectPx.x + ds.initialRoiRectPx.width - minPixelSize;
            newRoiRectPx.width = minPixelSize;
        }
        if (newRoiRectPx.height < minPixelSize) {
            if (ds.target === "tl" || ds.target === "t" || ds.target === "tr") newRoiRectPx.y = ds.initialRoiRectPx.y + ds.initialRoiRectPx.height - minPixelSize;
            newRoiRectPx.height = minPixelSize;
        }

        newRoiRectPx.x = Math.max(ds.cachedVideoContentPixelX, newRoiRectPx.x);
        newRoiRectPx.y = Math.max(ds.cachedVideoContentPixelY, newRoiRectPx.y);

        if (newRoiRectPx.x + newRoiRectPx.width > ds.cachedVideoContentPixelX + ds.cachedVideoContentPixelWidth) {
            if (ds.target === "move") {
                 newRoiRectPx.x = ds.cachedVideoContentPixelX + ds.cachedVideoContentPixelWidth - newRoiRectPx.width;
            } else {
                 newRoiRectPx.width = ds.cachedVideoContentPixelX + ds.cachedVideoContentPixelWidth - newRoiRectPx.x;
            }
        }
        if (newRoiRectPx.y + newRoiRectPx.height > ds.cachedVideoContentPixelY + ds.cachedVideoContentPixelHeight) {
             if (ds.target === "move") {
                newRoiRectPx.y = ds.cachedVideoContentPixelY + ds.cachedVideoContentPixelHeight - newRoiRectPx.height;
            } else {
                newRoiRectPx.height = ds.cachedVideoContentPixelY + ds.cachedVideoContentPixelHeight - newRoiRectPx.y;
            }
        }

        let percentX = ((newRoiRectPx.x - ds.cachedVideoContentPixelX) / ds.cachedVideoScale / ds.cachedVideoWidth) * 100;
        let percentY = ((newRoiRectPx.y - ds.cachedVideoContentPixelY) / ds.cachedVideoScale / ds.cachedVideoHeight) * 100;
        let percentWidth = (newRoiRectPx.width / ds.cachedVideoScale / ds.cachedVideoWidth) * 100;
        let percentHeight = (newRoiRectPx.height / ds.cachedVideoScale / ds.cachedVideoHeight) * 100;

        percentX = Math.max(0, Math.min(100, percentX));
        percentY = Math.max(0, Math.min(100, percentY));
        const minPercentSize = 1;
        percentWidth = Math.max(minPercentSize, Math.min(100 - percentX, percentWidth));
        percentHeight = Math.max(minPercentSize, Math.min(100 - percentY, percentHeight));

        this.#currentDragRoiConfigPercent = this.#roundRoiValues({ x: percentX, y: percentY, width: percentWidth, height: percentHeight });
        this.#recalculateLastRoiDisplayCoordinatesFromConfig(this.#currentDragRoiConfigPercent);
        this.#triggerRedrawCallback();

        event.preventDefault();
    }

    #handleMouseUpWindow(event: MouseEvent): void {
        if (!this.#draggingState.active) return;

        this.#canvasElement.style.cursor = "default";
        this.#draggingState.active = false;
        this.#roiDragCompletedTimestamp = performance.now();

        if (this.#currentDragRoiConfigPercent) {
            this.#updateRoiConfigCallback(this.#currentSourceId, this.#currentDragRoiConfigPercent);
            this.#authoritativeRoiConfigPercent = this.#currentDragRoiConfigPercent;
        }

        this.#triggerRedrawCallback();
        event.preventDefault();
    }

    #handleMouseMoveCanvas(event: MouseEvent): void {
        if (this.#draggingState.active || !this.#isRoiEditingAllowed()) {
            if(!this.#draggingState.active) this.#canvasElement.style.cursor = "default";
            return;
        }

        if (!this.#lastRoiDisplayCoordinatesPx) {
            // Give them the full frame drag target if it doesn't exist yet
            this.#recalculateLastRoiDisplayCoordinatesFromConfig({ x: 0, y: 0, width: 100, height: 100 });
        }
        
        if (!this.#lastRoiDisplayCoordinatesPx) return;

        const rect = this.#canvasElement.getBoundingClientRect();
        const mouseX = event.clientX - rect.left;
        const mouseY = event.clientY - rect.top;

        const target = this.#getDragTarget(mouseX, mouseY);
        this.#canvasElement.style.cursor = this.#getCursorForTarget(target);
    }

    #handleMouseLeaveCanvas(_event: MouseEvent): void {
        if (!this.#draggingState.active) {
            this.#canvasElement.style.cursor = "default";
        }
    }

    #roundRoiValues(roi: ROICoordinates | null): ROICoordinates | null {
        if (!roi) return null;
        return {
            x: parseFloat(roi.x.toFixed(2)),
            y: parseFloat(roi.y.toFixed(2)),
            width: parseFloat(roi.width.toFixed(2)),
            height: parseFloat(roi.height.toFixed(2)),
        };
    }

    public getCurrentSourceId(): string | null {
        return this.#currentSourceId;
    }

    #getDragTarget(mouseX: number, mouseY: number): string | null {
        if (!this.#lastRoiDisplayCoordinatesPx) return null;
        const { x, y, width, height } = this.#lastRoiDisplayCoordinatesPx;
        const handleSize = 10;
        
        if (mouseX >= x - handleSize && mouseX <= x + handleSize && mouseY >= y - handleSize && mouseY <= y + handleSize) return "tl";
        if (mouseX >= x + width - handleSize && mouseX <= x + width + handleSize && mouseY >= y - handleSize && mouseY <= y + handleSize) return "tr";
        if (mouseX >= x - handleSize && mouseX <= x + handleSize && mouseY >= y + height - handleSize && mouseY <= y + height + handleSize) return "bl";
        if (mouseX >= x + width - handleSize && mouseX <= x + width + handleSize && mouseY >= y + height - handleSize && mouseY <= y + height + handleSize) return "br";

        if (mouseX >= x + handleSize && mouseX <= x + width - handleSize && mouseY >= y - handleSize && mouseY <= y + handleSize) return "t";
        if (mouseX >= x + handleSize && mouseX <= x + width - handleSize && mouseY >= y + height - handleSize && mouseY <= y + height + handleSize) return "b";
        if (mouseX >= x - handleSize && mouseX <= x + handleSize && mouseY >= y + handleSize && mouseY <= y + height - handleSize) return "l";
        if (mouseX >= x + width - handleSize && mouseX <= x + width + handleSize && mouseY >= y + handleSize && mouseY <= y + height - handleSize) return "r";

        if (mouseX > x && mouseX < x + width && mouseY > y && mouseY < y + height) return "move";

        return null;
    }

    #getCursorForTarget(target: string | null): string {
        switch (target) {
            case "move": return "move";
            case "tl": case "br": return "nwse-resize";
            case "tr": case "bl": return "nesw-resize";
            case "t": case "b": return "ns-resize";
            case "l": case "r": return "ew-resize";
            default: return "default";
        }
    }
}