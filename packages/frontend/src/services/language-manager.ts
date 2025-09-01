/* FILE: packages/frontend/src/services/language-manager.ts */
import type { AppStore } from '#frontend/core/state/app-store.js';
import {
  translate,
  type LanguageCode,
  translations,
  defaultLang,
} from '#shared/services/translations.js';
import { updateButtonGroupActiveState } from '#frontend/ui/helpers/index.js';

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
  #appStore: AppStore;
  #isInitialized = false;
  #isDropdownOpen = false;
  #unsubscribeStore: () => void;

  #container: HTMLElement | null;
  #dropdownTrigger: HTMLButtonElement | null;
  #dropdownPanel: HTMLElement | null;

  constructor(appStore: AppStore) {
    this.#appStore = appStore;

    this.#container = null;
    this.#dropdownTrigger = null;
    this.#dropdownPanel = null;

    this.#renderTriggerAndPanel();
    this.applyTranslations();

    this.#attachEventListeners();
    this.#unsubscribeStore = this.#appStore.subscribe(
      this.#handleExternalLanguageChange
    );
    this.#isInitialized = true;
  }

  destroy(): void {
    this.#unsubscribeStore();
    document.removeEventListener('click', this.#handleClickOutside);
  }

  #renderTriggerAndPanel(): void {
    const historyButton = document.getElementById("headerHistoryToggle");
    const navControls = historyButton?.closest('.nav-controls');
    if (!navControls || !historyButton || document.getElementById('languageDropdownTrigger')) return;
  
    this.#container = document.createElement('div');
    this.#container.className = 'language-selector-container relative inline-flex';
  
    const trigger = document.createElement('button');
    trigger.id = 'languageDropdownTrigger';
    trigger.className = 'btn header-dropdown-trigger btn-secondary';
    trigger.setAttribute('aria-haspopup', 'true');
    trigger.setAttribute('aria-expanded', 'false');
    trigger.innerHTML = `<span class="lang-icon"></span>`;
    this.#dropdownTrigger = trigger;
  
    const panel = document.createElement('div');
    panel.id = 'languageDropdownPanel';
    panel.className = 'header-dropdown-panel';
    panel.setAttribute('role', 'menu');
    panel.setAttribute('aria-labelledby', 'languageDropdownTrigger');
    this.#dropdownPanel = panel;
  
    this.#container.appendChild(trigger);
    this.#container.appendChild(panel);
  
    navControls.insertBefore(this.#container, historyButton);
  }

  #renderLanguageMenu(): void {
    const panel = this.#dropdownPanel;
    if (!panel) return;
    panel.innerHTML = '';
    LANGUAGE_OPTIONS.forEach((opt) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'btn btn-secondary w-full justify-start';
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
    this.#container?.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      if (target.closest('#languageDropdownTrigger')) {
        this.toggleDropdown();
      } else if (target.closest('button[data-value]')) {
        this.#handleLanguageChange(e as MouseEvent);
      }
    });
    document.addEventListener('click', this.#handleClickOutside);
  }

  #handleExternalLanguageChange = (): void => {
    if (!this.#isInitialized) return;
    document.documentElement.lang = this.getCurrentLanguage();
    this.applyTranslations();
  };

  public toggleDropdown = (): void => {
    this.#isDropdownOpen = !this.#isDropdownOpen;
    const panel = this.#dropdownPanel;
    const trigger = this.#dropdownTrigger;

    if (panel) panel.classList.toggle('visible', this.#isDropdownOpen);
    if (trigger) trigger.setAttribute('aria-expanded', String(this.#isDropdownOpen));
  };

  #handleClickOutside = (event: MouseEvent): void => {
    if (this.#isDropdownOpen && this.#container && !this.#container.contains(event.target as Node)) {
      this.toggleDropdown();
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
      if (this.#isDropdownOpen) this.toggleDropdown();
    }
  };

  #updateUISelect(): void {
    if (!this.#isInitialized) return;
    const currentLang = this.getCurrentLanguage();
    const triggerIcon = this.#dropdownTrigger?.querySelector('.lang-icon');

    if (triggerIcon) {
      const currentLangOption = LANGUAGE_OPTIONS.find(
        (opt) => opt.code === currentLang
      );
      triggerIcon.textContent = currentLangOption?.icon || '🌐';
      if (this.#dropdownTrigger) {
        this.#dropdownTrigger.title = translate(
          currentLangOption?.labelKey || 'language'
        );
      }
    }
    
    updateButtonGroupActiveState(this.#dropdownPanel, currentLang);
  }

  public applyTranslations(): void {
    if (!this.#isInitialized) return;
    this.#renderLanguageMenu();
    this.#updateUISelect();
  }

  public setLanguage(newLanguage: LanguageCode): boolean {
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

  public getCurrentLanguage(): LanguageCode {
    return (
      (this.#appStore.getState().languagePreference as LanguageCode | undefined) ||
      defaultLang
    );
  }

  public isDropdownOpen = (): boolean => this.#isDropdownOpen;
}