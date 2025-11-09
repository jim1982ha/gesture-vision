/* FILE: packages/frontend/src/services/theme-manager.ts */
import type { AppStore } from '#frontend/core/state/app-store.js';
import {
  DEFAULT_THEME_BASE_ID,
  DEFAULT_THEME_MODE,
} from '#frontend/constants/index.js';
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
        (state, prevState) => this.#handleExternalThemeChange(state, prevState)
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
    // CORRECTED: Apply the theme to the <html> element, not the body.
    document.documentElement.dataset.theme = combinedThemeId;
    
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

  #handleExternalThemeChange = (
    state: { themePreference: ThemePreference },
    prevState: { themePreference: ThemePreference }
  ): void => {
    if (JSON.stringify(state.themePreference) !== JSON.stringify(prevState.themePreference)) {
      this.#applyTheme();
    }
  };

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
      
      if (this.#themeMetaTag) {
        this.#themeMetaTag.setAttribute('content', hexColor);
      }

      if (this.#appleStatusBarMetaTag) {
        const effectiveMode = this.#getEffectiveMode();
        this.#appleStatusBarMetaTag.setAttribute('content', effectiveMode === 'dark' ? 'black' : 'default');
      }

    } catch (e: unknown) {
      console.error(`[ThemeManager] Error setting device theme colors:`, e);
      if (this.#themeMetaTag) this.#themeMetaTag.setAttribute('content', '#ffffff');
      if (this.#appleStatusBarMetaTag) this.#appleStatusBarMetaTag.setAttribute('content', 'default');
    }
  }

  getColorModePreference = (): ThemePreference['mode'] =>
    this.#appStore.getState().themePreference?.mode || this.#defaultColorMode;
  getBaseTheme = (): string =>
    this.#appStore.getState().themePreference?.base || this.#defaultBaseTheme;
}