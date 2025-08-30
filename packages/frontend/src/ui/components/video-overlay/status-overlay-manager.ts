/* FILE: packages/frontend/src/ui/components/video-overlay/status-overlay-manager.ts */
import { translate } from '#shared/index.js';
import { setIcon } from '#frontend/ui/helpers/index.js';
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
  #currentState: VideoOverlayState = 'OFFLINE_IDLE';
  #uiControllerRef: UIController;

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
    this.#attachEventListeners();
  }

  #attachEventListeners(): void {
    this.#overlayElement.addEventListener('click', this.#handleClick);
  }

  #handleClick = (event: MouseEvent): void => {
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
      case 'STREAM_ACTIVE':
        if ((event.target as HTMLElement).closest('.overlay-icon-container')) {
          this.#uiControllerRef.cameraService?.stopStream();
        }
        break;
    }
  };

  public setState(newState: VideoOverlayState): void {
    if (this.#currentState === newState) return;
    this.#currentState = newState;

    // CLEANUP: The .visible class is no longer needed as visibility is handled
    // directly by the state-specific classes in the CSS.
    this.#overlayElement.classList.remove(
      'state-initial-connecting',
      'state-offline-idle',
      'state-stream-active'
    );

    let iconKey: Parameters<typeof setIcon>[1] | null = null;
    let textContent = '';

    switch (newState) {
      case 'INITIAL_CONNECTING':
        this.#overlayElement.classList.add('state-initial-connecting');
        textContent = translate('connecting');
        break;
      case 'OFFLINE_IDLE':
        this.#overlayElement.classList.add('state-offline-idle');
        iconKey = 'UI_PLAY';
        break;
      case 'STREAM_ACTIVE':
        this.#overlayElement.classList.add('state-stream-active');
        iconKey = 'UI_STOP_STREAM';
        break;
      case 'hidden':
        // No class added, will default to hidden.
        break;
    }

    if (this.#iconElement && iconKey) setIcon(this.#iconElement, iconKey);
    if (this.#textElement) this.#textElement.textContent = textContent;
  }
}