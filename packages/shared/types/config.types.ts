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

export interface FullConfiguration {
  globalCooldown: number;
  rtspSources: RtspSourceConfig[];
  gestureConfigs: (GestureConfig | PoseConfig)[];
  targetFpsPreference: number;
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