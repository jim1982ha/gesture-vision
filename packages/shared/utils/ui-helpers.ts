/* FILE: packages/shared/utils/ui-helpers.ts */
// Pure, non-DOM display logic for gestures. Safe for frontend and backend.

import { GESTURE_CATEGORY_ICONS, BUILT_IN_HAND_GESTURES, type GestureCategoryIconType, type CustomGestureMetadata } from '#shared/index.js';

/**
 * Derives comprehensive display information for a gesture from its name.
 * This is a worker-safe function.
 * @param gestureName - The internal name of the gesture.
 * @param customMetaList - A list of metadata for all loaded custom gestures.
 * @returns An object containing the original name, formatted name, category, and icon details.
 */
export function getGestureDisplayInfo(gestureName: string, customMetaList: CustomGestureMetadata[]): { name: string; formattedName: string; category: GestureCategoryIconType; iconDetails: { iconName: string; iconType: string; defaultEmoji?: string; }; } {
  if (!gestureName || typeof gestureName !== 'string') {
    const unknownIconDetails = GESTURE_CATEGORY_ICONS.UNKNOWN;
    return { name: 'Unknown', formattedName: 'Unknown', category: 'UNKNOWN', iconDetails: unknownIconDetails };
  }

  const formattedName = formatGestureNameForDisplay(gestureName);
  let category: GestureCategoryIconType = 'UNKNOWN';

  const isBuiltIn = (BUILT_IN_HAND_GESTURES as readonly string[]).includes(gestureName.toUpperCase().replace(/\s+/g, '_'));
  if (isBuiltIn) {
    category = 'BUILT_IN_HAND';
  } else {
    const meta = customMetaList.find((m) => m.name === gestureName);
    if (meta) {
      category = meta.type === 'pose' ? 'CUSTOM_POSE' : 'CUSTOM_HAND';
    }
  }

  return { name: gestureName, formattedName, category, iconDetails: GESTURE_CATEGORY_ICONS[category] || GESTURE_CATEGORY_ICONS.UNKNOWN };
}

/**
 * Formats an internal gesture name (e.g., 'POINTING_UP') into a user-friendly display name (e.g., 'Pointing Up').
 * This is a worker-safe function.
 * @param name - The internal gesture name.
 * @returns The formatted, title-cased name.
 */
export function formatGestureNameForDisplay(name: string): string {
  if (!name || typeof name !== 'string') return 'Unknown';
  if ((BUILT_IN_HAND_GESTURES as readonly string[]).includes(name)) {
      return name
        .replace(/_/g, ' ')
        .toLowerCase()
        .replace(/\b\w/g, (char) => char.toUpperCase());
  }
  return name;
}