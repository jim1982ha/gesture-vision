/* FILE: packages/frontend/src/ui/ui-translation-updater.ts */
// Utility for updating UI elements with translated text, supporting various attributes.
import type { TranslationService } from '#frontend/services/translation.service.js';

export interface TranslationAttributeConfig {
  key: string;
  substitutions?: Record<string, string | number | undefined | null>;
  attribute: string;
  defaultValue?: string;
}

export interface TranslationTextContentConfig {
  key: string;
  substitutions?: Record<string, string | number | undefined | null>;
  mode?: "textContent" | "innerHTML";
  defaultValue?: string;
}

export type TranslationConfig =
  | string
  | TranslationAttributeConfig
  | TranslationTextContentConfig;

export interface TranslationConfigItem {
  element: HTMLElement | null | undefined;
  config: TranslationConfig;
  translationService: TranslationService;
}

export interface MultiTranslationConfigItem {
  element: HTMLElement | null | undefined;
  configs: TranslationConfig[];
  translationService: TranslationService;
}

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
      item.configs.forEach((config) => applyTranslation(item.element, config, item.translationService));
    } else if ("config" in item && item.config) {
      applyTranslation(item.element, item.config, item.translationService);
    }
  });
}

function applyTranslation(
  element: HTMLElement | null | undefined,
  config: TranslationConfig,
  translationService: TranslationService
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

  const translatedText = translationService.translate(translationKey, substitutions);

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
        element.innerHTML = translatedText;
      } else {
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