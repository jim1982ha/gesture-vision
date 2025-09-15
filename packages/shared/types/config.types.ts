/* FILE: packages/shared/types/config.types.ts */
import type { ActionConfig } from './plugin.types.js';

export interface RoiConfig {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface RtspSourceConfig {
  name: string;
  url: string;
  sourceOnDemand?: boolean;
  roi?: RoiConfig;
}

export interface GestureConfig {
  gesture: string;
  confidence: number;
  duration: number;
  actionConfig: ActionConfig | null;
}

export interface PoseConfig {
  pose: string;
  duration: number;
  actionConfig: ActionConfig | null;
  confidence?: number;
}

// This represents the user-facing config file, where some values can be optional.
export interface FullConfiguration {
  globalCooldown: number;
  rtspSources: RtspSourceConfig[];
  gestureConfigs: (GestureConfig | PoseConfig)[];
  targetFpsPreference: 24 | 30 | 60;
  telemetryEnabled?: boolean;
  enableCustomHandGestures: boolean;
  enablePoseProcessing: boolean;
  enableBuiltInHandGestures: boolean;
  lowLightBrightness?: number;
  lowLightContrast?: number;
  handDetectionConfidence?: number;
  handPresenceConfidence?: number;
  handTrackingConfidence?: number;
  poseDetectionConfidence?: number;
  posePresenceConfidence?: number;
  poseTrackingConfidence?: number;
  _migrationVersion?: number;
}

// This represents the complete, sanitized configuration object used internally by the app, with all optional values filled in.
export type SanitizedFullConfiguration = Required<FullConfiguration>;