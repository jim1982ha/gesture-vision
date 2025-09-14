/* FILE: packages/frontend/src/ui/components/video-overlay-controls-manager.ts */
import {
  UI_EVENTS,
  WEBCAM_EVENTS,
  CAMERA_SOURCE_EVENTS,
  pubsub,
} from "#shared/index.js";
import type { UIController } from "#frontend/ui/ui-controller-core.js";
import type { FrontendFullState } from "#frontend/core/state/app-store.js";
import { setElementVisibility, setIcon } from "#frontend/ui/helpers/index.js";

import {
  StatusOverlayManager,
  type VideoOverlayState,
} from "./video-overlay/status-overlay-manager.js";
import { ToolbarManager } from "./video-overlay/toolbar-manager.js";
import {
  TuningPanelManager,
  type SliderConfig,
} from "./video-overlay/tuning-panel-manager.js";

export class VideoOverlayControlsManager {
  #uiControllerRef: UIController;
  #overlayContainer: HTMLElement;
  #statusOverlayManager: StatusOverlayManager;
  #toolbarManager: ToolbarManager;
  #displayTuningPanel: TuningPanelManager;
  #aiTuningPanel: TuningPanelManager;
  #handTuningSliders: HTMLElement;
  #poseTuningSliders: HTMLElement;
  #isInitialized = false;

  constructor(uiController: UIController) {
    this.#uiControllerRef = uiController;

    this.#overlayContainer = document.getElementById(
      "video-overlay-container"
    ) as HTMLElement;
    this.#handTuningSliders = document.getElementById(
      "handTuningSliders"
    ) as HTMLElement;
    this.#poseTuningSliders = document.getElementById(
      "poseTuningSliders"
    ) as HTMLElement;

    this.#statusOverlayManager = new StatusOverlayManager(
      document.getElementById("connectingOverlay") as HTMLElement,
      uiController
    );
    this.#toolbarManager = new ToolbarManager(
      {
        videoSizeToggleButton: document.getElementById(
          "videoSizeToggleButton"
        ) as HTMLButtonElement,
        streamActionsGroup: document.getElementById(
            "stream-actions-group"
        ) as HTMLElement,
        mirrorBtn: document.getElementById(
          "videoMirrorBtn"
        ) as HTMLButtonElement,
        flipCameraBtn: document.getElementById(
          "flipCameraBtn"
        ) as HTMLButtonElement,
        displayAdjustmentsBtn: document.getElementById(
          "displayAdjustmentsBtn"
        ) as HTMLButtonElement,
        aiTuningBtn: document.getElementById(
          "aiTuningBtn"
        ) as HTMLButtonElement,
        videoStopBtn: document.getElementById(
          "videoStopBtn"
        ) as HTMLButtonElement,
      },
      uiController
    );

    const displaySliders = [
      {
        slider: document.getElementById("brightnessSlider") as HTMLInputElement,
        output: document.getElementById("brightnessValue") as HTMLElement,
        configKey: "lowLightBrightness",
      },
      {
        slider: document.getElementById("contrastSlider") as HTMLInputElement,
        output: document.getElementById("contrastValue") as HTMLElement,
        configKey: "lowLightContrast",
      },
    ].filter((s) => s.slider && s.output) as SliderConfig[];

    this.#displayTuningPanel = new TuningPanelManager(
      document.getElementById("display-adjustments-panel") as HTMLElement,
      displaySliders,
      this.#uiControllerRef.appStore,
      document.getElementById(
        "resetDisplayAdjustmentsBtn"
      ) as HTMLButtonElement,
      { lowLightBrightness: 100, lowLightContrast: 100 }
    );

    const aiSliders = [
      {
        slider: document.getElementById(
          "handDetectionConfidenceSlider"
        ) as HTMLInputElement,
        output: document.getElementById(
          "handDetectionConfidenceOutput"
        ) as HTMLElement,
        configKey: "handDetectionConfidence",
      },
      {
        slider: document.getElementById(
          "handPresenceConfidenceSlider"
        ) as HTMLInputElement,
        output: document.getElementById(
          "handPresenceConfidenceOutput"
        ) as HTMLElement,
        configKey: "handPresenceConfidence",
      },
      {
        slider: document.getElementById(
          "handTrackingConfidenceSlider"
        ) as HTMLInputElement,
        output: document.getElementById(
          "handTrackingConfidenceOutput"
        ) as HTMLElement,
        configKey: "handTrackingConfidence",
      },
      {
        slider: document.getElementById(
          "poseDetectionConfidenceSlider"
        ) as HTMLInputElement,
        output: document.getElementById(
          "poseDetectionConfidenceOutput"
        ) as HTMLElement,
        configKey: "poseDetectionConfidence",
      },
      {
        slider: document.getElementById(
          "posePresenceConfidenceSlider"
        ) as HTMLInputElement,
        output: document.getElementById(
          "posePresenceConfidenceOutput"
        ) as HTMLElement,
        configKey: "posePresenceConfidence",
      },
      {
        slider: document.getElementById(
          "poseTrackingConfidenceSlider"
        ) as HTMLInputElement,
        output: document.getElementById(
          "poseTrackingConfidenceOutput"
        ) as HTMLElement,
        configKey: "poseTrackingConfidence",
      },
    ].filter((s) => s.slider && s.output) as SliderConfig[];

    this.#aiTuningPanel = new TuningPanelManager(
      document.getElementById("ai-tuning-panel") as HTMLElement,
      aiSliders,
      this.#uiControllerRef.appStore
    );

    this.#initialize();
  }

  #initialize(): void {
    this.#attachEventListeners();
    this.updateAllControls();
    this.applyTranslations();
    this.#statusOverlayManager.initialize();
    this.#isInitialized = true;
    setIcon(document.getElementById("resetDisplayAdjustmentsBtn"), "UI_RESET");
  }

  #attachEventListeners(): void {
    this.#overlayContainer.addEventListener("click", this.#handleVideoClick);

    pubsub.subscribe(WEBCAM_EVENTS.STREAM_START, () => {
      this.updateAllControls();
      this.setOverlayState("STREAM_ACTIVE");
    });
    pubsub.subscribe(WEBCAM_EVENTS.STREAM_STOP, () => {
      this.updateAllControls();
      this.setOverlayState("OFFLINE_IDLE");
    });
    pubsub.subscribe(WEBCAM_EVENTS.ERROR, () => {
      this.updateAllControls();
      this.setOverlayState("OFFLINE_IDLE");
    });
    pubsub.subscribe(WEBCAM_EVENTS.STREAM_CONNECTION_CANCELLED, () => {
      this.updateAllControls();
      this.setOverlayState("OFFLINE_IDLE");
    });
    pubsub.subscribe(CAMERA_SOURCE_EVENTS.REQUESTING_STREAM_START, () =>
      this.setOverlayState("INITIAL_CONNECTING")
    );
    pubsub.subscribe(UI_EVENTS.REQUEST_OVERLAY_STATE, (state?: unknown) =>
      this.setOverlayState(state as VideoOverlayState)
    );
    pubsub.subscribe(UI_EVENTS.VIDEO_TOOLBAR_AI_CLICKED, () =>
      this.#togglePanel("ai")
    );
    pubsub.subscribe(UI_EVENTS.VIDEO_TOOLBAR_DISPLAY_CLICKED, () =>
      this.#togglePanel("display")
    );

    this.#uiControllerRef.appStore.subscribe((state: FrontendFullState) => {
      if (this.#isInitialized) this.loadSettings(state);
    });
  }

  #handleVideoClick = (event: MouseEvent): void => {
    const target = event.target as HTMLElement;
    if (
      target.closest(
        ".video-overlay-panel, #stream-actions-group, #videoSizeToggleButton"
      )
    )
      return;

    this.closeAllOverlayPanels();
  };

  #togglePanel(panelType: "display" | "ai"): void {
    if (panelType === "ai") {
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
      this.#uiControllerRef.appStore.getState().isWebcamRunning ?? false;

    if (!isStreamRunning) {
      this.closeAllOverlayPanels();
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
      anyHandFeatureEnabled
    );
    setElementVisibility(this.#poseTuningSliders, poseFeatureEnabled);
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