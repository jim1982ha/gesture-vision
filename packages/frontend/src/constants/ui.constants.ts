/* FILE: packages/frontend/src/constants/ui.constants.ts */
// Constants for UI defaults, preferences, and behavior.

import type { ThemePreference } from '#frontend/types/index.js';
import type { LanguageCode } from '#shared/services/translations.js';

// --- Core UI & Application Preferences ---
export const DEFAULT_LANGUAGE: LanguageCode = 'en';
export const DEFAULT_THEME_BASE_ID = 'main';
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

// --- History Service ---
export const MAX_HISTORY_ITEMS = 50;