/* FILE: packages/frontend/src/ui/helpers/display-helpers.ts */
// UI utility functions related to displaying gesture and action information.

import {
  GESTURE_CATEGORY_ICONS,
  BUILT_IN_HAND_GESTURES,
  type GestureCategoryIconType,
} from '#shared/constants/index.js';
import type { CustomGestureMetadata } from '#shared/types/index.js';

/**
 * Formats an internal gesture name (e.g., 'POINTING_UP') into a user-friendly
 * display name (e.g., 'Pointing Up').
 * @param name - The internal gesture name.
 * @returns The formatted, title-cased name.
 */
export function formatGestureNameForDisplay(name: string): string {
  if (!name || typeof name !== 'string') return 'Unknown';
  return name
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

/**
 * Gets standardized icon details (name, type, emoji) for a given gesture category.
 * @param category - The category of the gesture.
 * @returns An object containing the icon details.
 */
export function getGestureCategoryIconDetails(
  category: GestureCategoryIconType
): {
  iconName: string;
  iconType: 'material-icons' | 'mdi';
  defaultEmoji?: string;
} {
  return GESTURE_CATEGORY_ICONS[category] || GESTURE_CATEGORY_ICONS.UNKNOWN;
}

/**
 * Gets the icon details for a plugin action, falling back to a default icon.
 * @param manifest - The plugin's manifest file.
 * @returns An object containing the icon name and type.
 */
export function getActionIconDetails(manifest?: {
  icon?: { type: 'material-icons' | 'mdi'; name: string };
} | null): { iconName: string; iconType: 'mdi' | 'material-icons' } {
  if (manifest?.icon) {
    return { iconName: manifest.icon.name, iconType: manifest.icon.type };
  }
  return { iconName: 'send', iconType: 'material-icons' };
}

interface GestureDisplayInfo {
  name: string;
  formattedName: string;
  category: GestureCategoryIconType;
  iconDetails: ReturnType<typeof getGestureCategoryIconDetails>;
}

/**
 * Derives comprehensive display information for a gesture from its name.
 * @param gestureName - The internal name of the gesture.
 * @param customMetaList - A list of metadata for all loaded custom gestures.
 * @returns An object containing the original name, formatted name, category, and icon details.
 */
export function getGestureDisplayInfo(
  gestureName: string,
  customMetaList: CustomGestureMetadata[]
): GestureDisplayInfo {
  if (!gestureName || typeof gestureName !== 'string') {
    const unknownIconDetails = getGestureCategoryIconDetails('UNKNOWN');
    return {
      name: 'Unknown',
      formattedName: 'Unknown',
      category: 'UNKNOWN',
      iconDetails: unknownIconDetails,
    };
  }
  const normalizedName = gestureName.trim().toUpperCase().replace(/\s+/g, '_');
  const formattedName = formatGestureNameForDisplay(gestureName);
  let category: GestureCategoryIconType = 'UNKNOWN';

  if (
    BUILT_IN_HAND_GESTURES.includes(
      normalizedName as (typeof BUILT_IN_HAND_GESTURES)[number]
    )
  ) {
    category = 'BUILT_IN_HAND';
  } else {
    const meta = customMetaList.find(
      (m) => m.name.trim().toUpperCase().replace(/\s+/g, '_') === normalizedName
    );
    if (meta) {
      category = meta.type === 'pose' ? 'CUSTOM_POSE' : 'CUSTOM_HAND';
    }
  }
  return {
    name: gestureName,
    formattedName,
    category,
    iconDetails: getGestureCategoryIconDetails(category),
  };
}