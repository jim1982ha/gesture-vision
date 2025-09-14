/* FILE: packages/frontend/src/ui/components/video-overlay/status-overlay-manager.ts */
import { setIcon, setElementVisibility } from '#frontend/ui/helpers/index.js';
import type { UIController } from '#frontend/ui/ui-controller-core.js';

export type VideoOverlayState =
  | 'INITIAL_CONNECTING'
  | 'OFFLINE_IDLE'
  | 'STREAM_ACTIVE'
  | 'hidden';

export class StatusOverlayManager {
  #overlayElement: HTMLElement;
  #textContainer: HTMLElement;
  #iconContainer: HTMLElement;
  #iconElement: HTMLElement;
  #textElement: HTMLElement;
  #currentState: VideoOverlayState | null = null;
  #uiControllerRef: UIController;

  #boundHandleClick = this.#handleClick.bind(this);

  constructor(overlayElement: HTMLElement, uiController: UIController) {
    this.#overlayElement = overlayElement;
    this.#uiControllerRef = uiController;
    this.#textContainer = overlayElement.querySelector(
      '.overlay-text-container'
    )!;
    this.#iconContainer = overlayElement.querySelector(
      '.overlay-icon-container'
    )!;
    this.#iconElement = this.#iconContainer.querySelector('.material-icons')!;
    this.#textElement = this.#textContainer.querySelector('#connectingText')!;
  }

  public initialize(): void {
    this.#attachEventListeners();
    this.setState('OFFLINE_IDLE');
  }
  
  public destroy(): void {
    this.#overlayElement.removeEventListener('click', this.#boundHandleClick);
  }

  #attachEventListeners(): void {
    this.#overlayElement.addEventListener('click', this.#boundHandleClick);
  }

  #handleClick(event: MouseEvent): void {
    switch (this.#currentState) {
      case 'INITIAL_CONNECTING':
        if ((event.target as HTMLElement) === this.#overlayElement) {
          this.#uiControllerRef.cameraService.stopStream();
        }
        break;
      case 'OFFLINE_IDLE':
        if ((event.target as HTMLElement).closest('.overlay-icon-container')) {
          this.#uiControllerRef.modalManager?.toggleCameraSelectModal(true);
        }
        break;
    }
  }

  public setState(newState: VideoOverlayState): void {
    if (this.#currentState === newState) return;
    this.#currentState = newState;
    const translate = this.#uiControllerRef.translationService.translate;

    const isOverlayVisibleAndActive = newState === 'OFFLINE_IDLE' || newState === 'INITIAL_CONNECTING';
    
    this.#overlayElement.classList.toggle('overlay-active', isOverlayVisibleAndActive);
    this.#overlayElement.classList.toggle('hidden', !isOverlayVisibleAndActive);
    
    let iconKey: Parameters<typeof setIcon>[1] | null = null;
    let textContent = '';
    let showText = false;
    let showIcon = false;

    switch (newState) {
      case 'INITIAL_CONNECTING':
        textContent = translate('connecting');
        showText = true;
        showIcon = false;
        break;
      case 'OFFLINE_IDLE':
        iconKey = 'UI_PLAY';
        showText = false;
        showIcon = true;
        break;
      case 'STREAM_ACTIVE':
      case 'hidden':
        showIcon = false;
        showText = false;
        break;
    }

    setElementVisibility(this.#textContainer, showText);
    setElementVisibility(this.#iconContainer, showIcon);
    if (this.#iconElement && iconKey) setIcon(this.#iconElement, iconKey);
    if (this.#textElement) this.#textElement.textContent = textContent;
  }
}