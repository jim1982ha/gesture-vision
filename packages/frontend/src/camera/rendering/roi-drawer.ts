/* FILE: packages/frontend/src/camera/rendering/roi-drawer.ts */

export interface ROICoordinates {
    x: number;
    y: number;
    width: number;
    height: number;
}
export class RoiDrawer {
    constructor() {
        // Constructor can be empty
    }

    public draw(
        ctx: CanvasRenderingContext2D,
        x: number,
        y: number,
        width: number,
        height: number
    ): void {
        ctx.save();
        const bodyStyles = getComputedStyle(document.body);
        let primaryColor = bodyStyles.getPropertyValue("--primary")?.trim();
        if (!primaryColor || primaryColor === "") {
            primaryColor = getComputedStyle(document.documentElement)
                .getPropertyValue("--primary")
                ?.trim() || "#2a9d8f"; // Fallback color
        }
        ctx.strokeStyle = primaryColor;
        const cornerLength = Math.min(width, height) * 0.1; // Example: 10% of smaller dimension

        // Solid corners
        ctx.lineWidth = 3; // Thicker lines for corners
        ctx.setLineDash([]); // Solid line

        // Top-left corner
        ctx.beginPath();
        ctx.moveTo(x + cornerLength, y);
        ctx.lineTo(x, y);
        ctx.lineTo(x, y + cornerLength);
        ctx.stroke();

        // Top-right corner
        ctx.beginPath();
        ctx.moveTo(x + width - cornerLength, y);
        ctx.lineTo(x + width, y);
        ctx.lineTo(x + width, y + cornerLength);
        ctx.stroke();

        // Bottom-left corner
        ctx.beginPath();
        ctx.moveTo(x + cornerLength, y + height);
        ctx.lineTo(x, y + height);
        ctx.lineTo(x, y + height - cornerLength);
        ctx.stroke();

        // Bottom-right corner
        ctx.beginPath();
        ctx.moveTo(x + width - cornerLength, y + height);
        ctx.lineTo(x + width, y + height);
        ctx.lineTo(x + width, y + height - cornerLength);
        ctx.stroke();

        // Dashed lines for the rest of the rectangle
        ctx.lineWidth = 1; // Thinner lines for dashed part
        ctx.setLineDash([2, 3]); // Small dashes

        // Top line
        ctx.beginPath();
        ctx.moveTo(x + cornerLength, y);
        ctx.lineTo(x + width - cornerLength, y);
        ctx.stroke();

        // Bottom line
        ctx.beginPath();
        ctx.moveTo(x + cornerLength, y + height);
        ctx.lineTo(x + width - cornerLength, y + height);
        ctx.stroke();

        // Left line
        ctx.beginPath();
        ctx.moveTo(x, y + cornerLength);
        ctx.lineTo(x, y + height - cornerLength);
        ctx.stroke();

        // Right line
        ctx.beginPath();
        ctx.moveTo(x + width, y + cornerLength);
        ctx.lineTo(x + width, y + height - cornerLength);
        ctx.stroke();

        ctx.restore();
    }
}