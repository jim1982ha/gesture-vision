/* FILE: packages/shared/validation/config.schemas.ts */
import { z } from 'zod';
import { ActionConfigSchema } from './plugin.schemas.js';
import * as DEFAULTS from '../constants/config-defaults.js';

export const RoiConfigSchema = z.object({
  x: z.number().min(0).max(100),
  y: z.number().min(0).max(100),
  width: z.number().min(1).max(100),
  height: z.number().min(1).max(100),
}).refine(data => data.x + data.width <= 100, {
  message: "rtspRoiInvalid", path: ["width"],
}).refine(data => data.y + data.height <= 100, {
  message: "rtspRoiInvalid", path: ["height"],
});
export type RoiConfig = z.infer<typeof RoiConfigSchema>;

export const RtspSourceConfigSchema = z.object({
  name: z.string().min(1),
  url: z.string().url().refine(val => val.startsWith("rtsp://"), "URL must start with rtsp://"),
  sourceOnDemand: z.boolean().optional(),
  roi: RoiConfigSchema.optional(),
});
export type RtspSourceConfig = z.infer<typeof RtspSourceConfigSchema>;

export const GestureConfigSchema = z.object({
  gesture: z.string().min(1),
  confidence: z.number().min(0).max(100),
  duration: z.number().positive(),
  actionConfig: ActionConfigSchema.nullable(),
});
export type GestureConfig = z.infer<typeof GestureConfigSchema>;

export const PoseConfigSchema = z.object({
  pose: z.string().min(1),
  duration: z.number().positive(),
  actionConfig: ActionConfigSchema.nullable(),
  confidence: z.number().min(0).max(100).optional(),
});
export type PoseConfig = z.infer<typeof PoseConfigSchema>;

const allowedFpsValues = [24, 30, 60] as const;

export const FullConfigurationSchema = z.object({
  globalCooldown: z.number().min(0).default(DEFAULTS.DEFAULT_GLOBAL_COOLDOWN),
  rtspSources: z.array(RtspSourceConfigSchema).default([]),
  gestureConfigs: z.array(z.union([GestureConfigSchema, PoseConfigSchema])).default([]),
  targetFpsPreference: z.coerce.number().pipe(z.union([z.literal(24), z.literal(30), z.literal(60)], {
    message: `Target FPS must be one of: ${allowedFpsValues.join(', ')}`,
  })).default(DEFAULTS.DEFAULT_TARGET_FPS),
  telemetryEnabled: z.boolean().default(DEFAULTS.DEFAULT_TELEMETRY_ENABLED),
  enableCustomHandGestures: z.boolean().default(DEFAULTS.DEFAULT_ENABLE_CUSTOM_HAND_GESTURES),
  enablePoseProcessing: z.boolean().default(DEFAULTS.DEFAULT_ENABLE_POSE_PROCESSING),
  enableBuiltInHandGestures: z.boolean().default(DEFAULTS.DEFAULT_ENABLE_BUILT_IN_HAND_GESTURES),
  lowLightBrightness: z.number().min(0).max(5000).default(DEFAULTS.DEFAULT_LOW_LIGHT_BRIGHTNESS),
  lowLightContrast: z.number().min(0).max(5000).default(DEFAULTS.DEFAULT_LOW_LIGHT_CONTRAST),
  handDetectionConfidence: z.number().min(0.1).max(0.9).default(DEFAULTS.DEFAULT_HAND_DETECTION_CONFIDENCE),
  handPresenceConfidence: z.number().min(0.1).max(0.9).default(DEFAULTS.DEFAULT_HAND_PRESENCE_CONFIDENCE),
  handTrackingConfidence: z.number().min(0.1).max(0.9).default(DEFAULTS.DEFAULT_HAND_TRACKING_CONFIDENCE),
  poseDetectionConfidence: z.number().min(0.1).max(0.9).default(DEFAULTS.DEFAULT_POSE_DETECTION_CONFIDENCE),
  posePresenceConfidence: z.number().min(0.1).max(0.9).default(DEFAULTS.DEFAULT_POSE_PRESENCE_CONFIDENCE),
  poseTrackingConfidence: z.number().min(0.1).max(0.9).default(DEFAULTS.DEFAULT_POSE_TRACKING_CONFIDENCE),
  _migrationVersion: z.number().optional(),
});
export type FullConfiguration = z.infer<typeof FullConfigurationSchema>;
// This type is no longer needed as Zod's .default() makes all fields present after parsing.
export type SanitizedFullConfiguration = FullConfiguration;