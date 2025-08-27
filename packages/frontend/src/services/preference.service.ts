/* FILE: packages/frontend/src/services/preference.service.ts */
import {
  LOCAL_STORAGE_KEYS_CORE_PREFS,
  DEFAULT_LANGUAGE,
  DEFAULT_THEME_PREFERENCE,
  DEFAULT_PROCESSING_WIDTH,
  DEFAULT_NUM_HANDS_PREFERENCE,
  DEFAULT_SHOW_HAND_LANDMARKS,
  DEFAULT_SHOW_POSE_LANDMARKS,
} from '#frontend/constants/app-defaults.js';

import { secureStorage } from '#shared/services/security-utils.js';

import type { ThemePreference } from '#frontend/types/index.js';

export type PreferenceKey = keyof typeof LOCAL_STORAGE_KEYS_CORE_PREFS;
export type PreferenceValue<K extends PreferenceKey> = K extends 'themePreference'
  ? ThemePreference
  : K extends 'languagePreference'
  ? string
  : K extends 'showHandLandmarks' | 'showPoseLandmarks'
  ? boolean
  : number;

const DEFAULTS: { [K in PreferenceKey]: PreferenceValue<K> } = {
  numHandsPreference: DEFAULT_NUM_HANDS_PREFERENCE,
  processingResolutionWidthPreference: DEFAULT_PROCESSING_WIDTH,
  languagePreference: DEFAULT_LANGUAGE,
  themePreference: DEFAULT_THEME_PREFERENCE,
  showHandLandmarks: DEFAULT_SHOW_HAND_LANDMARKS,
  showPoseLandmarks: DEFAULT_SHOW_POSE_LANDMARKS,
};

export class PreferenceService {
  get<K extends PreferenceKey>(key: K): PreferenceValue<K> {
    try {
      const storedValue = secureStorage.get(LOCAL_STORAGE_KEYS_CORE_PREFS[key]);
      if (storedValue === null || storedValue === undefined) {
        return DEFAULTS[key];
      }
      return storedValue as PreferenceValue<K>;
    } catch (error) {
      console.error(
        `[PreferenceService] Error getting preference for key "${key}":`,
        error
      );
      return DEFAULTS[key];
    }
  }

  set<K extends PreferenceKey>(key: K, value: PreferenceValue<K>): void {
    try {
      secureStorage.set(LOCAL_STORAGE_KEYS_CORE_PREFS[key], value);
    } catch (error) {
      console.error(
        `[PreferenceService] Error setting preference for key "${key}":`,
        error
      );
    }
  }
}