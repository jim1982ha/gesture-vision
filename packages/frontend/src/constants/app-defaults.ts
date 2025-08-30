/* FILE: packages/frontend/src/constants/app-defaults.ts */
// Centralized default values and constants for the frontend application.

import type { RoiConfig, FullConfiguration } from '#shared/index.js';
import type { ThemePreference } from '#frontend/types/index.js';
import type { LanguageCode } from '#shared/services/translations.js';

// --- Gesture Processing & Video ---
export const DEFAULT_TARGET_FPS: FullConfiguration['targetFpsPreference'] = 15;
export const MIN_FRAME_INTERVAL_MS = Math.round(1000 / 30);
export const MAX_FRAME_INTERVAL_MS = Math.round(1000 / 5);
export const TARGET_PROCESSING_TIME_FACTOR = 1.0;
export const DEFAULT_ROI: RoiConfig = { x: 0, y: 0, width: 100, height: 100 };
export const DEFAULT_PROCESSING_WIDTH = 640;

// --- Core Application Configuration Defaults ---
export const DEFAULT_GLOBAL_COOLDOWN: FullConfiguration['globalCooldown'] = 2.0;
export const DEFAULT_TELEMETRY_ENABLED: FullConfiguration['telemetryEnabled'] = false;
export const DEFAULT_ENABLE_CUSTOM_HAND_GESTURES: FullConfiguration['enableCustomHandGestures'] = false;
export const DEFAULT_ENABLE_POSE_PROCESSING: FullConfiguration['enablePoseProcessing'] = false;
export const DEFAULT_ENABLE_BUILT_IN_HAND_GESTURES: FullConfiguration['enableBuiltInHandGestures'] = true;
export const DEFAULT_LOW_LIGHT_BRIGHTNESS: FullConfiguration['lowLightBrightness'] = 100;
export const DEFAULT_LOW_LIGHT_CONTRAST: FullConfiguration['lowLightContrast'] = 100;
export const DEFAULT_HAND_DETECTION_CONFIDENCE: FullConfiguration['handDetectionConfidence'] = 0.5;
export const DEFAULT_HAND_PRESENCE_CONFIDENCE: FullConfiguration['handPresenceConfidence'] = 0.5;
export const DEFAULT_HAND_TRACKING_CONFIDENCE: FullConfiguration['handTrackingConfidence'] = 0.4;
export const DEFAULT_POSE_DETECTION_CONFIDENCE: FullConfiguration['poseDetectionConfidence'] = 0.5;
export const DEFAULT_POSE_PRESENCE_CONFIDENCE: FullConfiguration['posePresenceConfidence'] = 0.5;
export const DEFAULT_POSE_TRACKING_CONFIDENCE: FullConfiguration['poseTrackingConfidence'] = 0.4;

// --- Core UI & Application Preferences ---
export const DEFAULT_LANGUAGE: LanguageCode = 'en';
export const DEFAULT_THEME_BASE_ID: string = 'main';
export const DEFAULT_THEME_MODE: ThemePreference['mode'] = 'system';
export const DEFAULT_THEME_PREFERENCE: ThemePreference = { base: DEFAULT_THEME_BASE_ID, mode: DEFAULT_THEME_MODE };
export const SIDEBAR_AUTO_HIDE_DELAY_MS = 2000;
export const DEFAULT_NUM_HANDS_PREFERENCE = 1;
export const DEFAULT_SHOW_HAND_LANDMARKS = false;
export const DEFAULT_SHOW_POSE_LANDMARKS = false;

// --- Form Defaults & Special Values ---
export const DEFAULT_GESTURE_SELECT_VALUE = 'NONE';
export const DEFAULT_GESTURE_CONFIDENCE = 50;
export const DEFAULT_GESTURE_DURATION_S = 1.0;
export const DEFAULT_ACTION_PLUGIN_ID_NONE = 'none';
export const DEFAULT_WEBCAM_FACING_MODE: 'user' | 'environment' = 'user';
export const MOBILE_WEBCAM_PLACEHOLDER_ID = 'webcam:mobile_default';

// --- Local Storage Keys ---
export const STORAGE_KEY_SELECTED_CAMERA_SOURCE = 'selectedCameraSource';
export const STORAGE_KEY_MIRROR_STATE_PER_SOURCE = 'mirrorStatePerSource';
export const STORAGE_KEY_LAST_WEBCAM_ID = 'lastSelectedWebcamId';
export const LOCAL_STORAGE_KEYS_CORE_PREFS = {
  numHandsPreference: 'numHandsPreference',
  processingResolutionWidthPreference: 'processingResolutionWidthPreference',
  languagePreference: 'selectedLanguage',
  themePreference: 'themePreference',
  showHandLandmarks: 'showHandLandmarksPreference',
  showPoseLandmarks: 'showPoseLandmarksPreference',
};

// --- History Service ---
export const MAX_HISTORY_ITEMS = 50;