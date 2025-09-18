/* FILE: packages/frontend/src/ui/managers/modal-manager.ts */
import { UI_EVENTS, pubsub } from '#shared/index.js';
import { toggleElementClass, setIcon } from '#frontend/ui/helpers/index.js';
import type { UIController } from '#frontend/ui/ui-controller-core.js';

/** A simple stack to manage layered modals for the Escape key handler. */
class ModalStackManager {
    #stack: string[] = [];

    push(modalId: string): void {
        if (!this.#stack.includes(modalId)) {
            this.#stack.push(modalId);
        }
    }

    pop(): string | undefined {
        return this.#stack.pop();
    }

    peek(): string | undefined {
        return this.#stack.length > 0 ? this.#stack[this.#stack.length - 1] : undefined;
    }

    remove(modalId: string): void {
        this.#stack = this.#stack.filter(id => id !== modalId);
    }
}

export const modalStack = new ModalStackManager();

export class ModalManager {
  #mainSettingsModal: HTMLElement | null;
  #cameraSelectModal: HTMLElement | null;
  #docsModal: HTMLElement | null;
  #mainSettingsToggle: HTMLButtonElement | null;
  #docsCloseButton: HTMLButtonElement | null;
  #cameraSelectCloseButton: HTMLButtonElement | null;
  
  #uiControllerRef: UIController;
  #isInitialized = false;

  #boundToggleSettings: () => void;
  #boundCloseDocs: () => void;
  #boundCloseCameraSelect: () => void;

  constructor(uiController: UIController) {
    this.#uiControllerRef = uiController;
    this.#mainSettingsModal = document.getElementById("mainSettingsModal");
    this.#cameraSelectModal = document.getElementById("cameraSelectModal");
    this.#docsModal = document.getElementById("docsModal");
    this.#mainSettingsToggle = document.getElementById("mainSettingsToggle") as HTMLButtonElement | null;
    this.#docsCloseButton = document.getElementById("docsCloseButton") as HTMLButtonElement | null;
    this.#cameraSelectCloseButton = document.getElementById("cameraSelectCloseButton") as HTMLButtonElement | null;

    this.#boundToggleSettings = () => this.toggleSettingsModal();
    this.#boundCloseDocs = this.closeDocsModal.bind(this);
    this.#boundCloseCameraSelect = this.closeCameraSelectModal.bind(this);
  }
  
  public initialize(): void {
      if (this.#isInitialized) return;
      this.#attachEventListeners();
      this.applyTranslations();
      this.#isInitialized = true;
  }
  
  public destroy(): void {
    this.#mainSettingsToggle?.removeEventListener('click', this.#boundToggleSettings);
    this.#docsCloseButton?.removeEventListener('click', this.#boundCloseDocs);
    this.#cameraSelectCloseButton?.removeEventListener('click', this.#boundCloseCameraSelect);
  }

  #attachEventListeners(): void {
    this.#mainSettingsToggle?.addEventListener('click', this.#boundToggleSettings);
    this.#docsCloseButton?.addEventListener('click', this.#boundCloseDocs);
    this.#cameraSelectCloseButton?.addEventListener('click', this.#boundCloseCameraSelect);
  }

  public applyTranslations(): void {
    const translate = this.#uiControllerRef.translationService.translate;
    const cameraModalTitle = document.getElementById("cameraModalTitleText");
    if (cameraModalTitle) cameraModalTitle.textContent = translate('selectCameraSource');
    setIcon(document.getElementById("cameraModalHeader")?.querySelector('.header-icon'), 'UI_WEBCAM');
    setIcon(this.#cameraSelectCloseButton, 'UI_CLOSE');
  }

  #getModalElementById(id: string): HTMLElement | null {
    if (id === 'main-settings') return this.#mainSettingsModal ?? null;
    if (id === 'camera') return this.#cameraSelectModal ?? null;
    if (id === 'docs') return this.#docsModal ?? null;
    return null;
  }

  #toggleModal(id: string, force?: boolean): void {
    const modalElement = this.#getModalElementById(id);
    if (!modalElement) return;

    const isCurrentlyVisible = modalElement.classList.contains('visible');
    const shouldBeVisible = force !== undefined ? force : !isCurrentlyVisible;

    if (shouldBeVisible) {
      if (id === 'main-settings') this.#uiControllerRef._globalSettingsForm?.prepareToShowDefaultTab();
      if (id === 'camera') {
        this.#uiControllerRef.cameraManager?.getCameraSourceManager().refreshDeviceList();
        pubsub.publish(UI_EVENTS.MODAL_OPENED_CAMERA_SELECT);
      }
      modalStack.push(id);
    } else {
      modalStack.remove(id);
    }

    toggleElementClass(modalElement, 'visible', shouldBeVisible);
    document.body.classList.toggle(`modal-${id}-open`, shouldBeVisible);
    pubsub.publish(UI_EVENTS.MODAL_VISIBILITY_CHANGED, { modalId: id, isVisible: shouldBeVisible });
    this.#checkBodyModalClass();
  }

  #checkBodyModalClass(): void {
    const isAnyModalOpen =
      !!modalStack.peek() || document.getElementById('confirmationModal')?.classList.contains('visible');
    toggleElementClass(document.body, 'modal-open', isAnyModalOpen);
  }

  public getActiveModalId(): string | undefined {
    return modalStack.peek();
  }

  public closeAllModals(): void {
    this.closeSettingsModal();
    this.closeCameraSelectModal();
    this.closeDocsModal();
  }

  public toggleSettingsModal(force?: boolean): void { this.#toggleModal('main-settings', force); }
  public closeSettingsModal(): void { this.#toggleModal('main-settings', false); }
  public toggleCameraSelectModal(force?: boolean): void { this.#toggleModal('camera', force); }
  public closeCameraSelectModal(): void { this.#toggleModal('camera', false); }
  public toggleDocsModal(force?: boolean): void { this.#toggleModal('docs', force); }
  public closeDocsModal(): void { this.#toggleModal('docs', false); }
}