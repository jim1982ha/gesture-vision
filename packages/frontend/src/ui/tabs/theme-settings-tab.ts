/* FILE: packages/frontend/src/ui/tabs/theme-settings-tab.ts */
import {
  BaseSettingsTab,
  type ButtonGroupOption,
  type TabElements,
} from '#frontend/ui/base-settings-tab.js';
import { renderThemeSelectionTab as renderThemeList } from '#frontend/ui/renderers/theme-tab-renderer.js';
import type { UIController } from '#frontend/ui/ui-controller-core.js';
import type { TranslationConfigItem } from '#frontend/ui/ui-translation-updater.js';

import type { FullConfiguration } from '#shared/index.js';
import type { ThemePreference } from '#frontend/types/index.js';
import type { FrontendFullState } from '#frontend/core/state/app-store.js';

export interface ThemeSettingsTabElements extends TabElements {
  colorModeSelectionLabel?: HTMLElement | null;
  colorModeToggleGroup?: HTMLElement | null;
  themeToggleGroup?: HTMLElement | null;
  themeSelectionLabel?: HTMLElement | null;
}

const COLOR_MODE_OPTIONS: Readonly<ButtonGroupOption[]> = [
  {
    value: 'light',
    iconKey: 'UI_LIGHT_MODE',
    titleKey: 'colorModeLight',
    textKey: 'colorModeLight',
  },
  {
    value: 'system',
    iconKey: 'UI_SYSTEM_MODE',
    titleKey: 'colorModeSystemLabel',
    textKey: 'colorModeSystemLabel',
  },
  {
    value: 'dark',
    iconKey: 'UI_DARK_MODE',
    titleKey: 'colorModeDark',
    textKey: 'colorModeDark',
  },
];

export class ThemeSettingsTab extends BaseSettingsTab<ThemeSettingsTabElements> {
  #uiControllerRef: UIController;

  constructor(
    elements: ThemeSettingsTabElements,
    uiControllerRef: UIController
  ) {
    super(elements, uiControllerRef.appStore);
    this.#uiControllerRef = uiControllerRef;
    this._renderButtonGroup(
      this._elements.colorModeToggleGroup,
      COLOR_MODE_OPTIONS
    );
  }

  protected _doesConfigUpdateAffectThisTab(
    newState: FrontendFullState,
    oldState: FrontendFullState
  ): boolean {
    return newState.themePreference !== oldState.themePreference;
  }

  protected _initializeSpecificEventListeners(): void {
    this._addEventListenerHelper(
      'colorModeToggleGroup',
      'click',
      this.#handleModeButtonClick
    );
    this._addEventListenerHelper(
      'themeToggleGroup',
      'click',
      this.#handleBaseThemeSelection
    );
  }

  public getSettingsToSave(): Partial<FullConfiguration> {
    return {};
  }

  #handleModeButtonClick = (event: MouseEvent): void => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>(
      'button[data-value]'
    );
    const newPreference = button?.dataset.value as
      | ThemePreference['mode']
      | undefined;
    if (newPreference) {
      this._appStore.getState().actions.setLocalPreference('themePreference', {
        base: this._appStore.getState().themePreference.base,
        mode: newPreference,
      });
    }
  };

  #handleBaseThemeSelection = (event: MouseEvent): void => {
    const themeButton = (event.target as HTMLElement).closest<HTMLButtonElement>(
      'button.btn[data-theme-id]'
    );
    const baseThemeId = themeButton?.dataset.themeId;
    if (baseThemeId) {
      this._appStore.getState().actions.setLocalPreference('themePreference', {
        base: baseThemeId,
        mode: this._appStore.getState().themePreference.mode,
      });
    }
  };

  public loadSettings(): void {
    if (!this.#uiControllerRef._themeManager) return;
    this._updateButtonGroupState(
      this._elements.colorModeToggleGroup,
      this._appStore.getState().themePreference?.mode
    );
    renderThemeList(this._elements, this.#uiControllerRef);
  }

  public applyTranslations(): void {
    const itemsToTranslate: TranslationConfigItem[] = [
      { element: this._elements.colorModeSelectionLabel, config: 'colorModeLegend' },
      { element: this._elements.themeSelectionLabel, config: 'themeSelectionLabel' },
    ];
    this._applyTranslationsHelper(itemsToTranslate);
    this._renderButtonGroup(
      this._elements.colorModeToggleGroup,
      COLOR_MODE_OPTIONS
    );
    this.loadSettings();
  }
}