/* FILE: packages/frontend/src/ui/components/video-overlay/toolbar-manager.ts */
import { UI_EVENTS, pubsub } from '#shared/index.js';
import { setIcon } from '#frontend/ui/helpers/index.js';
import type { UIController } from '#frontend/ui/ui-controller-core.js';
import { secureStorage } from '#shared/services/security-utils.js';

const VIDEO_SIZE_CONSTRAINED_KEY = "videoSizeConstrainedPreference";

export interface ToolbarElements {
  videoSizeToggleButton: HTMLButtonElement;
  streamActionsGroup: HTMLElement;
  mirrorBtn: HTMLButtonElement;
  flipCameraBtn: HTMLButtonElement;
  displayAdjustmentsBtn: HTMLButtonElement;
  aiTuningBtn: HTMLButtonElement;
  videoStopBtn: HTMLButtonElement;
}

export class ToolbarManager {
  #elements: ToolbarElements;
  #uiControllerRef: UIController;
  #visibilityTimeout: number | null = null;

  constructor(elements: ToolbarElements, uiController: UIController) {
    this.#elements = elements;
    this.#uiControllerRef = uiController;
    this.#attachEventListeners();
    this.applyTranslations();
  }

  #attachEventListeners(): void {
    const {
      videoSizeToggleButton,
      streamActionsGroup,
      mirrorBtn,
      flipCameraBtn,
      displayAdjustmentsBtn,
      aiTuningBtn,
      videoStopBtn,
    } = this.#elements;

    streamActionsGroup.addEventListener('mouseenter', this.clearVisibilityTimeout);
    streamActionsGroup.addEventListener('mouseleave', this.scheduleHide);
    
    videoSizeToggleButton.addEventListener('click', () => {
        if (this.#uiControllerRef.sidebarManager?.isMobile) {
            this.#uiControllerRef.layoutManager.toggleVideoFullscreen();
        } else {
            const currentIsConstrained = (secureStorage.get(VIDEO_SIZE_CONSTRAINED_KEY) as boolean | null) ?? true;
            secureStorage.set(VIDEO_SIZE_CONSTRAINED_KEY, !currentIsConstrained);
            this.#uiControllerRef.layoutManager.applyVideoSizePreference();
        }
    });

    mirrorBtn.addEventListener('click', () =>
      pubsub.publish(UI_EVENTS.REQUEST_MIRROR_TOGGLE)
    );
    flipCameraBtn.addEventListener('click', () =>
      this.#uiControllerRef.cameraManager.flipCamera()
    );
    displayAdjustmentsBtn.addEventListener('click', () =>
      pubsub.publish(UI_EVENTS.VIDEO_TOOLBAR_DISPLAY_CLICKED)
    );
    aiTuningBtn.addEventListener('click', () =>
      pubsub.publish(UI_EVENTS.VIDEO_TOOLBAR_AI_CLICKED)
    );
    videoStopBtn.addEventListener('click', () => 
        this.#uiControllerRef.cameraService.stopStream()
    );
  }

  public scheduleHide = (): void => {
    this.clearVisibilityTimeout();
  };
  
  public clearVisibilityTimeout = (): void => {
    if (this.#visibilityTimeout) clearTimeout(this.#visibilityTimeout);
  };
  
  public updateButtonStates(): void {
    const camManager = this.#uiControllerRef.cameraManager;
    const isMobile = this.#uiControllerRef.sidebarManager.isMobile;
    const isStreamRunning = camManager.isStreaming();

    this.#elements.streamActionsGroup.classList.toggle('hidden', !isStreamRunning);
    
    const canFlip = camManager.canFlipCamera();
    const isRtsp = camManager.isStreamingRtsp();
    this.#elements.flipCameraBtn.classList.toggle('hidden', !canFlip || !isMobile || isRtsp || !isStreamRunning);
    this.#elements.mirrorBtn.classList.toggle('active', camManager.isMirrored());
  }

  public applyTranslations(): void {
    const translate = this.#uiControllerRef.translationService.translate;
    const setTooltip = (el: HTMLElement | null, key: string) => {
      if (el) el.title = translate(key);
    };
    setTooltip(this.#elements.mirrorBtn, 'toggleMirrorView');
    setTooltip(this.#elements.flipCameraBtn, 'flipCamera');
    setTooltip(this.#elements.aiTuningBtn, 'toggleAITuningPanelTooltip');
    setTooltip(this.#elements.displayAdjustmentsBtn, 'displayAdjustments');
    setTooltip(this.#elements.videoStopBtn, 'stop');

    setIcon(this.#elements.mirrorBtn, 'UI_VIDEO_MIRROR');
    setIcon(this.#elements.flipCameraBtn, 'UI_FLIP_CAMERA');
    setIcon(this.#elements.displayAdjustmentsBtn, 'UI_DISPLAY_ADJUSTMENTS');
    setIcon(this.#elements.aiTuningBtn, 'UI_AI_TUNING');
    setIcon(this.#elements.videoStopBtn, 'UI_STOP_STREAM');
  }
}