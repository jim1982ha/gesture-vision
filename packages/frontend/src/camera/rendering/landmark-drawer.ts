/* FILE: packages/frontend/src/camera/rendering/landmark-drawer.ts */
import { HandLandmarker, PoseLandmarker } from "@mediapipe/tasks-vision";

export interface DrawingOptions {
    color: string;
    lineWidth: number;
    radius: number;
    connections?: Array<{start: number; end: number}>;
}

export interface TransformedLandmark {
    x: number; // Final canvas X coordinate
    y: number; // Final canvas Y coordinate
    color: string; // Final color for this specific landmark point
}

export class LandmarkDrawer {
    constructor() {}

    /**
     * Draws pre-transformed landmarks and their connections onto the canvas.
     * This method is "dumb" and only handles drawing, not coordinate calculations.
     * @param ctx The 2D rendering context of the canvas.
     * @param transformedLandmarksSet An array of landmark sets (e.g., for multiple hands). Each set is an array of transformed points or nulls.
     * @param options General drawing options like default color, line width, and radius.
     */
    public draw(
        ctx: CanvasRenderingContext2D,
        transformedLandmarksSet: (TransformedLandmark | null)[][],
        options: DrawingOptions
    ): void {
        if (!transformedLandmarksSet || transformedLandmarksSet.length === 0) return;

        ctx.save();
        ctx.globalAlpha = 1.0;
        ctx.globalCompositeOperation = "source-over";
        const { connections, lineWidth = 2, radius = 4 } = options;

        for (const singleInstanceLandmarks of transformedLandmarksSet) {
            if (!singleInstanceLandmarks || singleInstanceLandmarks.length === 0) continue;

            // Draw connections first using the default color from options
            if (connections && Array.isArray(connections)) {
                ctx.strokeStyle = options.color;
                ctx.lineWidth = lineWidth;
                for (const connection of connections) {
                    const start = singleInstanceLandmarks[connection.start];
                    const end = singleInstanceLandmarks[connection.end];
                    // Ensure both points for a connection exist before drawing
                    if (start && end) {
                        ctx.beginPath();
                        ctx.moveTo(start.x, start.y);
                        ctx.lineTo(end.x, end.y);
                        ctx.stroke();
                    }
                }
            }

            // Draw individual landmark points on top
            for (const point of singleInstanceLandmarks) {
                if (point) {
                    ctx.fillStyle = point.color;
                    ctx.beginPath();
                    ctx.arc(point.x, point.y, radius, 0, 2 * Math.PI);
                    ctx.fill();
                }
            }
        }
        ctx.restore();
    }

    public static getHandConnections(): Array<{start: number; end: number}> | undefined { return HandLandmarker?.HAND_CONNECTIONS; }
    public static getPoseConnections(): Array<{start: number; end: number}> | undefined { return PoseLandmarker?.POSE_CONNECTIONS; }
}