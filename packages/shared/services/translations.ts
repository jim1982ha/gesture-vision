/* FILE: packages/shared/services/translations.ts */
// Provides translation functionality using JSON locale files.
import { secureStorage } from "./security-utils.js"; 
import enTranslations from "../locales/en.json" with { type: "json" };
import frTranslations from "../locales/fr.json" with { type: "json" };
import zhTranslations from "../locales/zh.json" with { type: "json" };

// Define types for better clarity
export type LanguageCode = "en" | "fr" | "zh"; 
export type Translations = {
  [key in LanguageCode]: { [key: string]: string };
};
export type Substitutions = {
  [key: string]: string | number | undefined | null; 
  defaultValue?: string | null; 
};

// Default language
export const defaultLang: LanguageCode = "en";

// Translation dictionary now built from imported JSONs
export const translations: Translations = {
  en: enTranslations as { [key: string]: string },
  fr: frTranslations as { [key: string]: string },
  zh: zhTranslations as { [key: string]: string },
};

const LANG_STORAGE_KEY = "selectedLanguage";

export function getCurrentLanguage(): LanguageCode {
  try {
    const lang = secureStorage.get(LANG_STORAGE_KEY) as LanguageCode | null;
    return lang && translations[lang] ? lang : defaultLang;
  } catch (e) {
    console.error(
      "[Translations] Error reading language from secureStorage:",
      e
    );
    return defaultLang;
  }
}

/**
 * Simple Title Case function
 * @param {string} str Input string
 * @returns {string} Title-cased string
 */
function toTitleCase(str: string): string {
  if (!str) return "";
  return str
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

// Main translation function
export function translate(key: string, substitutions: Substitutions = {}): string {
  const lang = getCurrentLanguage();
  if (!key || typeof key !== "string") {
    console.warn(`[Translate] Invalid translation key provided: ${String(key)}`);
    if (Object.prototype.hasOwnProperty.call(substitutions, "defaultValue")) {
      // Ensure defaultValue is treated as a string if it's not null/undefined
      return String(substitutions.defaultValue ?? `[INVALID_KEY: ${String(key)}]`);
    }
    return `[INVALID_KEY: ${String(key)}]`;
  }

  let text: string | undefined | null = translations[lang]?.[key];

  if (text === undefined) {
    text = translations[defaultLang]?.[key];
  }

  if (
    text === undefined &&
    Object.prototype.hasOwnProperty.call(substitutions, "defaultValue")
  ) {
    // If defaultValue is null, it means we intend an empty string or specific handling for null.
    // Let's return an empty string for null defaultValue to avoid "null" in UI.
    text = substitutions.defaultValue === null ? "" : substitutions.defaultValue;
  }
  else if (text === undefined && key.includes("_")) {
    const titleCasedKey = toTitleCase(key);
    if (
      titleCasedKey &&
      titleCasedKey !== key.toLowerCase() &&
      !translations[lang]?.[titleCasedKey] &&
      !translations[defaultLang]?.[titleCasedKey]
    ) {
      text = titleCasedKey;
    }
  }

  if (text === undefined) {
    text = `[${key}]`;
  }

  if (text === null) return ""; // Return empty string if the resolved text is explicitly null

  try {
    if (typeof text !== "string") {
      text = String(text);
    }
    text = text.replace(/\{\{([\w.]+)}}/g, (match, placeholder: string) => {
      // Check if substitution exists and is not undefined. If it's null, it might be intended.
      const subValue = substitutions[placeholder];
      return subValue !== undefined ? String(subValue) : match;
    });
  } catch (e) {
    console.error(
      `[Translate] Error applying substitutions to key "${key}" (Text: "${text}"):`,
      e
    );
  }
  return text;
}