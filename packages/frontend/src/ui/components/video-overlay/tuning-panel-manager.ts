/* FILE: packages/frontend/src/ui/components/video-overlay/tuning-panel-manager.ts */
import { setElementVisibility } from '#frontend/ui/helpers/index.js';
import type { AppStore, FrontendFullState } from '#frontend/core/state/app-store.js';
import type { FullConfiguration } from '#shared/index.js';

export type SliderConfig = {
  slider: HTMLInputElement;
  output: HTMLElement;
  configKey: keyof FullConfiguration;
};

export class TuningPanelManager {
  #panelElement: HTMLElement;
  #sliders: SliderConfig[];
  #appStore: AppStore;
  #resetButton: HTMLButtonElement | null;
  #resetDefaults: Record<string, number>;

  constructor(
    panelElement: HTMLElement,
    sliderConfigs: SliderConfig[],
    appStore: AppStore,
    resetButton: HTMLButtonElement | null = null,
    resetDefaults: Record<string, number> = {}
  ) {
    this.#panelElement = panelElement;
    this.#sliders = sliderConfigs;
    this.#appStore = appStore;
    this.#resetButton = resetButton;
    this.#resetDefaults = resetDefaults;
    this.#attachEventListeners();
  }

  #attachEventListeners(): void {
    this.#sliders.forEach(({ slider }) => {
      slider.addEventListener('input', this.#handleSliderInput);
      slider.addEventListener('change', this.#handleSliderChange);
    });
    this.#resetButton?.addEventListener('click', this.#handleReset);
  }

  public show(): void {
    setElementVisibility(this.#panelElement, true, 'flex');
  }

  public hide(): void {
    setElementVisibility(this.#panelElement, false, 'flex');
  }

  public toggle(): void {
    const isVisible = !this.#panelElement.classList.contains('hidden');
    setElementVisibility(this.#panelElement, !isVisible, 'flex');
  }

  public isActive(): boolean {
    return !this.#panelElement.classList.contains('hidden');
  }

  #handleSliderInput = (event: Event): void => {
    const slider = event.target as HTMLInputElement;
    const config = this.#sliders.find((s) => s.slider === slider);
    if (!config) return;
    this.#updateOutput(config.output, slider.value);
    if (
      config.configKey === 'lowLightBrightness' ||
      config.configKey === 'lowLightContrast'
    ) {
      this.#appStore
        .getState()
        .actions.setLowLightSettings({
          [config.configKey]: parseFloat(slider.value),
        });
    }
  };

  #handleSliderChange = (event: Event): void => {
    const slider = event.target as HTMLInputElement;
    const config = this.#sliders.find((s) => s.slider === slider);
    if (config) {
      const value =
        config.configKey.includes('Brightness') ||
        config.configKey.includes('Contrast')
          ? parseInt(slider.value, 10)
          : parseFloat(slider.value);
      this.#appStore
        .getState()
        .actions.requestBackendPatch({ [config.configKey]: value });
    }
  };

  #handleReset = (): void => {
    const patchData: Partial<FullConfiguration> = {};
    this.#sliders.forEach((config) => {
      if (this.#resetDefaults[config.configKey] !== undefined) {
        const defaultValue = this.#resetDefaults[config.configKey];
        config.slider.value = String(defaultValue);
        this.#updateOutput(config.output, String(defaultValue));
        (patchData as Record<string, number>)[config.configKey] = defaultValue;
      }
    });
    if (Object.keys(patchData).length > 0) {
      this.#appStore.getState().actions.requestBackendPatch(patchData);
    }
  };

  #updateOutput = (output: HTMLElement, value: string): void => {
    const isConfidence = output.id.includes('Confidence');
    const isPercentage =
      output.id.includes('Brightness') || output.id.includes('Contrast');
    output.textContent = isConfidence
      ? `${Math.round(parseFloat(value) * 100)}%`
      : isPercentage
      ? `${value}%`
      : value;
  };

  public loadSettings(state: FrontendFullState): void {
    this.#sliders.forEach(({ slider, output, configKey }) => {
      const value = state[
        configKey as keyof FrontendFullState
      ] as number | undefined;
      if (typeof value === 'number') {
        slider.value = String(value);
        this.#updateOutput(output, slider.value);
      }
    });
  }
}