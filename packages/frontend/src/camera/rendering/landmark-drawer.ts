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
        fullVideoWidth: number, 
        fullVideoHeight: number,
        activeRoiPercent: ROICoordinates | null,
        isMirrored: boolean,
        focusPoints: Set<number> | null,
        focusColor: string
    ): void {
        if (
            !landmarksSet || !Array.isArray(landmarksSet) || landmarksSet.length === 0 ||
            !fullVideoWidth || !fullVideoHeight || fullVideoWidth === 0 || fullVideoHeight === 0 ||
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
                
                let finalNormX = lm.x;
                let finalNormY = lm.y;
                let pointColor = defaultColor;

                if (activeRoiPercent) {
                    pointColor = inRoiColor; 
                    finalNormX = (activeRoiPercent.x / 100.0) + (lm.x * (activeRoiPercent.width / 100.0));
                    finalNormY = (activeRoiPercent.y / 100.0) + (lm.y * (activeRoiPercent.height / 100.0));
                }
                
                if (isMirrored) {
                    finalNormX = 1.0 - finalNormX;
                }
                
                if (focusPoints && focusPoints.has(index)) {
                    pointColor = focusColor;
                }
                
                const canvasWidth = targetRectWidthOnCanvas;
                const canvasHeight = targetRectHeightOnCanvas;
                const canvasAspect = canvasWidth / canvasHeight;
                const sourceAspect = fullVideoWidth / fullVideoHeight;
                let scale: number, videoRenderX = 0, videoRenderY = 0;

                // This logic calculates the 'letterboxing' or 'pillarboxing' offset and scale
                // to correctly map normalized landmark coordinates (0.0-1.0) from the full video
                // frame to the scaled and centered video image being drawn on the canvas.
                if (sourceAspect > canvasAspect) { // Video is wider than canvas (pillarbox)
                    scale = canvasHeight / fullVideoHeight;
                    videoRenderX = (canvasWidth - fullVideoWidth * scale) / 2;
                } else { // Video is taller than canvas (letterbox)
                    scale = canvasWidth / fullVideoWidth;
                    videoRenderY = (targetRectHeightOnCanvas - fullVideoHeight * scale) / 2;
                }
                
                const scaledX = targetRectXOnCanvas + videoRenderX + (finalNormX * fullVideoWidth * scale);
                const scaledY = targetRectYOnCanvas + videoRenderY + (finalNormY * fullVideoHeight * scale);
                
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