/* FILE: packages/frontend/src/constants/processing.constants.ts */
// Constants related to gesture and video processing parameters.

import type { RoiConfig } from '#shared/index.js';

export const MIN_FRAME_INTERVAL_MS = Math.round(1000 / 60); // Allow up to 60fps
export const MAX_FRAME_INTERVAL_MS = Math.round(1000 / 5);
export const TARGET_PROCESSING_TIME_FACTOR = 1.0;
export const DEFAULT_ROI: RoiConfig = { x: 0, y: 0, width: 100, height: 100 };
export const DEFAULT_PROCESSING_WIDTH = 640;