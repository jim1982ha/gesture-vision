/* FILE: packages/frontend/src/ui/components/video-overlay-controls-manager.ts */
import {
  UI_EVENTS,
  WEBCAM_EVENTS,
  CAMERA_SOURCE_EVENTS,
} from '#shared/constants/index.js';
import { pubsub } from '#shared/core/pubsub.js';
import { translate } from '#shared/services/translations.js';

import { setIcon, setElementVisibility } from '#frontend/ui/helpers/index.js';
import type { UIController } from '#frontend/ui/ui-controller-core.js';

import type { FullConfiguration } from '#shared/types/index.js';
import type { FrontendFullState } from '#frontend/core/state/app-store.js';

type SliderConfig = {
  slider: HTMLInputElement;
  output: HTMLElement;
  configKey: keyof FullConfiguration;
};

type VideoOverlayState =
  | 'INITIAL_CONNECTING'
  | 'OFFLINE_IDLE'
  | 'STREAM_ACTIVE'
  | 'hidden';

export class VideoOverlayControlsManager {
  #uiControllerRef: UIController;
  #toolbarContainer: HTMLElement | null = null;
  #videoContainer: HTMLElement | null = null;

  #displayAdjustmentsBtn: HTMLButtonElement | null = null;
  #aiTuningBtn: HTMLButtonElement | null = null;
  #mirrorBtn: HTMLButtonElement | null = null;
  #flipCameraBtn: HTMLButtonElement | null = null;
  #videoSizeToggleButton: HTMLButtonElement | null = null;
  #resetDisplayAdjustmentsBtn: HTMLButtonElement | null = null;

  #displayAdjustmentsPanel: HTMLElement | null = null;
  #aiTuningPanel: HTMLElement | null = null;

  #handTuningSliders: HTMLElement | null = null;
  #poseTuningSliders: HTMLElement | null = null;

  #connectingOverlayElement: HTMLElement | null = null;
  #connectingOverlayTextContainer: HTMLElement | null = null;
  #connectingOverlayIconContainer: HTMLElement | null = null;
  #connectingOverlayIcon: HTMLElement | null = null;
  #connectingOverlayText: HTMLElement | null = null;
  #currentOverlayState: VideoOverlayState = 'OFFLINE_IDLE';

  #sliders: SliderConfig[] = [];
  #visibilityTimeout: number | null = null;
  #isInitialized = false;

  constructor(uiController: UIController) {
    this.#uiControllerRef = uiController;
    this.#initialize();
  }

  #initialize(): void {
    const { _elements: elements } = this.#uiControllerRef;
    if (!elements) return;

    this.#toolbarContainer =
      (elements.videoToolbarContainer as HTMLElement) ?? null;
    this.#videoContainer = (elements.videoContainer as HTMLElement) ?? null;
    this.#displayAdjustmentsBtn =
      (elements.displayAdjustmentsBtn as HTMLButtonElement) ?? null;
    this.#aiTuningBtn = (elements.aiTuningBtn as HTMLButtonElement) ?? null;
    this.#mirrorBtn = (elements.videoMirrorBtn as HTMLButtonElement) ?? null;
    this.#flipCameraBtn = (elements.flipCameraBtn as HTMLButtonElement) ?? null;
    this.#videoSizeToggleButton =
      (elements.videoSizeToggleButton as HTMLButtonElement) ?? null;
    this.#displayAdjustmentsPanel =
      (elements.displayAdjustmentsPanel as HTMLElement) ?? null;
    this.#aiTuningPanel = (elements.aiTuningPanel as HTMLElement) ?? null;
    this.#handTuningSliders = (elements.handTuningSliders as HTMLElement) ?? null;
    this.#poseTuningSliders = (elements.poseTuningSliders as HTMLElement) ?? null;
    this.#resetDisplayAdjustmentsBtn =
      (elements.resetDisplayAdjustmentsBtn as HTMLButtonElement) ?? null;

    this.#connectingOverlayElement =
      (elements.connectingOverlay as HTMLElement) ?? null;
    if (this.#connectingOverlayElement) {
      this.#connectingOverlayTextContainer =
        this.#connectingOverlayElement.querySelector<HTMLElement>(
          '.overlay-text-container'
        ) ?? null;
      this.#connectingOverlayIconContainer =
        this.#connectingOverlayElement.querySelector<HTMLElement>(
          '.overlay-icon-container'
        ) ?? null;
      this.#connectingOverlayIcon =
        this.#connectingOverlayIconContainer?.querySelector<HTMLElement>(
          '.material-icons'
        ) ?? null;
      this.#connectingOverlayText =
        this.#connectingOverlayTextContainer?.querySelector<HTMLElement>(
          '#connectingText'
        ) ?? null;
    }

    this.#sliders = [
      {
        slider: elements.brightnessSlider as HTMLInputElement,
        output: elements.brightnessValue as HTMLElement,
        configKey: 'lowLightBrightness',
      },
      {
        slider: elements.contrastSlider as HTMLInputElement,
        output: elements.contrastValue as HTMLElement,
        configKey: 'lowLightContrast',
      },
      {
        slider: elements.handDetectionConfidenceSlider as HTMLInputElement,
        output: elements.handDetectionConfidenceOutput as HTMLElement,
        configKey: 'handDetectionConfidence',
      },
      {
        slider: elements.handPresenceConfidenceSlider as HTMLInputElement,
        output: elements.handPresenceConfidenceOutput as HTMLElement,
        configKey: 'handPresenceConfidence',
      },
      {
        slider: elements.handTrackingConfidenceSlider as HTMLInputElement,
        output: elements.handTrackingConfidenceOutput as HTMLElement,
        configKey: 'handTrackingConfidence',
      },
      {
        slider: elements.poseDetectionConfidenceSlider as HTMLInputElement,
        output: elements.poseDetectionConfidenceOutput as HTMLElement,
        configKey: 'poseDetectionConfidence',
      },
      {
        slider: elements.posePresenceConfidenceSlider as HTMLInputElement,
        output: elements.posePresenceConfidenceOutput as HTMLElement,
        configKey: 'posePresenceConfidence',
      },
      {
        slider: elements.poseTrackingConfidenceSlider as HTMLInputElement,
        output: elements.poseTrackingConfidenceOutput as HTMLElement,
        configKey: 'poseTrackingConfidence',
      },
    ].filter((s): s is SliderConfig => !!(s.slider && s.output));

    this.#attachEventListeners();
    this.updateAllControls();
    this.applyTranslations();
    this.setOverlayState('OFFLINE_IDLE');
    this.#isInitialized = true;
  }

  #attachEventListeners(): void {
    this.#videoContainer?.addEventListener('click', this.#handleVideoClick);

    this.#toolbarContainer?.addEventListener('mouseenter', this.#clearVisibilityTimeout);
    this.#toolbarContainer?.addEventListener('mouseleave', this.#scheduleToolbarHide);

    this.#displayAdjustmentsPanel?.addEventListener(
      'mouseenter',
      this.#clearVisibilityTimeout
    );
    this.#displayAdjustmentsPanel?.addEventListener(
      'mouseleave',
      this.#scheduleToolbarHide
    );
    this.#aiTuningPanel?.addEventListener('mouseenter', this.#clearVisibilityTimeout);
    this.#aiTuningPanel?.addEventListener('mouseleave', this.#scheduleToolbarHide);

    this.#displayAdjustmentsBtn?.addEventListener('click', () =>
      this.#togglePanel('display')
    );
    this.#aiTuningBtn?.addEventListener('click', () => this.#togglePanel('ai'));
    this.#mirrorBtn?.addEventListener('click', () =>
      this.#uiControllerRef._webcamManagerRef?.toggleMirroringForCurrentStream()
    );
    this.#flipCameraBtn?.addEventListener('click', () =>
      this.#uiControllerRef._webcamManagerRef?.flipCamera()
    );
    this.#resetDisplayAdjustmentsBtn?.addEventListener(
      'click',
      this.#handleResetDisplayAdjustments
    );

    this.#connectingOverlayElement?.addEventListener(
      'click',
      this.#handleConnectingOverlayClick
    );

    this.#sliders.forEach(({ slider }) => {
      slider.addEventListener('input', this.#handleSliderInput);
      slider.addEventListener('change', this.#handleSliderChange);
    });

    pubsub.subscribe(WEBCAM_EVENTS.STREAM_START, () => {
      this.updateAllControls();
      this.setOverlayState('STREAM_ACTIVE');
    });
    pubsub.subscribe(WEBCAM_EVENTS.STREAM_STOP, () => {
      this.updateAllControls();
      this.setOverlayState('OFFLINE_IDLE');
    });
    pubsub.subscribe(WEBCAM_EVENTS.ERROR, () => {
      this.updateAllControls();
      this.setOverlayState('OFFLINE_IDLE');
    });
    pubsub.subscribe(WEBCAM_EVENTS.STREAM_CONNECTION_CANCELLED, () => {
      this.updateAllControls();
      this.setOverlayState('OFFLINE_IDLE');
    });
    pubsub.subscribe(CAMERA_SOURCE_EVENTS.REQUESTING_STREAM_START, () =>
      this.setOverlayState('INITIAL_CONNECTING')
    );
    pubsub.subscribe(UI_EVENTS.REQUEST_OVERLAY_STATE, (state?: unknown) =>
      this.setOverlayState(state as VideoOverlayState)
    );

    this.#uiControllerRef.appStore.subscribe((state) => {
      if (this.#isInitialized) this.loadSettings(state);
    });
  }

  #handleResetDisplayAdjustments = (): void => {
    const brightnessSliderConfig = this.#sliders.find(
      (s) => s.configKey === 'lowLightBrightness'
    );
    const contrastSliderConfig = this.#sliders.find(
      (s) => s.configKey === 'lowLightContrast'
    );

    if (brightnessSliderConfig) {
      brightnessSliderConfig.slider.value = '100';
      this.#updateOutput(brightnessSliderConfig.output, '100');
    }

    if (contrastSliderConfig) {
      contrastSliderConfig.slider.value = '100';
      this.#updateOutput(contrastSliderConfig.output, '100');
    }

    this.#uiControllerRef.appStore?.getState().actions.requestBackendPatch({
      lowLightBrightness: 100,
      lowLightContrast: 100,
    });

    pubsub.publish(UI_EVENTS.SHOW_NOTIFICATION, {
      messageKey: 'displaySettingsReset',
      type: 'info',
      duration: 1500,
    });
  };

  #handleConnectingOverlayClick = (event: MouseEvent): void => {
    if (!this.#connectingOverlayElement) return;

    switch (this.#currentOverlayState) {
      case 'INITIAL_CONNECTING':
        if ((event.target as HTMLElement) === this.#connectingOverlayElement) {
          this.#uiControllerRef._webcamManagerRef?.cancelStreamConnection();
        }
        break;
      case 'OFFLINE_IDLE':
        if ((event.target as HTMLElement).closest('.overlay-icon-container')) {
          this.#uiControllerRef.modalManager?.toggleCameraSelectModal(true);
        }
        break;
      case 'STREAM_ACTIVE':
        if ((event.target as HTMLElement).closest('.overlay-icon-container')) {
          this.#uiControllerRef._webcamManagerRef?.stop();
        }
        break;
    }
  };

  public setOverlayState = (newState: VideoOverlayState): void => {
    if (
      this.#currentOverlayState === newState &&
      this.#connectingOverlayElement?.classList.contains(
        `state-${newState.toLowerCase()}`
      )
    )
      return;

    this.#currentOverlayState = newState;
    if (
      !this.#connectingOverlayElement ||
      !this.#connectingOverlayIcon ||
      !this.#connectingOverlayText ||
      !this.#connectingOverlayTextContainer ||
      !this.#connectingOverlayIconContainer
    )
      return;

    this.#connectingOverlayElement.classList.remove(
      'state-initial-connecting',
      'state-offline-idle',
      'state-stream-active',
      'visible'
    );

    let iconKey: Parameters<typeof setIcon>[1] | null = null;
    let textContent = '';

    switch (newState) {
      case 'INITIAL_CONNECTING':
        this.#connectingOverlayElement.classList.add(
          'state-initial-connecting',
          'visible'
        );
        textContent = translate('connecting');
        break;
      case 'OFFLINE_IDLE':
        this.#connectingOverlayElement.classList.add('state-offline-idle', 'visible');
        iconKey = 'UI_PLAY';
        break;
      case 'STREAM_ACTIVE':
        this.#connectingOverlayElement.classList.add('state-stream-active', 'visible');
        iconKey = 'UI_STOP_STREAM';
        break;
      case 'hidden':
        break;
    }

    if (this.#connectingOverlayIcon && iconKey) {
      setIcon(this.#connectingOverlayIcon, iconKey);
    } else if (this.#connectingOverlayIcon) {
      this.#connectingOverlayIcon.textContent = '';
    }
    if (this.#connectingOverlayText)
      this.#connectingOverlayText.textContent = textContent;
  };

  #handleVideoClick = (event: MouseEvent): void => {
    const target = event.target as HTMLElement;
    if (
      target.closest('.video-overlay-panel') ||
      target.closest('#video-toolbar-container') ||
      target.closest('#videoSizeToggleButton')
    ) {
      return;
    }

    if (!this.#toolbarContainer) return;
    this.#clearVisibilityTimeout();
    this.#toolbarContainer.classList.toggle('visible');
    if (this.#toolbarContainer.classList.contains('visible')) {
      this.#scheduleToolbarHide();
    } else {
      this.closeAllOverlayPanels();
    }
  };

  #togglePanel = (panelType: 'display' | 'ai'): void => {
    const panels = {
      display: this.#displayAdjustmentsPanel,
      ai: this.#aiTuningPanel,
    };
    const buttons = {
      display: this.#displayAdjustmentsBtn,
      ai: this.#aiTuningBtn,
    };

    const targetPanel = panels[panelType];
    const otherPanel = panels[panelType === 'display' ? 'ai' : 'display'];

    const isTargetCurrentlyVisible = !targetPanel?.classList.contains('hidden');

    setElementVisibility(otherPanel, false, 'flex');
    buttons[panelType === 'display' ? 'ai' : 'display']?.classList.remove(
      'active'
    );

    setElementVisibility(targetPanel, !isTargetCurrentlyVisible, 'flex');
    buttons[panelType]?.classList.toggle('active', !isTargetCurrentlyVisible);
  };

  #scheduleToolbarHide = (): void => {
    this.#clearVisibilityTimeout();
    this.#visibilityTimeout = window.setTimeout(() => {
      this.#toolbarContainer?.classList.remove('visible');
      this.closeAllOverlayPanels();
    }, 2000);
  };

  #clearVisibilityTimeout = (): void => {
    if (this.#visibilityTimeout) clearTimeout(this.#visibilityTimeout);
  };

  #handleSliderInput = (event: Event): void => {
    const slider = event.target as HTMLInputElement;
    const sliderConfig = this.#sliders.find((s) => s.slider === slider);
    if (!sliderConfig) return;

    this.#updateOutput(sliderConfig.output, slider.value);

    const liveValue = parseFloat(slider.value);
    const configKey = sliderConfig.configKey;

    if (this.#uiControllerRef.appStore) {
      if (
        configKey === 'lowLightBrightness' ||
        configKey === 'lowLightContrast'
      ) {
        const payload = { [configKey]: liveValue };
        this.#uiControllerRef.appStore.getState().actions.setLowLightSettings(payload);
      }
    }
  };

  #handleSliderChange = (event: Event): void => {
    const slider = event.target as HTMLInputElement;
    const configKey =
      (slider.dataset.configKey as keyof FullConfiguration) ||
      this.#sliders.find((s) => s.slider === slider)?.configKey;
    if (configKey) {
      const value =
        configKey === 'lowLightBrightness' || configKey === 'lowLightContrast'
          ? parseInt(slider.value, 10)
          : parseFloat(slider.value);
      this.#saveSliderValue(configKey, value);
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

  #saveSliderValue = (key: keyof FullConfiguration, value: number): void => {
    this.#uiControllerRef.appStore
      ?.getState()
      .actions.requestBackendPatch({ [key]: value });
  };

  #updateAITuningPanelVisibility = (): void => {
    const state = this.#uiControllerRef.appStore.getState();

    const anyHandFeatureEnabled =
      state.enableBuiltInHandGestures || state.enableCustomHandGestures;
    const poseFeatureEnabled = state.enablePoseProcessing;

    setElementVisibility(this.#handTuningSliders, anyHandFeatureEnabled, 'flex');
    setElementVisibility(this.#poseTuningSliders, poseFeatureEnabled, 'flex');
  };

  public updateAllControls = (): void => {
    const webcamMgr = this.#uiControllerRef._webcamManagerRef;
    const isStreamRunning =
      this.#uiControllerRef._appStatusManager?.isWebcamRunning() ?? false;
    const isMobile = this.#uiControllerRef.sidebarManager?.isMobile ?? false;

    if (!webcamMgr || !this.#toolbarContainer) return;

    setElementVisibility(this.#videoSizeToggleButton, true, 'flex');

    if (!isStreamRunning) {
      this.closeAllOverlayPanels();
      setElementVisibility(this.#toolbarContainer, false, 'flex');
      this.setOverlayState('OFFLINE_IDLE');
      return;
    }

    setElementVisibility(this.#toolbarContainer, true, 'flex');
    this.setOverlayState('STREAM_ACTIVE');

    setElementVisibility(this.#aiTuningBtn, isStreamRunning, 'flex');
    setElementVisibility(this.#displayAdjustmentsBtn, isStreamRunning, 'flex');
    if (!isStreamRunning) {
      setElementVisibility(this.#aiTuningPanel, false);
      setElementVisibility(this.#displayAdjustmentsPanel, false);
    }

    const canFlip = webcamMgr.canFlipCamera();
    const isRtsp = webcamMgr._isRTSPStreamActive;
    setElementVisibility(this.#flipCameraBtn, canFlip && isMobile && !isRtsp, 'flex');

    this.#updateAITuningPanelVisibility();
    this.#mirrorBtn?.classList.toggle('active', webcamMgr.isMirrored());
  };

  public loadSettings = (state?: FrontendFullState): void => {
    const config = state || this.#uiControllerRef.appStore.getState();
    if (!config) return;

    this.#sliders.forEach(({ slider, output, configKey }) => {
      const value = config[configKey] as number | undefined;
      if (typeof value === 'number') {
        slider.value = String(value);
        this.#updateOutput(output, slider.value);
      }
    });

    this.updateAllControls();
  };

  public applyTranslations = (): void => {
    const setTooltip = (el: HTMLElement | null, key: string) => {
      if (el) el.title = translate(key);
    };
    setTooltip(this.#mirrorBtn, 'toggleMirrorView');
    setTooltip(this.#flipCameraBtn, 'flipCamera');
    setTooltip(this.#aiTuningBtn, 'toggleAITuningPanelTooltip');
    setTooltip(this.#displayAdjustmentsBtn, 'displayAdjustments');

    setIcon(this.#mirrorBtn, 'UI_VIDEO_MIRROR');
    setIcon(this.#flipCameraBtn, 'UI_FLIP_CAMERA');
    setIcon(this.#displayAdjustmentsBtn, 'UI_DISPLAY_ADJUSTMENTS');
    setIcon(this.#aiTuningBtn, 'UI_AI_TUNING');

    const setLabel = (sliderId: string, labelKey: string) => {
      const slider = document.getElementById(sliderId) as HTMLInputElement | null;
      if (slider) {
        const label = slider.parentElement?.querySelector<HTMLLabelElement>('label');
        if (label) label.textContent = translate(labelKey);
      }
    };
    setLabel('brightnessSlider', 'brightnessLabel');
    setLabel('contrastSlider', 'contrastLabel');
    setLabel('handDetectionConfidenceSlider', 'detectLabel');
    setLabel('handPresenceConfidenceSlider', 'presenceLabel');
    setLabel('handTrackingConfidenceSlider', 'trackLabel');
    setLabel('poseDetectionConfidenceSlider', 'detectLabel');
    setLabel('posePresenceConfidenceSlider', 'presenceLabel');
    setLabel('poseTrackingConfidenceSlider', 'trackLabel');

    this.#uiControllerRef.layoutManager?.applyVideoSizePreference();
  };

  public closeAllOverlayPanels(): void {
    setElementVisibility(this.#displayAdjustmentsPanel, false, 'flex');
    setElementVisibility(this.#aiTuningPanel, false, 'flex');
    this.#displayAdjustmentsBtn?.classList.remove('active');
    this.#aiTuningBtn?.classList.remove('active');
  }
}