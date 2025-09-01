/* FILE: packages/frontend/src/camera/rendering/landmark-drawer.ts */
import { HandLandmarker, PoseLandmarker, type Landmark } from "@mediapipe/tasks-vision";

import { ROICoordinates } from "./roi-drawer.js"; 

export interface DrawingOptions {
    color: string;
    lineWidth: number;
    radius: number;
    connections?: Array<{start: number; end: number}>;
}

export class LandmarkDrawer {
    constructor() {}

    public draw(
        ctx: CanvasRenderingContext2D,
        landmarksSet: Landmark[][],
        targetRectXOnCanvas: number,
        targetRectYOnCanvas: number,
        targetRectWidthOnCanvas: number,
        targetRectHeightOnCanvas: number,
        options: DrawingOptions,
        _fullVideoWidth: number, 
        _fullVideoHeight: number,
        activeRoiPercent: ROICoordinates | null,
        isMirrored: boolean,
        focusPoints: Set<number> | null,
        focusColor: string
    ): void {
        if (
            !landmarksSet || !Array.isArray(landmarksSet) || landmarksSet.length === 0 ||
            targetRectWidthOnCanvas <= 0 || targetRectHeightOnCanvas <= 0
        ) {
            return;
        }

        ctx.save(); 
        ctx.globalAlpha = 1.0;
        ctx.globalCompositeOperation = "source-over";
        const { connections, lineWidth = 2, radius = 4 } = options;
        const defaultColor = options.color; 
        
        const bodyStyles = getComputedStyle(document.body);
        const inRoiColor = bodyStyles.getPropertyValue("--success").trim() || "green";

        for (const singleInstanceLandmarks of landmarksSet) {
            if (!Array.isArray(singleInstanceLandmarks) || singleInstanceLandmarks.length === 0) continue;
            
            const pointsToDraw = singleInstanceLandmarks.map((lm, index) => {
                if (typeof lm?.x !== "number" || typeof lm?.y !== "number" || isNaN(lm.x) || isNaN(lm.y)) return null;
                
                const normX = lm.x;
                const normY = lm.y;
                let pointColor = defaultColor;

                if (activeRoiPercent) {
                    pointColor = inRoiColor; 
                }
                
                // Landmarks are normalized to the source frame (either full or ROI).
                // Target rect is the pixel area on canvas where that source is drawn.
                const scaledX = targetRectXOnCanvas + (isMirrored ? (1 - normX) : normX) * targetRectWidthOnCanvas;
                const scaledY = targetRectYOnCanvas + normY * targetRectHeightOnCanvas;
                
                if (focusPoints && focusPoints.has(index)) {
                    pointColor = focusColor;
                }
                
                return { x: scaledX, y: scaledY, color: pointColor };

            }).filter((p): p is { x: number; y: number, color: string } => p !== null);

            if (connections && Array.isArray(connections)) {
                ctx.strokeStyle = defaultColor;
                ctx.lineWidth = lineWidth;
                for (const connection of connections) {
                    if (connection.start < pointsToDraw.length && connection.end < pointsToDraw.length) {
                        const start = pointsToDraw[connection.start];
                        const end = pointsToDraw[connection.end];
                        ctx.beginPath();
                        ctx.moveTo(start.x, start.y);
                        ctx.lineTo(end.x, end.y);
                        ctx.stroke();
                    }
                }
            }

            for (const point of pointsToDraw) {
                ctx.fillStyle = point.color;
                ctx.beginPath();
                ctx.arc(point.x, point.y, radius, 0, 2 * Math.PI);
                ctx.fill();
            }
        }
        ctx.restore(); 
    }

    public static getHandConnections(): Array<{start: number; end: number}> | undefined { return HandLandmarker?.HAND_CONNECTIONS; }
    public static getPoseConnections(): Array<{start: number; end: number}> | undefined { return PoseLandmarker?.POSE_CONNECTIONS; }
}