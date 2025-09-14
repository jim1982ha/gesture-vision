/* FILE: packages/frontend/src/ui/helpers/index.ts */
// Barrel file for exporting all UI helper utilities.

import { GESTURE_CATEGORY_ICONS, BUILT_IN_HAND_GESTURES, type GestureCategoryIconType, type CustomGestureMetadata, type PluginManifest } from '#shared/index.js';
import { createFromTemplate } from "#frontend/ui/utils/template-renderer.js";
import type { Substitutions } from '#shared/services/translations.js';
export { renderFormFields, createFormField } from './form-renderer.js';

// --- Type Alias for Translation Function ---
type TranslateFn = (key: string, substitutions?: Substitutions) => string;

// --- From ui-dom-helpers.ts ---
export function clsx(...classes: (string | boolean | undefined | null)[]): string {
  return classes.filter(Boolean).join(' ');
}

export function toggleElementClass(
  element: HTMLElement | null | undefined,
  className: string,
  force?: boolean
): void {
  if (!element || !className) return;
  element.classList.toggle(className, force);
}

export function setElementVisibility(
  element: HTMLElement | null | undefined,
  isVisible: boolean
): void {
  if (!element) return;
  element.classList.toggle('hidden', !isVisible);
}

export function updateButtonToggleActiveState(
  buttonElement: HTMLButtonElement | null | undefined,
  isActive: boolean,
  isDisabled = false
): void {
  if (!buttonElement) return;

  buttonElement.classList.toggle('btn-toggled', isActive && !isDisabled);
  buttonElement.disabled = isDisabled;

  const role = buttonElement.getAttribute('role');
  if (role === 'menuitemradio' || role === 'radio' || role === 'menuitemcheckbox' || role === 'switch') {
    buttonElement.setAttribute('aria-checked', String(isActive && !isDisabled));
  } else {
    buttonElement.setAttribute('aria-pressed', String(isActive && !isDisabled));
  }
}

export function updateButtonGroupActiveState(
  groupElement: HTMLElement | null | undefined,
  activeValue: string | number | boolean | null | undefined,
  isGroupDisabled = false
): void {
  if (!groupElement) return;
  const buttons =
    groupElement.querySelectorAll<HTMLButtonElement>('button[data-value]');

  buttons.forEach((btn) => {
    const currentButtonValueStr = btn.dataset.value!;
    let isActive = false;

    if (activeValue !== null && activeValue !== undefined) {
      if (typeof activeValue === 'boolean') {
        isActive = currentButtonValueStr === 'true' === activeValue;
      } else {
        isActive = currentButtonValueStr === String(activeValue);
      }
    }
    updateButtonToggleActiveState(btn, isActive, isGroupDisabled);
  });
}

// --- From icon-helpers.ts ---
export function setIcon(
  element: Element | null | undefined,
  iconIdentifier: GestureCategoryIconType | string
): void {
  if (!element) return;
  const iconTarget = element.querySelector<HTMLElement>('.material-icons, .mdi') || (element as HTMLElement);
  if (!iconTarget) return;

  let iconName: string;
  let iconType: 'material-icons' | 'mdi';

  if (iconIdentifier in GESTURE_CATEGORY_ICONS) {
    const details = getGestureCategoryIconDetails(
      iconIdentifier as GestureCategoryIconType
    );
    iconName = details.iconName;
    iconType = details.iconType;
  } else {
    iconName = iconIdentifier;
    iconType = iconName.startsWith('mdi-') ? 'mdi' : 'material-icons';
  }

  const classesToRemove = Array.from(iconTarget.classList).filter(
    (c) => c.startsWith('mdi-') || c === 'mdi' || c === 'material-icons'
  );
  if (classesToRemove.length > 0) iconTarget.classList.remove(...classesToRemove);

  if (iconType === 'mdi') {
    iconTarget.classList.add('mdi', iconName);
    iconTarget.textContent = '';
  } else {
    iconTarget.classList.add('material-icons');
    iconTarget.textContent = iconName;
  }
}

// --- From button-group-renderer.ts ---
export interface ButtonGroupOption {
  value: string; text?: string; textKey?: string; titleKey?: string; iconKey?: GestureCategoryIconType;
}

/**
 * Renders a group of toggle buttons inside a specified container element.
 * NOTE: This function is the primary implementation logic.
 *
 * @param container The HTMLElement to render the buttons into.
 * @param options An array of configuration objects for each button.
 * @param translate The translation function (TranslateFn).
 * @param renderAsHtml If true, the `text` property of options will be treated as raw HTML.
 */
export function renderButtonGroup(
  container: HTMLElement | null | undefined,
  options: Readonly<Array<ButtonGroupOption>>,
  translate: TranslateFn,
  renderAsHtml = false
): void {
  if (!container) return;
  container.innerHTML = "";
  const template = `<button type="button" class="btn btn-secondary" role="radio" data-value="{value}" title="{title}"><span class="material-icons" data-if="hasIcon"></span><span class="toggle-button-text" data-if="hasText" data-html-key="text"></span></button>`;

  options.forEach((opt) => {
    const textToDisplay = opt.textKey ? translate(opt.textKey) : opt.text;
    const title = opt.titleKey
      ? translate(opt.titleKey, { defaultValue: opt.text || opt.value })
      : opt.text || opt.value;
    const el = createFromTemplate(template, {
      value: opt.value,
      title: title,
      hasIcon: !!opt.iconKey,
      hasText: !!textToDisplay,
      text: renderAsHtml ? textToDisplay : undefined,
    });
    if (el) {
        if (opt.iconKey) setIcon(el.querySelector(".material-icons"), opt.iconKey);
        if (textToDisplay && !renderAsHtml) {
            const textSpan = el.querySelector<HTMLElement>('.toggle-button-text');
            if(textSpan) textSpan.textContent = textToDisplay;
        }
        container.appendChild(el);
    }
  });
}

// --- From display-helpers.ts ---
export function formatGestureNameForDisplay(name: string): string {
  if (!name || typeof name !== 'string') return 'Unknown';
  return name.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (char) => char.toUpperCase());
}

export function getGestureCategoryIconDetails(category: GestureCategoryIconType): { iconName: string; iconType: 'material-icons' | 'mdi'; defaultEmoji?: string; } {
  return GESTURE_CATEGORY_ICONS[category] || GESTURE_CATEGORY_ICONS.UNKNOWN;
}

export function getActionIconDetails(manifest?: PluginManifest | null): { iconName: string; iconType: 'mdi' | 'material-icons' } {
  if (manifest?.icon) {
    return { iconName: manifest.icon.name, iconType: manifest.icon.type };
  }
  return { iconName: GESTURE_CATEGORY_ICONS.UI_ACTION.iconName, iconType: 'material-icons' };
}

interface GestureDisplayInfo {
  name: string;
  formattedName: string;
  category: GestureCategoryIconType;
  iconDetails: ReturnType<typeof getGestureCategoryIconDetails>;
}

export function getGestureDisplayInfo(gestureName: string, customMetaList: CustomGestureMetadata[]): GestureDisplayInfo {
  if (!gestureName || typeof gestureName !== 'string') {
    return { name: 'Unknown', formattedName: 'Unknown', category: 'UNKNOWN', iconDetails: getGestureCategoryIconDetails('UNKNOWN') };
  }
  const normalizedName = gestureName.trim().toUpperCase().replace(/\s+/g, '_');
  const formattedName = formatGestureNameForDisplay(gestureName);
  let category: GestureCategoryIconType = 'UNKNOWN';

  if (BUILT_IN_HAND_GESTURES.includes(normalizedName as typeof BUILT_IN_HAND_GESTURES[number])) {
    category = 'BUILT_IN_HAND';
  } else {
    const meta = customMetaList.find((m) => m.name.trim().toUpperCase().replace(/\s+/g, '_') === normalizedName);
    if (meta) {
      category = meta.type === 'pose' ? 'CUSTOM_POSE' : 'CUSTOM_HAND';
    }
  }
  return { name: gestureName, formattedName, category, iconDetails: getGestureCategoryIconDetails(category) };
}