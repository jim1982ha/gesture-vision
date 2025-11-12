/* FILE: packages/frontend/src/services/theme-manager.ts */
import type { AppStore } from '#frontend/core/state/app-store.js';
import {
  DEFAULT_THEME_BASE_ID,
  DEFAULT_THEME_MODE,
} from '#frontend/constants/index.js';
import { pubsub } from '#shared/core/pubsub.js';
import { UI_EVENTS } from '#shared/index.js';

import type { ThemePreference } from '#frontend/types/index.js';

type MediaQueryListWithDeprecatedListeners = MediaQueryList & {
  addListener?: (
    callback: ((this: MediaQueryList, ev: MediaQueryListEvent) => unknown) | null
  ) => void;
  removeListener?: (
    callback: ((this: MediaQueryList, ev: MediaQueryListEvent) => unknown) | null
  ) => void;
};

/**
 * Converts HSL color values to a HEX string.
 * @param h Hue (0-360)
 * @param s Saturation (0-100)
 * @param l Lightness (0-100)
 * @returns The HEX color string (e.g., "#RRGGBB").
 */
function hslToHex(h: number, s: number, l: number): string {
  l /= 100;
  const a = (s * Math.min(l, 1 - l)) / 100;
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}


export default class ThemeManager {
  #defaultBaseTheme = DEFAULT_THEME_BASE_ID;
  #defaultColorMode: ThemePreference['mode'] = DEFAULT_THEME_MODE;
  #themeMetaTag: HTMLMetaElement | null = null;
  #appleStatusBarMetaTag: HTMLMetaElement | null = null;
  #mediaQueryList: MediaQueryList | null = null;
  #systemThemeChangeHandler: ((event: MediaQueryListEvent) => void) | null = null;
  #appStore: AppStore;
  #unsubscribeStore: () => void;
  #appInitSubscription: () => void;

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

    // Subscribe to the app initialized event to run a final color check.
    this.#appInitSubscription = pubsub.subscribe(UI_EVENTS.APP_INITIALIZED, () => {
      this.#updateDeviceThemeColors();
    });

    // Initial application of the theme.
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
    document.documentElement.dataset.theme = combinedThemeId;
    
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
  
  // Unsubscribes from the store, pubsub, and system media query listeners.
  destroy(): void {
    this.#unsubscribeStore();
    this.#appInitSubscription(); // Unsubscribe from the app init event.
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
      const surfaceHslString = getComputedStyle(document.documentElement).getPropertyValue('--color-surface').trim();
      
      let hexColor = '#ffffff'; // Default fallback

      if (surfaceHslString) {
        const hslValues = surfaceHslString.match(/(\d+(\.\d+)?)/g);
        if (hslValues && hslValues.length >= 3) {
            const [h, s, l] = hslValues.map(parseFloat);
            hexColor = hslToHex(h, s, l);
        } else {
           console.warn(`[ThemeManager] Could not parse HSL values from '${surfaceHslString}'. Falling back to default.`);
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