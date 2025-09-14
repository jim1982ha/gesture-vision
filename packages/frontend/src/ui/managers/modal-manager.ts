/* FILE: packages/frontend/src/ui/managers/modal-manager.ts */
import { UI_EVENTS, pubsub } from '#shared/index.js';
import { toggleElementClass, setIcon } from '#frontend/ui/helpers/index.js';
import type { UIController } from '#frontend/ui/ui-controller-core.js';

export class ModalManager {
  #mainSettingsModal: HTMLElement | null;
  #cameraSelectModal: HTMLElement | null;
  #docsModal: HTMLElement | null;
  #mainSettingsToggle: HTMLButtonElement | null;
  #docsCloseButton: HTMLButtonElement | null;
  #cameraSelectCloseButton: HTMLButtonElement | null;
  
  #uiControllerRef: UIController;
  #activeModalId: string | null = null;
  #isInitialized = false;

  constructor(uiController: UIController) {
    this.#uiControllerRef = uiController;
    this.#mainSettingsModal = document.getElementById("mainSettingsModal");
    this.#cameraSelectModal = document.getElementById("cameraSelectModal");
    this.#docsModal = document.getElementById("docsModal");
    this.#mainSettingsToggle = document.getElementById("mainSettingsToggle") as HTMLButtonElement | null;
    this.#docsCloseButton = document.getElementById("docsCloseButton") as HTMLButtonElement | null;
    this.#cameraSelectCloseButton = document.getElementById("cameraSelectCloseButton") as HTMLButtonElement | null;
  }
  
  public initialize(): void {
      if (this.#isInitialized) return;
      this.#attachEventListeners();
      this.applyTranslations();
      this.#isInitialized = true;
  }

  #attachEventListeners(): void {
    this.#mainSettingsToggle?.addEventListener('click', () =>
      this.toggleSettingsModal()
    );
    this.#docsCloseButton?.addEventListener('click', () =>
      this.closeDocsModal()
    );
    this.#cameraSelectCloseButton?.addEventListener('click', () =>
      this.closeCameraSelectModal()
    );
  }

  public applyTranslations(): void {
    const translate = this.#uiControllerRef.translationService.translate;
    const cameraModalTitle = document.getElementById("cameraModalTitleText");
    if (cameraModalTitle) cameraModalTitle.textContent = translate('selectCameraSource');
    setIcon(document.getElementById("cameraModalHeader")?.querySelector('.header-icon'), 'UI_WEBCAM');
  }

  #getModalElementById = (id: string): HTMLElement | null => {
    if (id === 'main-settings') return this.#mainSettingsModal ?? null;
    if (id === 'camera') return this.#cameraSelectModal ?? null;
    if (id === 'docs') return this.#docsModal ?? null;
    return null;
  };

  #toggleModal(id: string, force?: boolean): void {
    const modalElement = this.#getModalElementById(id);
    if (!modalElement) return;

    const isCurrentlyActive = this.#activeModalId === id;
    const shouldBeVisible = force !== undefined ? force : !isCurrentlyActive;

    if (shouldBeVisible === isCurrentlyActive && force === undefined) return;

    if (shouldBeVisible) {
      this.#uiControllerRef.sidebarManager?.closeAllSidebars();
      this.#uiControllerRef.modalManager?.closeAllModals();
      if (id === 'main-settings')
        this.#uiControllerRef._globalSettingsForm?.prepareToShowDefaultTab();
      if (id === 'camera') {
        this.#uiControllerRef.cameraManager
          ?.getCameraSourceManager()
          .refreshDeviceList();
        pubsub.publish(UI_EVENTS.MODAL_OPENED_CAMERA_SELECT);
      }
      this.#activeModalId = id;
    } else if (this.#activeModalId === id) {
      this.#activeModalId = null;
    }

    toggleElementClass(modalElement, 'visible', shouldBeVisible);
    document.body.classList.toggle(`modal-${id}-open`, shouldBeVisible);
    pubsub.publish(UI_EVENTS.MODAL_VISIBILITY_CHANGED, {
      modalId: id,
      isVisible: shouldBeVisible,
    });
    this.#checkToRemoveBlurClass();
  }

  #checkToRemoveBlurClass(): void {
    const isAnyModalOpen =
      !!this.#activeModalId ||
      document.getElementById('confirmationModal')?.classList.contains('visible');
    toggleElementClass(document.body, 'modal-open', isAnyModalOpen);
  }

  public getActiveModalId = (): string | null => this.#activeModalId;

  public closeAllModals = (): void => {
    this.closeSettingsModal();
    this.closeCameraSelectModal();
    this.closeDocsModal();
    this.#checkToRemoveBlurClass();
  };

  public toggleSettingsModal = (force?: boolean): void =>
    this.#toggleModal('main-settings', force);
  public closeSettingsModal = (): void => {
    if (this.#activeModalId === 'main-settings')
      this.#toggleModal('main-settings', false);
  };
  public toggleCameraSelectModal = (force?: boolean): void =>
    this.#toggleModal('camera', force);
  public closeCameraSelectModal = (): void => {
    if (this.#activeModalId === 'camera') this.#toggleModal('camera', false);
  };
  public closeDocsModal = (): void => {
    if (this.#activeModalId === 'docs') this.#toggleModal('docs', false);
  };
}