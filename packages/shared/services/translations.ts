/* FILE: packages/shared/services/translations.ts */
// Provides translation data, types, and a pure translation utility function.
import enTranslations from "../locales/en.json" with { type: "json" };
import frTranslations from "../locales/fr.json" with { type: "json" };
import zhTranslations from "../locales/zh.json" with { type: "json" };

export type LanguageCode = "en" | "fr" | "zh"; 
export type Translations = {
  [key in LanguageCode]: { [key: string]: string };
};
export type Substitutions = {
  [key: string]: string | number | undefined | null; 
  defaultValue?: string | null; 
};

export const defaultLang: LanguageCode = "en";

export const translations: Translations = {
  en: enTranslations as { [key: string]: string },
  fr: frTranslations as { [key: string]: string },
  zh: zhTranslations as { [key: string]: string },
};

function toTitleCase(str: string): string {
  if (!str) return "";
  return str.toLowerCase().replace(/_/g, " ").replace(/\s+/g, " ").trim().replace(/\b\w/g, (char) => char.toUpperCase());
}

export function translate(lang: LanguageCode, key: string, substitutions: Substitutions = {}): string {
  if (!key || typeof key !== 'string') {
    if (Object.prototype.hasOwnProperty.call(substitutions, "defaultValue")) {
      return String(substitutions.defaultValue ?? `[INVALID_KEY: ${String(key)}]`);
    }
    return `[INVALID_KEY: ${String(key)}]`;
  }

  let text: string | undefined | null = translations[lang]?.[key] ?? translations[defaultLang]?.[key];

  if (text === undefined && Object.prototype.hasOwnProperty.call(substitutions, "defaultValue")) {
    text = substitutions.defaultValue === null ? "" : substitutions.defaultValue;
  } else if (text === undefined && key.includes("_")) {
    const titleCasedKey = toTitleCase(key);
    if (titleCasedKey && titleCasedKey !== key.toLowerCase() && !translations[lang]?.[titleCasedKey] && !translations[defaultLang]?.[titleCasedKey]) {
      text = titleCasedKey;
    }
  }

  if (text === undefined) text = `[${key}]`;
  if (text === null) return "";

  try {
    if (typeof text !== "string") text = String(text);
    return text.replace(/\{\{([\w.]+)}}/g, (match, placeholder: string) => {
      const subValue = substitutions[placeholder];
      return subValue !== undefined ? String(subValue) : match;
    });
  } catch (e) {
    console.error(`[Translate] Error applying substitutions to key "${key}" (Text: "${text}"):`, e);
    return text;
  }
}