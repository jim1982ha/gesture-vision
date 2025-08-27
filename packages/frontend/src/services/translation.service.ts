/* FILE: packages/frontend/src/services/translation.service.ts */
// Provides translation functionality using JSON locale files.
import { translations, type LanguageCode } from '#shared/services/translations.js';
import type { PluginManifest } from '#shared/types/index.js';

export class TranslationService {
    #isInitialized = false;
    #initializationPromise: Promise<void>;
    #resolveInitialization: () => void = () => {};

    constructor() {
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
        
        // No initial fetch needed, will be populated by PluginUIService
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
                        translations[lang as LanguageCode] = {};
                    }
                    Object.assign(translations[lang as LanguageCode], manifest.locales[lang]);
                }
            }
        }
    }
}