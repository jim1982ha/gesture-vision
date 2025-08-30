/* FILE: packages/frontend/src/ui/helpers/icon-helpers.ts */
import { GESTURE_CATEGORY_ICONS, type GestureCategoryIconType } from '#shared/index.js';
import { getGestureCategoryIconDetails } from '#frontend/ui/helpers/display-helpers.js';

/**
 * A centralized and robust utility to set an icon on an element.
 * It intelligently handles both predefined keys from GESTURE_CATEGORY_ICONS
 * and raw icon name strings (e.g., "dashboard", "mdi-home").
 * @param element - The HTML element that contains the icon, or is the icon itself.
 * @param iconIdentifier - A key from GESTURE_CATEGORY_ICONS (e.g., 'UI_SAVE') or a raw icon name string.
 */
export function setIcon(
  element: Element | null | undefined,
  iconIdentifier: GestureCategoryIconType | string
): void {
  if (!element) return;

  const iconTargetElement =
    element.querySelector<HTMLElement>('.material-icons, .mdi') ||
    (element as HTMLElement);

  if (!iconTargetElement) return;

  let iconName: string;
  let iconType: 'material-icons' | 'mdi';

  if (iconIdentifier in GESTURE_CATEGORY_ICONS) {
    const iconDetails = getGestureCategoryIconDetails(
      iconIdentifier as GestureCategoryIconType
    );
    iconName = iconDetails.iconName;
    iconType = iconDetails.iconType;
  } else {
    iconName = iconIdentifier;
    iconType = iconName.startsWith('mdi-') ? 'mdi' : 'material-icons';
  }

  const classesToRemove = Array.from(iconTargetElement.classList).filter(
    (c) => c.startsWith('mdi-') || c === 'mdi' || c === 'material-icons'
  );
  if (classesToRemove.length > 0) {
    iconTargetElement.classList.remove(...classesToRemove);
  }

  if (iconType === 'mdi') {
    iconTargetElement.classList.add('mdi', iconName);
    iconTargetElement.textContent = '';
  } else {
    iconTargetElement.classList.add('material-icons');
    iconTargetElement.textContent = iconName;
  }
}