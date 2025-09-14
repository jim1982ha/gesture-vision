/* FILE: packages/frontend/src/ui/tabs/theme-settings-tab.ts */
import {
  BaseSettingsTab,
  type ButtonGroupOption,
  type TabElements,
} from '#frontend/ui/base-settings-tab.js';
import { renderThemeSelectionTab as renderThemeList } from '#frontend/ui/renderers/theme-tab-renderer.js';
import type { UIController } from '#frontend/ui/ui-controller-core.js';

import type { FullConfiguration } from '#shared/index.js';
import type { ThemePreference } from '#frontend/types/index.js';
import type { AppStore, FrontendFullState } from '#frontend/core/state/app-store.js';

export interface ThemeSettingsTabElements extends TabElements {
  container?: HTMLElement | null;
  colorModeToggleGroup?: HTMLElement | null;
  themeToggleGroup?: HTMLElement | null;
}

const COLOR_MODE_OPTIONS: Readonly<ButtonGroupOption[]> = [
  { value: 'light', iconKey: 'UI_LIGHT_MODE', titleKey: 'colorModeLight', textKey: 'colorModeLight' },
  { value: 'system', iconKey: 'UI_SYSTEM_MODE', titleKey: 'colorModeSystemLabel', textKey: 'colorModeSystemLabel' },
  { value: 'dark', iconKey: 'UI_DARK_MODE', titleKey: 'colorModeDark', textKey: 'colorModeDark' },
];

export class ThemeSettingsTab extends BaseSettingsTab<ThemeSettingsTabElements> {
  #uiControllerRef: UIController;

  constructor(
    appStore: AppStore,
    uiControllerRef: UIController
  ) {
    super(appStore, uiControllerRef, { container: '[data-tab-content="appearance"]' });
    this.#uiControllerRef = uiControllerRef;
    this.#renderLayout();
  }

  protected _doesConfigUpdateAffectThisTab(newState: FrontendFullState, oldState: FrontendFullState): boolean {
    return newState.themePreference !== oldState.themePreference;
  }

  protected _initializeSpecificEventListeners(): void {
    this._addEventListenerHelper('colorModeToggleGroup', 'click', this.#handleModeButtonClick);
    this._addEventListenerHelper('themeToggleGroup', 'click', this.#handleBaseThemeSelection);
  }

  public getSettingsToSave(): Partial<FullConfiguration> {
    return {};
  }

  #handleModeButtonClick = (event: MouseEvent): void => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button[data-value]');
    const newPreference = button?.dataset.value as ThemePreference['mode'] | undefined;
    if (newPreference) {
      this._appStore.getState().actions.setLocalPreference('themePreference', {
        base: this._appStore.getState().themePreference.base,
        mode: newPreference,
      });
    }
  };

  #handleBaseThemeSelection = (event: MouseEvent): void => {
    const themeButton = (event.target as HTMLElement).closest<HTMLButtonElement>('button.btn[data-theme-id]');
    const baseThemeId = themeButton?.dataset.themeId;
    if (baseThemeId) {
      this._appStore.getState().actions.setLocalPreference('themePreference', {
        base: baseThemeId,
        mode: this._appStore.getState().themePreference.mode,
      });
    }
  };

  public loadSettings(): void {
    const themeMgr = this.#uiControllerRef._themeManager;
    if (!themeMgr) return;
    
    renderThemeList(this._elements, this.#uiControllerRef);
    
    this._updateButtonGroupState(this._elements.colorModeToggleGroup, themeMgr.getColorModePreference());
    this._updateButtonGroupState(this._elements.themeToggleGroup, themeMgr.getBaseTheme());
  }

  public applyTranslations(): void {
    this._applyTranslationsHelper([
        { element: this._elements.container?.querySelector('#theme-settings-colormode-section .form-label'), config: "colorModeLegend" },
        { element: this._elements.container?.querySelector('#theme-settings-theme-section .form-label'), config: "themeSelectionLabel" },
    ]);
    this._renderButtonGroup(this._elements.colorModeToggleGroup, COLOR_MODE_OPTIONS);
    this.loadSettings();
  }

  #renderLayout(): void {
    const container = this._elements.container;
    if (!container) return;
    container.innerHTML = `
      <div id="theme-settings-colormode-section" class="form-section">
        <div class="form-label" data-translate-key="colorModeLegend"></div>
        <div id="colorModeToggleGroup" class="button-toggle-group" role="radiogroup"></div>
      </div>
      <div id="theme-settings-theme-section" class="form-section">
        <label for="themeToggleGroup" class="form-label" data-translate-key="themeSelectionLabel"></label>
        <div id="themeToggleGroup" class="button-toggle-group grid grid-cols-2 desktop:grid-cols-4" role="radiogroup">
          <div class="list-placeholder col-span-full">Loading themes...</div>
        </div>
      </div>
    `;
    this._elements.colorModeToggleGroup = container.querySelector('#colorModeToggleGroup');
    this._elements.themeToggleGroup = container.querySelector('#themeToggleGroup');
  }
}