/* FILE: packages/frontend/src/services/language-manager.ts */
import type { AppStore } from '#frontend/core/state/app-store.js';
import { updateButtonGroupActiveState } from '#frontend/ui/helpers/index.js';
import {
  translate,
  type LanguageCode,
  translations,
  defaultLang,
} from '#shared/services/translations.js';

export interface LanguageManagerElements {
  languageSelectGroupHeader: HTMLElement | null;
  mainSettingsToggle: HTMLButtonElement | null;
  mobileLanguageContainer?: HTMLElement | null | undefined;
  mobileLanguageDropdownTrigger?: HTMLButtonElement | null;
  mobileLanguageDropdownPanel?: HTMLElement | null;
}

const LANGUAGE_OPTIONS: Array<{
  code: LanguageCode;
  labelKey: string;
  icon?: string;
}> = [
  { code: 'en', labelKey: 'langEnglish', icon: '🇬🇧' },
  { code: 'fr', labelKey: 'langFrench', icon: '🇫🇷' },
  { code: 'zh', labelKey: 'langChinese', icon: '🇨🇳' },
];

export class LanguageManager {
  #elements: LanguageManagerElements;
  #appStore: AppStore;
  #isInitialized = false;
  #isMobileDropdownOpen = false;
  #unsubscribeStore: () => void;

  constructor(elements: LanguageManagerElements, appStore: AppStore) {
    this.#appStore = appStore;
    this.#elements = elements;

    this.#renderDesktopLanguageButtons();
    this.#renderMobileTriggerAndPanel();
    this.applyTranslations();

    this.#attachEventListeners();
    this.#unsubscribeStore = this.#appStore.subscribe(
      this.#handleExternalLanguageChange
    );
    this.#isInitialized = true;
  }

  destroy(): void {
    this.#unsubscribeStore();
  }

  #renderDesktopLanguageButtons(): void {
    const group = this.#elements.languageSelectGroupHeader;
    if (!group) return;

    group.innerHTML = '';
    LANGUAGE_OPTIONS.forEach((opt) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'btn btn-secondary btn-icon';
      button.dataset.value = opt.code;

      const translatedLabel = translate(opt.labelKey, {
        defaultValue: opt.code.toUpperCase(),
      });
      button.title = translatedLabel;
      button.setAttribute('aria-label', translatedLabel);

      if (opt.icon) {
        const iconSpan = document.createElement('span');
        iconSpan.className = 'lang-icon';
        iconSpan.textContent = opt.icon;
        button.appendChild(iconSpan);
      }

      group.appendChild(button);
    });
  }

  #renderMobileTriggerAndPanel(): void {
    const settingsButton = this.#elements.mainSettingsToggle;
    const navControls = settingsButton?.closest('.nav-controls');

    if (!navControls) return;

    if (document.getElementById('mobileLanguageDropdownTrigger')) return;

    this.#elements.mobileLanguageContainer = document.createElement('div');
    this.#elements.mobileLanguageContainer.className =
      'mobile-language-selector-container mobile-only-inline-flex';

    const trigger = document.createElement('button');
    trigger.id = 'mobileLanguageDropdownTrigger';
    trigger.className = 'btn header-dropdown-trigger btn-secondary';
    trigger.setAttribute('aria-haspopup', 'true');
    trigger.setAttribute('aria-expanded', 'false');
    trigger.innerHTML = `<span class="lang-icon"></span>`;
    this.#elements.mobileLanguageDropdownTrigger = trigger;

    const panel = document.createElement('div');
    panel.id = 'mobileLanguageDropdownPanel';
    panel.className = 'header-dropdown-panel hidden';
    panel.setAttribute('role', 'menu');
    panel.setAttribute('aria-labelledby', 'mobileLanguageDropdownTrigger');
    this.#elements.mobileLanguageDropdownPanel = panel;

    this.#elements.mobileLanguageContainer.appendChild(trigger);
    this.#elements.mobileLanguageContainer.appendChild(panel);
    navControls.insertBefore(
      this.#elements.mobileLanguageContainer,
      settingsButton
    );
  }

  #renderMobileLanguageMenu(): void {
    const panel = this.#elements.mobileLanguageDropdownPanel;
    if (!panel) return;
    panel.innerHTML = '';
    LANGUAGE_OPTIONS.forEach((opt) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'btn btn-secondary';
      button.dataset.value = opt.code;
      button.role = 'menuitemradio';
      const iconSpan = document.createElement('span');
      iconSpan.className = 'lang-icon';
      iconSpan.textContent = opt.icon || '';
      const textSpan = document.createElement('span');
      textSpan.textContent = translate(opt.labelKey, {
        defaultValue: opt.code.toUpperCase(),
      });
      button.appendChild(iconSpan);
      button.appendChild(textSpan);
      panel.appendChild(button);
    });
  }

  #attachEventListeners(): void {
    this.#elements.languageSelectGroupHeader?.addEventListener(
      'click',
      this.#handleLanguageChange
    );
    const navControls = this.#elements.mainSettingsToggle?.closest('.nav-controls');
    navControls?.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      if (target.closest('#mobileLanguageDropdownTrigger'))
        this.#toggleMobileDropdown();
    });
    navControls?.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      if (target.closest('#mobileLanguageDropdownPanel'))
        this.#handleLanguageChange(e as MouseEvent);
    });

    document.addEventListener('click', this.#handleClickOutside);
  }

  #handleExternalLanguageChange = (): void => {
    if (!this.#isInitialized) return;
    document.documentElement.lang = this.getCurrentLanguage();
    this.applyTranslations();
  };

  #toggleMobileDropdown = (): void => {
    this.#isMobileDropdownOpen = !this.#isMobileDropdownOpen;
    const panel = this.#elements.mobileLanguageDropdownPanel;
    const trigger = this.#elements.mobileLanguageDropdownTrigger;

    if (panel && trigger) {
      if (this.#isMobileDropdownOpen) {
        const topAnchor =
          trigger.closest('.top-nav')?.getBoundingClientRect().bottom ??
          trigger.getBoundingClientRect().bottom;
        panel.style.top = `${topAnchor + 4}px`;
        panel.style.left = '50%';
        panel.style.right = 'auto';

        panel.style.setProperty(
          '--dropdown-initial-transform',
          'translateX(-50%) translateY(-10px) scale(0.95)'
        );
        panel.style.setProperty(
          '--dropdown-visible-transform',
          'translateX(-50%) translateY(0) scale(1)'
        );
      }

      panel.classList.toggle('hidden', !this.#isMobileDropdownOpen);
      panel.classList.toggle('visible', this.#isMobileDropdownOpen);
    }

    if (trigger) {
      trigger.setAttribute('aria-expanded', String(this.#isMobileDropdownOpen));
    }
  };

  #handleClickOutside = (event: MouseEvent): void => {
    if (this.#isMobileDropdownOpen) {
      const trigger = this.#elements.mobileLanguageDropdownTrigger;
      const panel = this.#elements.mobileLanguageDropdownPanel;
      if (
        trigger &&
        panel &&
        !trigger.contains(event.target as Node) &&
        !panel.contains(event.target as Node)
      ) {
        this.#toggleMobileDropdown();
      }
    }
  };

  #handleLanguageChange = (event: MouseEvent): void => {
    if (!this.#isInitialized) return;
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>(
      'button[data-value]'
    );
    if (button?.dataset.value) {
      const newLanguage = button.dataset.value as LanguageCode;
      this.setLanguage(newLanguage);
      if (this.#isMobileDropdownOpen) this.#toggleMobileDropdown();
    }
  };

  #updateUISelect(): void {
    if (!this.#isInitialized) return;
    const currentLang = this.getCurrentLanguage();

    if (this.#elements.languageSelectGroupHeader) {
      updateButtonGroupActiveState(
        this.#elements.languageSelectGroupHeader,
        currentLang
      );
    }

    const triggerIcon = this.#elements.mobileLanguageDropdownTrigger?.querySelector(
      '.lang-icon'
    );
    if (triggerIcon) {
      const currentLangOption = LANGUAGE_OPTIONS.find(
        (opt) => opt.code === currentLang
      );
      triggerIcon.textContent = currentLangOption?.icon || '🌐';
      if (this.#elements.mobileLanguageDropdownTrigger) {
        this.#elements.mobileLanguageDropdownTrigger.title = translate(
          currentLangOption?.labelKey || 'language'
        );
      }
    }
    this.#elements.mobileLanguageDropdownPanel
      ?.querySelectorAll('button[data-value]')
      .forEach((btn) => {
        btn.setAttribute(
          'aria-checked',
          String((btn as HTMLButtonElement).dataset.value === currentLang)
        );
      });
  }

  public applyTranslations(): void {
    if (!this.#isInitialized) return;
    this.#renderDesktopLanguageButtons();
    this.#renderMobileLanguageMenu();
    this.#updateUISelect();
  }

  setLanguage(newLanguage: LanguageCode): boolean {
    if (!this.#isInitialized || !translations[newLanguage]) {
      console.warn(
        `[LanguageManager] Attempted to set invalid language or not initialized: ${newLanguage}`
      );
      return false;
    }
    if (newLanguage !== this.getCurrentLanguage()) {
      this.#appStore
        .getState()
        .actions.setLocalPreference('languagePreference', newLanguage);
      return true;
    }
    return false;
  }

  getCurrentLanguage(): LanguageCode {
    return (
      (this.#appStore.getState().languagePreference as LanguageCode | undefined) ||
      defaultLang
    );
  }
}
// --- packages/frontend/src/services/preference.service.ts --- (complete version) ---

/* FILE: packages/frontend/src/services/preference.service.ts */
import {
  LOCAL_STORAGE_KEYS_CORE_PREFS,
  DEFAULT_LANGUAGE,
  DEFAULT_THEME_PREFERENCE,
  DEFAULT_PROCESSING_WIDTH,
  DEFAULT_NUM_HANDS_PREFERENCE,
  DEFAULT_SHOW_HAND_LANDMARKS,
  DEFAULT_SHOW_POSE_LANDMARKS,
} from '#frontend/constants/app-defaults.js';

import { secureStorage } from '#shared/services/security-utils.js';

import type { ThemePreference } from '#frontend/types/index.js';

export type PreferenceKey = keyof typeof LOCAL_STORAGE_KEYS_CORE_PREFS;
export type PreferenceValue<K extends PreferenceKey> = K extends 'themePreference'
  ? ThemePreference
  : K extends 'languagePreference'
  ? string
  : K extends 'showHandLandmarks' | 'showPoseLandmarks'
  ? boolean
  : number;

const DEFAULTS: { [K in PreferenceKey]: PreferenceValue<K> } = {
  numHandsPreference: DEFAULT_NUM_HANDS_PREFERENCE,
  processingResolutionWidthPreference: DEFAULT_PROCESSING_WIDTH,
  languagePreference: DEFAULT_LANGUAGE,
  themePreference: DEFAULT_THEME_PREFERENCE,
  showHandLandmarks: DEFAULT_SHOW_HAND_LANDMARKS,
  showPoseLandmarks: DEFAULT_SHOW_POSE_LANDMARKS,
};

export class PreferenceService {
  get<K extends PreferenceKey>(key: K): PreferenceValue<K> {
    try {
      const storedValue = secureStorage.get(LOCAL_STORAGE_KEYS_CORE_PREFS[key]);
      if (storedValue === null || storedValue === undefined) {
        return DEFAULTS[key];
      }
      return storedValue as PreferenceValue<K>;
    } catch (error) {
      console.error(
        `[PreferenceService] Error getting preference for key "${key}":`,
        error
      );
      return DEFAULTS[key];
    }
  }

  set<K extends PreferenceKey>(key: K, value: PreferenceValue<K>): void {
    try {
      secureStorage.set(LOCAL_STORAGE_KEYS_CORE_PREFS[key], value);
    } catch (error) {
      console.error(
        `[PreferenceService] Error setting preference for key "${key}":`,
        error
      );
    }
  }
}