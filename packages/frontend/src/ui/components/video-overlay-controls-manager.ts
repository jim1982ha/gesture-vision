/* FILE: packages/frontend/src/ui/components/video-overlay-controls-manager.ts */
import {
  UI_EVENTS,
  WEBCAM_EVENTS,
  CAMERA_SOURCE_EVENTS,
  pubsub,
} from '#shared/index.js';
import type { UIController } from '#frontend/ui/ui-controller-core.js';
import type { FrontendFullState } from '#frontend/core/state/app-store.js';
import { setElementVisibility, setIcon } from '#frontend/ui/helpers/index.js';

import {
  StatusOverlayManager,
  type VideoOverlayState,
} from './video-overlay/status-overlay-manager.js';
import { ToolbarManager } from './video-overlay/toolbar-manager.js';
import {
  TuningPanelManager,
  type SliderConfig,
} from './video-overlay/tuning-panel-manager.js';

export class VideoOverlayControlsManager {
  #uiControllerRef: UIController;
  #videoContainer: HTMLElement;
  #statusOverlayManager: StatusOverlayManager;
  #toolbarManager: ToolbarManager;
  #displayTuningPanel: TuningPanelManager;
  #aiTuningPanel: TuningPanelManager;
  #handTuningSliders: HTMLElement;
  #poseTuningSliders: HTMLElement;
  #isInitialized = false;

  constructor(uiController: UIController) {
    this.#uiControllerRef = uiController;
    const { _elements: elements } = this.#uiControllerRef;

    this.#videoContainer = elements.videoContainer as HTMLElement;
    this.#handTuningSliders = elements.handTuningSliders as HTMLElement;
    this.#poseTuningSliders = elements.poseTuningSliders as HTMLElement;

    this.#statusOverlayManager = new StatusOverlayManager(
      elements.connectingOverlay as HTMLElement,
      uiController
    );
    this.#toolbarManager = new ToolbarManager(
      {
        toolbarContainer: elements.videoToolbarContainer as HTMLElement,
        videoSizeToggleButton:
          elements.videoSizeToggleButton as HTMLButtonElement,
        mirrorBtn: elements.videoMirrorBtn as HTMLButtonElement,
        flipCameraBtn: elements.flipCameraBtn as HTMLButtonElement,
        displayAdjustmentsBtn:
          elements.displayAdjustmentsBtn as HTMLButtonElement,
        aiTuningBtn: elements.aiTuningBtn as HTMLButtonElement,
      },
      uiController
    );

    const displaySliders = [
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
    ].filter((s) => s.slider && s.output) as SliderConfig[];

    this.#displayTuningPanel = new TuningPanelManager(
      elements.displayAdjustmentsPanel as HTMLElement,
      displaySliders,
      this.#uiControllerRef.appStore,
      elements.resetDisplayAdjustmentsBtn as HTMLButtonElement,
      { lowLightBrightness: 100, lowLightContrast: 100 }
    );

    const aiSliders = [
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
    ].filter((s) => s.slider && s.output) as SliderConfig[];

    this.#aiTuningPanel = new TuningPanelManager(
      elements.aiTuningPanel as HTMLElement,
      aiSliders,
      this.#uiControllerRef.appStore
    );

    this.#initialize();
  }

  #initialize(): void {
    this.#attachEventListeners();
    this.updateAllControls();
    this.applyTranslations();
    this.setOverlayState('OFFLINE_IDLE');
    this.#isInitialized = true;
    setIcon(this.#uiControllerRef._elements.resetDisplayAdjustmentsBtn, 'UI_RESET');
  }

  #attachEventListeners(): void {
    this.#videoContainer.addEventListener('click', this.#handleVideoClick);

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
    pubsub.subscribe(UI_EVENTS.VIDEO_TOOLBAR_AI_CLICKED, () =>
      this.#togglePanel('ai')
    );
    pubsub.subscribe(UI_EVENTS.VIDEO_TOOLBAR_DISPLAY_CLICKED, () =>
      this.#togglePanel('display')
    );

    this.#uiControllerRef.appStore.subscribe((state) => {
      if (this.#isInitialized) this.loadSettings(state);
    });
  }

  #handleVideoClick = (event: MouseEvent): void => {
    const target = event.target as HTMLElement;
    if (
      target.closest(
        '.video-overlay-panel, #video-toolbar-container, #videoSizeToggleButton'
      )
    )
      return;

    if (this.#toolbarManager) {
      this.#toolbarManager.clearVisibilityTimeout();
      // The toolbar is now always visible when stream is active, so no need to schedule hide.
    } else {
      this.closeAllOverlayPanels();
    }
  };

  #togglePanel(panelType: 'display' | 'ai'): void {
    if (panelType === 'ai') {
      this.#aiTuningPanel.toggle();
      if (this.#aiTuningPanel.isActive()) this.#displayTuningPanel.hide();
    } else {
      this.#displayTuningPanel.toggle();
      if (this.#displayTuningPanel.isActive()) this.#aiTuningPanel.hide();
    }
  }

  public setOverlayState = (newState: VideoOverlayState): void => {
    this.#statusOverlayManager.setState(newState);
  };

  public updateAllControls = (): void => {
    const isStreamRunning =
      this.#uiControllerRef.appStatusManager?.isWebcamRunning() ?? false;
    
    this.#toolbarManager.setContainerVisibility(true);

    if (!isStreamRunning) {
      this.closeAllOverlayPanels();
      this.setOverlayState('OFFLINE_IDLE');
    } else {
      this.setOverlayState('STREAM_ACTIVE');
    }
    
    this.#toolbarManager.updateButtonStates();
    this.#updateAITuningPanelVisibility();
  };

  #updateAITuningPanelVisibility(): void {
    const state = this.#uiControllerRef.appStore.getState();
    const anyHandFeatureEnabled =
      state.enableBuiltInHandGestures || state.enableCustomHandGestures;
    const poseFeatureEnabled = state.enablePoseProcessing;
    setElementVisibility(
      this.#handTuningSliders,
      anyHandFeatureEnabled,
      'flex'
    );
    setElementVisibility(this.#poseTuningSliders, poseFeatureEnabled, 'flex');
  }

  public loadSettings(state: FrontendFullState): void {
    this.#displayTuningPanel.loadSettings(state);
    this.#aiTuningPanel.loadSettings(state);
    this.updateAllControls();
  }

  public applyTranslations(): void {
    this.#toolbarManager.applyTranslations();
  }

  public closeAllOverlayPanels(): void {
    this.#displayTuningPanel.hide();
    this.#aiTuningPanel.hide();
  }
}