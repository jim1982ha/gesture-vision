/* FILE: packages/frontend/src/services/translation.service.ts */
// Provides translation functionality by wrapping the pure translate utility with the current language state.
import { translations, defaultLang, translate as translateUtil, type LanguageCode, type Substitutions, type Translations } from '#shared/services/translations.js';
import type { PluginManifest } from '#shared/index.js';
import type { AppStore } from '#frontend/core/state/app-store.js';

export type { Substitutions };

export class TranslationService {
    #isInitialized = false;
    #initializationPromise: Promise<void>;
    #resolveInitialization: () => void = () => {};
    #appStore: AppStore;

    constructor(appStore: AppStore) {
        this.#appStore = appStore;
        this.#initializationPromise = new Promise(resolve => {
            this.#resolveInitialization = resolve;
        });
        this.#initialize();
    }

    public waitUntilInitialized(): Promise<void> {
        return this.#initializationPromise;
    }
    
    async #initialize(): Promise<void> {
        if (this.#isInitialized) return;
        this.#isInitialized = true;
        this.#resolveInitialization();
    }

    public mergePluginTranslations(manifests: PluginManifest[]): void {
        if (!manifests) return;
        for (const manifest of manifests) {
            if (!manifest.locales) continue;
            for (const lang in manifest.locales) {
                if (Object.prototype.hasOwnProperty.call(manifest.locales, lang)) {
                    if (!translations[lang as LanguageCode]) {
                        (translations as Translations)[lang as LanguageCode] = {};
                    }
                    Object.assign(translations[lang as LanguageCode], manifest.locales[lang]);
                }
            }
        }
    }

    /**
     * Gets the current language from the application state.
     * This is defined as an arrow function to ensure 'this' is always correctly bound.
     */
    public getCurrentLanguage = (): LanguageCode => {
        return (this.#appStore.getState().languagePreference as LanguageCode) || defaultLang;
    }

    /**
     * Translates a given key using the current application language.
     * This method is bound to the instance, so it can be passed as a callback.
     * @param key The translation key.
     * @param substitutions Optional values to replace placeholders in the translation string.
     * @returns The translated string.
     */
    public translate = (key: string, substitutions: Substitutions = {}): string => {
        return translateUtil(this.getCurrentLanguage(), key, substitutions);
    }
}