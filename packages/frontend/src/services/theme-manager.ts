/* FILE: packages/frontend/src/services/theme-manager.ts */
import type { AppStore } from '#frontend/core/state/app-store.js';
import {
  DEFAULT_THEME_BASE_ID,
  DEFAULT_THEME_MODE,
} from '#frontend/constants/app-defaults.js';
import { AVAILABLE_THEMES } from '#frontend/ui/ui-themes.js';
import { pubsub } from '#shared/core/pubsub.js';

import type { ThemePreference } from '#frontend/types/index.js';

function getDefinedBackgroundColor(combinedThemeId: string): string {
  const backgroundColors: Record<string, string> = {
    'main-light': '#ffffff',
    'main-dark': '#121212',
    'ocean-light': '#e0fbfc',
    'ocean-dark': '#03045e',
    'forest-light': '#e8f5e9',
    'forest-dark': '#1b5e20',
    'sunset-light': '#fff8f0',
    'sunset-dark': '#264653',
    default: '#ffffff',
  };
  return backgroundColors[combinedThemeId] || backgroundColors.default;
}

type MediaQueryListWithDeprecatedListeners = MediaQueryList & {
  addListener?: (
    callback: ((this: MediaQueryList, ev: MediaQueryListEvent) => unknown) | null
  ) => void;
  removeListener?: (
    callback: ((this: MediaQueryList, ev: MediaQueryListEvent) => unknown) | null
  ) => void;
};

export default class ThemeManager {
  #availableBaseThemes = AVAILABLE_THEMES;
  #defaultBaseTheme = DEFAULT_THEME_BASE_ID;
  #defaultColorMode: ThemePreference['mode'] = DEFAULT_THEME_MODE;
  #themeMetaTag: HTMLMetaElement | null = null;
  #mediaQueryList: MediaQueryList | null = null;
  #systemThemeChangeHandler: ((event: MediaQueryListEvent) => void) | null = null;
  #appStore: AppStore;
  #unsubscribeStore: () => void;

  constructor(appStore: AppStore) {
    this.#appStore = appStore;
    this.#themeMetaTag = document.getElementById(
      'theme-color-meta'
    ) as HTMLMetaElement | null;
    if (!this.#themeMetaTag) {
      console.warn('[ThemeManager] <meta name="theme-color"> not found.');
    }

    this.#defineSystemThemeHandler();
    this.#setupSystemThemeListener();

    this.#unsubscribeStore = this.#appStore.subscribe(
      this.#handleExternalThemeChange
    );

    this.#applyTheme();
  }

  #getEffectiveMode(): ThemePreference['mode'] {
    const currentPreference = this.getColorModePreference();
    if (currentPreference === 'system') {
      return this.#mediaQueryList?.matches ? 'dark' : 'light';
    }
    return currentPreference;
  }

  #applyTheme(): void {
    const effectiveMode = this.#getEffectiveMode();
    const currentBaseTheme = this.getBaseTheme();
    const combinedThemeId = `${currentBaseTheme}-${effectiveMode}`;
    document.body.dataset.theme = combinedThemeId;
    this.#updateMetaThemeColor(combinedThemeId);
  }

  #defineSystemThemeHandler(): void {
    this.#systemThemeChangeHandler = (event: MediaQueryListEvent) => {
      if (this.getColorModePreference() === 'system') {
        this.#applyTheme();
        pubsub.publish(
          'ui:effectiveModeChanged',
          event.matches ? 'dark' : 'light'
        );
      }
    };
  }

  #setupSystemThemeListener(): void {
    if (!window.matchMedia) {
      if (this.getColorModePreference() === 'system') {
        this.#appStore
          .getState()
          .actions.setLocalPreference('themePreference', {
            base: this.getBaseTheme(),
            mode: 'light',
          });
      }
      return;
    }
    this.#mediaQueryList = window.matchMedia('(prefers-color-scheme: dark)');
    if (!this.#systemThemeChangeHandler) return;

    const mql = this.#mediaQueryList as MediaQueryListWithDeprecatedListeners;
    if (mql.addEventListener)
      mql.addEventListener('change', this.#systemThemeChangeHandler);
    else if (typeof mql.addListener === 'function')
      mql.addListener(this.#systemThemeChangeHandler);
  }

  destroy(): void {
    this.#unsubscribeStore();
    if (this.#mediaQueryList && this.#systemThemeChangeHandler) {
      const mql = this.#mediaQueryList as MediaQueryListWithDeprecatedListeners;
      if (mql.removeEventListener)
        mql.removeEventListener('change', this.#systemThemeChangeHandler);
      else if (typeof mql.removeListener === 'function')
        mql.removeListener(this.#systemThemeChangeHandler);
    }
  }

  #handleExternalThemeChange = (state: {
    themePreference: ThemePreference;
  }): void => {
    if (!state.themePreference || typeof state.themePreference !== 'object')
      return;
    this.#applyTheme();
  };

  setColorModePreference(newPreference: ThemePreference['mode']): void {
    if (
      !['light', 'dark', 'system'].includes(newPreference) ||
      this.getColorModePreference() === newPreference
    )
      return;
    this.#appStore
      .getState()
      .actions.setLocalPreference('themePreference', {
        base: this.getBaseTheme(),
        mode: newPreference,
      });
  }

  setBaseTheme(newBaseThemeId: string): void {
    if (
      !this.#availableBaseThemes.some((theme) => theme.id === newBaseThemeId) ||
      this.getBaseTheme() === newBaseThemeId
    )
      return;
    this.#appStore
      .getState()
      .actions.setLocalPreference('themePreference', {
        base: newBaseThemeId,
        mode: this.getColorModePreference(),
      });
  }

  #updateMetaThemeColor(combinedThemeId: string): void {
    if (!this.#themeMetaTag) return;
    try {
      const backgroundColor = getDefinedBackgroundColor(combinedThemeId);
      this.#themeMetaTag.setAttribute('content', backgroundColor);
    } catch (e: unknown) {
      console.error(
        `[ThemeManager] Error setting meta theme color for ${combinedThemeId}:`,
        e
      );
    }
  }

  getColorModePreference = (): ThemePreference['mode'] =>
    this.#appStore.getState().themePreference?.mode || this.#defaultColorMode;
  getEffectiveColorMode = (): ThemePreference['mode'] => this.#getEffectiveMode();
  getBaseTheme = (): string =>
    this.#appStore.getState().themePreference?.base || this.#defaultBaseTheme;
  getAvailableBaseThemes = (): Array<{
    id: string;
    nameKey: string;
    icon: string;
  }> => this.#availableBaseThemes.map((theme) => ({ ...theme }));
}