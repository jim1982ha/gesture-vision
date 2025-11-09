/* FILE: packages/frontend/src/ui/helpers/ui-helpers.ts */
import { GESTURE_CATEGORY_ICONS, type GestureCategoryIconType } from '#shared/index.js';
import type { Substitutions } from '#shared/services/translations.js';
import type { TranslationService } from '#frontend/services/translation.service.js';

// Re-export pure helpers from shared package
export { getGestureDisplayInfo, formatGestureNameForDisplay } from '#shared/utils/ui-helpers.js';

type TranslateFn = (key: string, substitutions?: Substitutions) => string;

// --- DOM & Class Utilities ---

/**
 * A tiny utility for conditionally joining class names together.
 * @param classes - The classes to join.
 * @returns The final class string.
 */
export function clsx(...classes: (string | boolean | undefined | null)[]): string {
  return classes.filter(Boolean).join(' ');
}

// --- Icon & Display Utilities (DOM-Dependent) ---

/**
 * A centralized and robust utility to set an icon on an element.
 * @param element - The HTML element that contains the icon, or is the icon itself.
 * @param iconIdentifier - A key from GESTURE_CATEGORY_ICONS (e.g., 'UI_SAVE') or a raw icon name string.
 */
export function setIcon(element: Element | null | undefined, iconIdentifier: GestureCategoryIconType | string): void {
  if (!element) return;

  const iconTargetElement =
    element.querySelector<HTMLElement>('.material-icons, .mdi, .material-symbols-outlined') || (element as HTMLElement);
  if (!iconTargetElement) return;

  let iconName: string;
  let iconType: 'material-icons' | 'mdi' | 'material-symbols-outlined';

  if (iconIdentifier in GESTURE_CATEGORY_ICONS) {
    const iconDetails = GESTURE_CATEGORY_ICONS[iconIdentifier as GestureCategoryIconType];
    iconName = iconDetails.iconName;
    iconType = iconDetails.iconType as 'material-icons' | 'mdi' | 'material-symbols-outlined';
  } else {
    iconName = iconIdentifier;
    iconType = iconName.startsWith('mdi-') ? 'mdi' : 'material-icons';
  }

  const classesToRemove = Array.from(iconTargetElement.classList).filter(
    (c) => c.startsWith('mdi-') || c === 'mdi' || c === 'material-icons' || c === 'material-symbols-outlined'
  );
  if (classesToRemove.length > 0) iconTargetElement.classList.remove(...classesToRemove);

  if (iconType === 'mdi') {
    iconTargetElement.classList.add('mdi', iconName);
    iconTargetElement.textContent = '';
  } else if (iconType === 'material-symbols-outlined') {
    iconTargetElement.classList.add('material-symbols-outlined');
    iconTargetElement.textContent = iconName;
  } else {
    iconTargetElement.classList.add('material-icons');
    iconTargetElement.textContent = iconName;
  }
}

/**
 * Gets standardized icon details (name, type, emoji) for a given gesture category.
 * @param category - The category of the gesture.
 * @returns An object containing the icon details.
 */
export function getGestureCategoryIconDetails(category: GestureCategoryIconType): { iconName: string; iconType: string; defaultEmoji?: string; } {
  return GESTURE_CATEGORY_ICONS[category] || GESTURE_CATEGORY_ICONS.UNKNOWN;
}

// --- Imperative DOM Element Creation Utilities ---

export interface ButtonConfig {
    id?: string;
    action?: string;
    value?: string;
    title?: string;
    titleKey?: string;
    titleSubstitutions?: Substitutions;
    iconKey?: string;
    extraClasses?: string[];
    pluginId?: string;
    text?: string;
    textKey?: string;
    translate: TranslateFn;
}

export function createButton(config: ButtonConfig): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    const translate = config.translate;

    if (config.id) button.id = config.id;
    if (config.action) button.dataset.action = config.action;
    if (config.pluginId) button.dataset.pluginId = config.pluginId;
    if (config.value) button.dataset.value = config.value;

    const hasText = !!(config.text || config.textKey);
    const finalClasses = clsx("btn", !hasText && "btn-icon", ...(config.extraClasses || []));
    button.className = finalClasses;

    const titleSubstitutions = { ...(config.titleSubstitutions || {}) };
    const title = config.title || (config.titleKey ? translate(config.titleKey, titleSubstitutions) : '');
    button.title = title;
    button.setAttribute('aria-label', title);
    
    let innerHTML = `<span class="btn-icon-span"></span>`;
    if (hasText) {
        const textContent = config.text || (config.textKey ? translate(config.textKey) : '');
        innerHTML += `<span class="btn-text-span">${textContent}</span>`;
    }
    button.innerHTML = innerHTML;

    const iconSpan = button.querySelector('.btn-icon-span');
    if (iconSpan && config.iconKey) setIcon(iconSpan, config.iconKey);
    
    return button;
}

export interface ButtonGroupOption {
    value: string | number | boolean;
    text?: string;
    textKey?: string;
    titleKey?: string;
    iconKey: GestureCategoryIconType | string;
}

export function renderButtonGroup(
  container: HTMLElement | null | undefined,
  options: Readonly<Array<ButtonGroupOption>>,
  translationService: TranslationService
): void {
  if (!container) return;
  container.innerHTML = "";
  options.forEach((opt: ButtonGroupOption) => {
    const button = createButton({
        action: 'toggle',
        value: String(opt.value),
        titleKey: opt.titleKey,
        iconKey: opt.iconKey,
        textKey: opt.textKey,
        text: opt.text,
        extraClasses: ['btn-secondary'],
        translate: translationService.translate,
    });
    button.setAttribute('role', 'radio');
    container.appendChild(button);
  });
}