/* FILE: packages/shared/validation/schemas.ts */
import { z } from 'zod';

// --- CORE APPLICATION SCHEMAS ---

export const RoiConfigSchema = z.object({
  x: z.number().min(0).max(100),
  y: z.number().min(0).max(100),
  width: z.number().min(1).max(100),
  height: z.number().min(1).max(100),
}).refine(data => data.x + data.width <= 100, {
  message: "Left Offset + Width cannot exceed 100.", path: ["width"],
}).refine(data => data.y + data.height <= 100, {
  message: "Top Offset + Height cannot exceed 100.", path: ["height"],
});

export const ActionConfigSchema = z.object({
  pluginId: z.string(),
  settings: z.unknown().optional(), 
});

export const RtspSourceConfigSchema = z.object({
  name: z.string().min(1),
  url: z.string().url().refine(val => val.startsWith("rtsp://"), "URL must start with rtsp://"),
  sourceOnDemand: z.boolean().optional(),
  roi: RoiConfigSchema.optional(),
});

export const GestureConfigSchema = z.object({
  gesture: z.string().min(1),
  confidence: z.number().min(0).max(100),
  duration: z.number().positive(),
  actionConfig: ActionConfigSchema.nullable(),
});

export const PoseConfigSchema = z.object({
  pose: z.string().min(1),
  duration: z.number().positive(),
  actionConfig: ActionConfigSchema.nullable(),
  confidence: z.number().min(0).max(100).optional(),
});

const allowedFpsValues = [5, 10, 15, 20, 30] as const;

export const FullConfigurationSchema = z.object({
  globalCooldown: z.number().min(0),
  rtspSources: z.array(RtspSourceConfigSchema),
  gestureConfigs: z.array(z.union([GestureConfigSchema, PoseConfigSchema])),
  targetFpsPreference: z.coerce.number().refine((val) => allowedFpsValues.includes(val as typeof allowedFpsValues[number]), {
    message: `Target FPS must be one of: ${allowedFpsValues.join(', ')}`,
  }),
  telemetryEnabled: z.boolean().optional(),
  enableCustomHandGestures: z.boolean(),
  enablePoseProcessing: z.boolean(),
  enableBuiltInHandGestures: z.boolean(),
  lowLightBrightness: z.number().min(0).max(5000).optional(),
  lowLightContrast: z.number().min(0).max(5000).optional(),
  // New tuning parameters
  handDetectionConfidence: z.number().min(0.1).max(0.9).optional(),
  handPresenceConfidence: z.number().min(0.1).max(0.9).optional(),
  handTrackingConfidence: z.number().min(0.1).max(0.9).optional(),
  poseDetectionConfidence: z.number().min(0.1).max(0.9).optional(),
  posePresenceConfidence: z.number().min(0.1).max(0.9).optional(),
  poseTrackingConfidence: z.number().min(0.1).max(0.9).optional(),
  _migrationVersion: z.number().optional(),
});