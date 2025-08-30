/* FILE: packages/frontend/src/ui/components/video-overlay/toolbar-manager.ts */
import { UI_EVENTS, pubsub, translate } from '#shared/index.js';
import { setIcon, setElementVisibility } from '#frontend/ui/helpers/index.js';
import type { UIController } from '#frontend/ui/ui-controller-core.js';

export interface ToolbarElements {
  toolbarContainer: HTMLElement;
  videoSizeToggleButton: HTMLButtonElement;
  mirrorBtn: HTMLButtonElement;
  flipCameraBtn: HTMLButtonElement;
  displayAdjustmentsBtn: HTMLButtonElement;
  aiTuningBtn: HTMLButtonElement;
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
      toolbarContainer,
      mirrorBtn,
      flipCameraBtn,
      displayAdjustmentsBtn,
      aiTuningBtn,
    } = this.#elements;

    toolbarContainer.addEventListener('mouseenter', this.clearVisibilityTimeout);
    toolbarContainer.addEventListener('mouseleave', this.scheduleHide);
    // FIX: The listener that was here is now correctly located in LayoutManager.
    mirrorBtn.addEventListener('click', () =>
      this.#uiControllerRef.cameraManager.toggleMirroringForCurrentStream()
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
  }

  public setContainerVisibility(isVisible: boolean): void {
    setElementVisibility(this.#elements.toolbarContainer, isVisible, 'flex');
  }

  public scheduleHide = (): void => {
    this.clearVisibilityTimeout();
    this.#visibilityTimeout = window.setTimeout(() => {
        // Just let the hover state handle it. No JS action needed.
    }, 2000);
  };
  
  public clearVisibilityTimeout = (): void => {
    if (this.#visibilityTimeout) clearTimeout(this.#visibilityTimeout);
  };
  
  public updateButtonStates(): void {
    const camManager = this.#uiControllerRef.cameraManager;
    const isMobile = this.#uiControllerRef.sidebarManager.isMobile;
    const isStreamRunning = camManager.isStreaming();

    setElementVisibility(this.#elements.aiTuningBtn, isStreamRunning, 'flex');
    setElementVisibility(this.#elements.displayAdjustmentsBtn, isStreamRunning, 'flex');
    setElementVisibility(this.#elements.mirrorBtn, isStreamRunning, 'flex');
    
    const canFlip = camManager.canFlipCamera();
    const isRtsp = camManager.isStreamingRtsp();
    setElementVisibility(
      this.#elements.flipCameraBtn,
      canFlip && isMobile && !isRtsp && isStreamRunning,
      'flex'
    );
    this.#elements.mirrorBtn.classList.toggle('active', camManager.isMirrored());
  }

  public applyTranslations(): void {
    const setTooltip = (el: HTMLElement | null, key: string) => {
      if (el) el.title = translate(key);
    };
    setTooltip(this.#elements.mirrorBtn, 'toggleMirrorView');
    setTooltip(this.#elements.flipCameraBtn, 'flipCamera');
    setTooltip(this.#elements.aiTuningBtn, 'toggleAITuningPanelTooltip');
    setTooltip(this.#elements.displayAdjustmentsBtn, 'displayAdjustments');

    setIcon(this.#elements.mirrorBtn, 'UI_VIDEO_MIRROR');
    setIcon(this.#elements.flipCameraBtn, 'UI_FLIP_CAMERA');
    setIcon(this.#elements.displayAdjustmentsBtn, 'UI_DISPLAY_ADJUSTMENTS');
    setIcon(this.#elements.aiTuningBtn, 'UI_AI_TUNING');
  }
}