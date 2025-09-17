/* FILE: packages/frontend/src/services/theme-manager.ts */
import type { AppStore } from '#frontend/core/state/app-store.js';
import {
  DEFAULT_THEME_BASE_ID,
  DEFAULT_THEME_MODE,
} from '#frontend/constants/app-defaults.js';
import { AVAILABLE_THEMES } from '#frontend/ui/ui-themes.js';
import { pubsub } from '#shared/core/pubsub.js';

import type { ThemePreference } from '#frontend/types/index.js';

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
  #appleStatusBarMetaTag: HTMLMetaElement | null = null;
  #mediaQueryList: MediaQueryList | null = null;
  #systemThemeChangeHandler: ((event: MediaQueryListEvent) => void) | null = null;
  #appStore: AppStore;
  #unsubscribeStore: () => void;

  constructor(appStore: AppStore) {
    this.#appStore = appStore;
    this.#themeMetaTag = document.getElementById(
      'theme-color-meta'
    ) as HTMLMetaElement | null;
    this.#appleStatusBarMetaTag = document.getElementById(
      'apple-status-bar-style-meta'
    ) as HTMLMetaElement | null;
    if (!this.#themeMetaTag) {
      console.warn('[ThemeManager] <meta name="theme-color"> not found.');
    }
    if (!this.#appleStatusBarMetaTag) {
      console.warn('[ThemeManager] <meta name="apple-mobile-web-app-status-bar-style"> not found.');
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
    
    // Defer the meta tag update slightly to ensure the new CSS variables are applied.
    requestAnimationFrame(() => this.#updateDeviceThemeColors());
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

  /**
   * Reads the computed --color-surface CSS variable and updates the theme-color and
   * apple-mobile-web-app-status-bar-style meta tags for native-like device chrome.
   */
  #updateDeviceThemeColors(): void {
    try {
      const surfaceRgb = getComputedStyle(document.body).getPropertyValue('--color-surface').trim();
      let hexColor = '#ffffff'; // Default fallback

      if (surfaceRgb) {
        const rgbValues = surfaceRgb.match(/\d+/g);
        if (rgbValues && rgbValues.length >= 3) {
          const toHex = (c: number) => ('0' + c.toString(16)).slice(-2);
          hexColor = `#${toHex(Number(rgbValues[0]))}${toHex(Number(rgbValues[1]))}${toHex(Number(rgbValues[2]))}`;
        }
      }
      
      // Update standard theme-color for Android and desktop PWAs
      if (this.#themeMetaTag) {
        this.#themeMetaTag.setAttribute('content', hexColor);
      }

      // Update iOS specific status bar style
      if (this.#appleStatusBarMetaTag) {
        const effectiveMode = this.#getEffectiveMode();
        this.#appleStatusBarMetaTag.setAttribute('content', effectiveMode === 'dark' ? 'black' : 'default');
      }

    } catch (e: unknown) {
      console.error(`[ThemeManager] Error setting device theme colors:`, e);
      // Set safe fallbacks on error
      if (this.#themeMetaTag) this.#themeMetaTag.setAttribute('content', '#ffffff');
      if (this.#appleStatusBarMetaTag) this.#appleStatusBarMetaTag.setAttribute('content', 'default');
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