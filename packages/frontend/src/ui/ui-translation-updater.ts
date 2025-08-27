/* FILE: packages/frontend/src/ui/ui-translation-updater.ts */
// Utility for updating UI elements with translated text, supporting various attributes.
import { translate } from "#shared/services/translations.js";

// Enhanced config for more flexible attribute setting
export interface TranslationAttributeConfig {
  key: string; // Translation key
  substitutions?: Record<string, string | number | undefined | null>;
  attribute: string; // DOM attribute to set (e.g., 'title', 'aria-label', 'placeholder')
  defaultValue?: string;
}

export interface TranslationTextContentConfig {
  key: string; // Translation key
  substitutions?: Record<string, string | number | undefined | null>;
  mode?: "textContent" | "innerHTML"; // Defaults to textContent
  defaultValue?: string;
}

export type TranslationConfig =
  | string
  | TranslationAttributeConfig
  | TranslationTextContentConfig;

// A single item to be translated
export interface TranslationConfigItem {
  element: HTMLElement | null | undefined;
  config: TranslationConfig;
}

// For mapping multiple configurations to a single element
export interface MultiTranslationConfigItem {
  element: HTMLElement | null | undefined;
  configs: TranslationConfig[];
}

/**
 * Updates translations for a given set of elements and their configurations.
 * Can now handle a mix of simple key strings, attribute configs, and text content configs.
 * @param {Array<TranslationConfigItem | MultiTranslationConfigItem>} items -
 *        An array of items, where each item specifies an element and its translation config(s).
 */
export function updateTranslationsForComponent(
  items: Array<TranslationConfigItem | MultiTranslationConfigItem>
): void {
  if (!Array.isArray(items)) {
    console.warn("[TranslationUpdater] Invalid items array provided.");
    return;
  }

  items.forEach((item) => {
    if (!item || !item.element) return;

    if ("configs" in item && Array.isArray(item.configs)) {
      // Handle MultiTranslationConfigItem
      item.configs.forEach((config) => applyTranslation(item.element, config));
    } else if ("config" in item && item.config) {
      // Handle TranslationConfigItem
      applyTranslation(item.element, item.config);
    }
  });
}

/**
 * Applies a single translation to an element based on the provided configuration.
 */
function applyTranslation(
  element: HTMLElement | null | undefined,
  config: TranslationConfig
): void {
  if (!element) return;

  let translationKey: string;
  let substitutions: Record<string, string | number | undefined | null> = {};
  let attributeToSet: string | null = null;
  let mode: "textContent" | "innerHTML" = "textContent";
  let defaultValue: string | undefined;

  if (typeof config === "string") {
    translationKey = config;
    attributeToSet = "textContent";
  } else if (typeof config === "object" && config !== null) {
    translationKey = config.key;
    substitutions = config.substitutions || {};
    defaultValue = config.defaultValue;
    if ("attribute" in config && config.attribute) {
      attributeToSet = config.attribute;
    } else if ("mode" in config && config.mode) {
      mode = config.mode;
      attributeToSet = null;
    } else {
      attributeToSet = "textContent";
    }
  } else {
    return;
  }

  if (!translationKey) return;

  if (defaultValue !== undefined && substitutions.defaultValue === undefined) {
    substitutions.defaultValue = defaultValue;
  }

  const translatedText = translate(translationKey, substitutions);

  try {
    if (attributeToSet) {
      if (
        attributeToSet === "placeholder" &&
        !(
          element instanceof HTMLInputElement ||
          element instanceof HTMLTextAreaElement
        )
      ) {
        return;
      }
      if (attributeToSet.toLowerCase() === "textcontent") {
        element.textContent = translatedText;
      } else {
        element.setAttribute(attributeToSet, translatedText);
      }
    } else {
      if (mode === "innerHTML") {
        element.innerHTML = translatedText; // Use with caution, only if HTML is intended
      } else {
        // Default to textContent
        element.textContent = translatedText;
      }
    }
  } catch (e: unknown) {
    console.warn(
      `[TranslationUpdater] Error setting translation for key "${translationKey}" on element:`,
      element,
      e
    );
  }
}
