/* FILE: packages/frontend/src/ui/tabs/general-settings-tab.ts */
import type { AppStore, FrontendFullState } from '#frontend/core/state/app-store.js';
import { translate } from '#shared/services/translations.js';
import {
  BaseSettingsTab,
  type ButtonGroupOption,
  type TabElements,
} from '../base-settings-tab.js';
import type { FullConfiguration } from '#shared/types/index.js';

export interface GeneralSettingsTabElements extends TabElements {
  globalCooldownSlider?: HTMLInputElement | null;
  globalCooldownValue?: HTMLElement | null;
  resolutionSelectGroup?: HTMLElement | null;
  targetFpsSelectGroup?: HTMLElement | null;
  telemetryToggleGroup?: HTMLElement | null;
  globalCooldownLabel?: HTMLElement | null;
  resolutionPrefLabel?: HTMLElement | null;
  targetFpsLabel?: HTMLElement | null;
  telemetryEnabledLabel?: HTMLElement | null;
  targetFpsHelp?: HTMLElement | null;
  telemetryEnabledHelp?: HTMLElement | null;
}

const RESOLUTION_OPTIONS: Readonly<ButtonGroupOption[]> = [
  { value: '360', text: 'nHD', titleKey: 'resolution640x360', iconKey: 'UI_RESOLUTION_NHD' },
  { value: '640', text: 'SD', titleKey: 'resolution640x480', iconKey: 'UI_RESOLUTION_SD' },
  { value: '1280', text: 'HD', titleKey: 'resolution1280x720', iconKey: 'UI_RESOLUTION_HD' },
];
const FPS_OPTIONS: Readonly<ButtonGroupOption[]> = [5, 10, 15, 20, 30].map(
  (v) => ({ value: String(v), text: `${v} FPS` })
);
const TELEMETRY_OPTIONS: Readonly<ButtonGroupOption[]> = [
  { value: 'true', textKey: 'enableLabel', iconKey: 'UI_CHECK_CIRCLE' },
  { value: 'false', textKey: 'disableLabel', iconKey: 'UI_HIGHLIGHT_OFF' },
];

export class GeneralSettingsTab extends BaseSettingsTab<GeneralSettingsTabElements> {
  constructor(elements: GeneralSettingsTabElements, appStore: AppStore) {
    super(elements, appStore);
    this.#renderAllButtonGroups();
  }

  protected _doesConfigUpdateAffectThisTab(
    newState: FrontendFullState,
    oldState: FrontendFullState
  ): boolean {
    return (
      newState.globalCooldown !== oldState.globalCooldown ||
      newState.targetFpsPreference !== oldState.targetFpsPreference ||
      newState.telemetryEnabled !== oldState.telemetryEnabled ||
      newState.processingResolutionWidthPreference !==
        oldState.processingResolutionWidthPreference
    );
  }

  #renderAllButtonGroups = (): void => {
    this._renderButtonGroup(
      this._elements.resolutionSelectGroup,
      RESOLUTION_OPTIONS
    );
    this._renderButtonGroup(this._elements.targetFpsSelectGroup, FPS_OPTIONS);
    this._renderButtonGroup(
      this._elements.telemetryToggleGroup,
      TELEMETRY_OPTIONS.map((opt) => ({ ...opt, text: translate(opt.textKey!) }))
    );
  };

  protected _initializeSpecificEventListeners(): void {
    this._addEventListenerHelper('globalCooldownSlider', 'change', this.#handleSliderChange);
    this._addEventListenerHelper('globalCooldownSlider', 'input', this.#handleSliderInput);
    this._addEventListenerHelper('resolutionSelectGroup', 'click', (e: Event) =>
      this.#handleButtonClick(e as MouseEvent, (value) =>
        this._appStore
          .getState()
          .actions.setLocalPreference(
            'processingResolutionWidthPreference',
            parseInt(value, 10)
          )
      )
    );
    this._addEventListenerHelper('targetFpsSelectGroup', 'click', (e: Event) =>
      this.#handleButtonClick(e as MouseEvent, (value) =>
        this._appStore
          .getState()
          .actions.requestBackendPatch({ targetFpsPreference: parseInt(value, 10) })
      )
    );
    this._addEventListenerHelper('telemetryToggleGroup', 'click', (e: Event) =>
      this.#handleButtonClick(e as MouseEvent, (value) =>
        this._appStore
          .getState()
          .actions.requestBackendPatch({ telemetryEnabled: value === 'true' })
      )
    );
  }

  public getSettingsToSave = (): Partial<FullConfiguration> => ({});

  #handleButtonClick = (
    event: MouseEvent,
    action: (value: string) => void
  ): void => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>(
      'button[data-value]'
    );
    if (button?.dataset.value) {
      action(button.dataset.value);
      this._updateButtonGroupState(
        button.parentElement as HTMLElement | null,
        button.dataset.value
      );
    }
  };

  #updateSliderOutput = (
    slider: HTMLInputElement,
    output: HTMLElement,
    suffix: string
  ): void => {
    const min = parseFloat(slider.min) || 0,
      max = parseFloat(slider.max) || 100,
      value = parseFloat(slider.value);
    output.style.setProperty('--value-percent-raw', String((value - min) / (max - min)));
    output.textContent = `${value.toFixed(1)}${suffix}`;
  };

  #handleSliderInput = (e: Event) => {
    const s = e.target as HTMLInputElement;
    if (this._elements.globalCooldownValue)
      this.#updateSliderOutput(s, this._elements.globalCooldownValue, 's');
  };
  #handleSliderChange = (e: Event) => {
    const v = parseFloat((e.target as HTMLInputElement).value);
    if (!isNaN(v) && v >= 0)
      this._appStore.getState().actions.requestBackendPatch({ globalCooldown: v });
  };

  public loadSettings(): void {
    const state = this._appStore.getState();
    if (this._elements.globalCooldownSlider && this._elements.globalCooldownValue) {
      this._elements.globalCooldownSlider.value = state.globalCooldown.toFixed(1);
      this.#updateSliderOutput(
        this._elements.globalCooldownSlider,
        this._elements.globalCooldownValue,
        's'
      );
    }
    this._updateButtonGroupState(
      this._elements.resolutionSelectGroup,
      String(state.processingResolutionWidthPreference)
    );
    this._updateButtonGroupState(
      this._elements.targetFpsSelectGroup,
      state.targetFpsPreference
    );
    this._updateButtonGroupState(
      this._elements.telemetryToggleGroup,
      state.telemetryEnabled
    );
  }

  public applyTranslations(): void {
    this._applyTranslationsHelper([
      { element: this._elements.globalCooldownLabel, config: 'globalCooldown' },
      {
        element: this._elements.resolutionPrefLabel,
        config: 'processingResolutionLabel',
      },
      { element: this._elements.targetFpsLabel, config: { key: 'targetFpsLabel' } },
      {
        element: this._elements.telemetryEnabledLabel,
        config: { key: 'telemetryEnabledLabel' },
      },
      { element: this._elements.targetFpsHelp, config: 'targetFpsHelp' },
      { element: this._elements.telemetryEnabledHelp, config: 'telemetryEnabledHelp' },
    ]);
    this.#renderAllButtonGroups();
    this.loadSettings();
  }
}