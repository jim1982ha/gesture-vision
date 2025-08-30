/* FILE: packages/frontend/src/ui/ui-confirmation-modal-manager.ts */
import { UI_EVENTS, pubsub, translate } from '#shared/index.js';
import { setIcon } from './helpers/index.js';

import type { UIController } from './ui-controller-core.js';

interface ConfirmationModalOptions {
  titleKey?: string;
  messageKey: string;
  messageSubstitutions?: Record<string, string | number>;
  confirmTextKey?: string;
  cancelTextKey?: string;
  onConfirm?: () => void;
  onCancel?: () => void;
  isDangerAction?: boolean;
}

export class ConfirmationModalManager {
  #modalElement: HTMLElement | null = null;
  #titleElement: HTMLElement | null = null;
  #messageElement: HTMLElement | null = null;
  #confirmButton: HTMLButtonElement | null = null;
  #cancelButton: HTMLButtonElement | null = null;
  #confirmButtonTextSpan: HTMLElement | null = null;
  #cancelButtonTextSpan: HTMLElement | null = null;

  #onConfirmCallback: (() => void) | null = null;
  #onCancelCallback: (() => void) | null = null;
  #uiControllerRef: UIController | null = null;
  #isReadyAndInitialized = false;
  #readyPromise: Promise<void>;
  #resolveReadyPromise?: (() => void) | null;
  #wasAnotherModalOpen = false;

  constructor(uiControllerRef: UIController | null) {
    this.#uiControllerRef = uiControllerRef;
    this.#readyPromise = new Promise((resolve) => {
      this.#resolveReadyPromise = resolve;
    });

    this.#queryElements();
    if (!this.#modalElement) {
      console.error(
        '[ConfirmationModalManager] CRITICAL: Modal element not found after query. Manager will not function.'
      );
      if (this.#resolveReadyPromise) {
        this.#resolveReadyPromise();
        this.#resolveReadyPromise = null;
      }
      return;
    }

    this.#attachEventListeners();
    this.applyTranslations();
    this.#isReadyAndInitialized = true;
    if (this.#resolveReadyPromise) {
      this.#resolveReadyPromise();
      this.#resolveReadyPromise = null;
    }
  }

  waitUntilReady(): Promise<void> {
    return this.#readyPromise.then(() => {
      if (!this.isReady()) {
        return Promise.reject(
          new Error(
            'ConfirmationModalManager did not initialize correctly (modal element not found).'
          )
        );
      }
    });
  }

  #queryElements(): void {
    const elements = this.#uiControllerRef?._elements;
    if (!elements) {
      console.error(
        '[ConfirmationModalManager] UIController elements not available during query.'
      );
      return;
    }
    this.#modalElement =
      (elements.confirmationModal as HTMLElement | null) ?? null;
    this.#titleElement =
      (elements.confirmationModalTitle as HTMLElement | null) ?? null;
    this.#messageElement =
      (elements.confirmationModalMessage as HTMLElement | null) ?? null;
    this.#confirmButton =
      (elements.confirmationModalConfirmBtn as HTMLButtonElement | null) ??
      null;
    this.#cancelButton =
      (elements.confirmationModalCancelBtn as HTMLButtonElement | null) ?? null;

    this.#confirmButtonTextSpan =
      (elements.confirmationModalConfirmBtnText as HTMLElement | null) ??
      this.#confirmButton?.querySelector('span:not(.material-icons)') ??
      null;
    this.#cancelButtonTextSpan =
      (elements.confirmationModalCancelBtnText as HTMLElement | null) ??
      this.#cancelButton?.querySelector('span:not(.material-icons)') ??
      null;
  }

  #attachEventListeners(): void {
    if (!this.#modalElement) return;

    this.#confirmButton?.addEventListener('click', this.#handleConfirm);
    this.#cancelButton?.addEventListener('click', this.#handleCancel);
    this.#modalElement?.addEventListener('keydown', (event: KeyboardEvent) => {
      if (
        event.key === 'Escape' &&
        this.#modalElement?.classList.contains('visible')
      ) {
        this.#handleCancel();
      }
    });
  }

  #handleConfirm = (): void => {
    if (typeof this.#onConfirmCallback === 'function') {
      this.#onConfirmCallback();
    }
    this.hide();
  };

  #handleCancel = (): void => {
    if (typeof this.#onCancelCallback === 'function') {
      this.#onCancelCallback();
    }
    this.hide();
  };

  public applyTranslations = (): void => {
    if (!this.isReady()) return;
    if (this.#titleElement && !this.#titleElement.dataset.dynamicTitle) {
      this.#titleElement.textContent = translate('confirmActionTitle');
    }

    const setButtonText = (
      button: HTMLButtonElement | null,
      textSpan: HTMLElement | null,
      translationKey: string,
      defaultText: string
    ) => {
      if (button && textSpan) {
        textSpan.textContent = translate(translationKey, {
          defaultValue: defaultText,
        });
      }
    };

    setButtonText(
      this.#confirmButton,
      this.#confirmButtonTextSpan,
      'confirm',
      'Confirm'
    );
    setButtonText(
      this.#cancelButton,
      this.#cancelButtonTextSpan,
      'cancel',
      'Cancel'
    );

    if (this.#confirmButton) {
      this.#confirmButton.setAttribute('aria-label', translate('confirm'));
    }
    if (this.#cancelButton) {
      this.#cancelButton.setAttribute('aria-label', translate('cancel'));
    }

    setIcon(this.#confirmButton, 'UI_CONFIRM');
    setIcon(this.#cancelButton, 'UI_CANCEL');
  };

  isReady(): boolean {
    return this.#isReadyAndInitialized && !!this.#modalElement;
  }

  show({
    titleKey = 'confirmActionTitle',
    messageKey,
    messageSubstitutions = {},
    confirmTextKey = 'confirm',
    cancelTextKey = 'cancel',
    onConfirm,
    onCancel,
    isDangerAction = true,
  }: ConfirmationModalOptions): void {
    if (!this.isReady()) {
      if (window.confirm(translate(messageKey, messageSubstitutions))) {
        if (onConfirm) onConfirm();
      } else {
        if (onCancel) onCancel();
      }
      return;
    }

    this.#wasAnotherModalOpen = document.body.classList.contains('modal-open');
    if (this.#titleElement) {
      this.#titleElement.textContent = translate(titleKey);
      this.#titleElement.dataset.dynamicTitle = 'true';
    }
    if (this.#messageElement)
      this.#messageElement.textContent = translate(
        messageKey,
        messageSubstitutions
      );

    const setButtonText = (
      button: HTMLButtonElement | null,
      textSpan: HTMLElement | null,
      translationKey: string,
      defaultText: string
    ) => {
      if (button && textSpan) {
        textSpan.textContent = translate(translationKey, {
          defaultValue: defaultText,
        });
      }
    };
    setButtonText(
      this.#confirmButton,
      this.#confirmButtonTextSpan,
      confirmTextKey,
      'Confirm'
    );
    setButtonText(
      this.#cancelButton,
      this.#cancelButtonTextSpan,
      cancelTextKey,
      'Cancel'
    );

    if (this.#confirmButton) {
      this.#confirmButton.className = 'btn';
      this.#confirmButton.classList.add(
        isDangerAction ? 'btn-danger' : 'btn-primary'
      );
      setIcon(this.#confirmButton, isDangerAction ? 'UI_DELETE' : 'UI_CONFIRM');
    }
    setIcon(this.#cancelButton, 'UI_CANCEL');

    this.#onConfirmCallback = onConfirm ?? null;
    this.#onCancelCallback = onCancel ?? null;
    this.#modalElement?.classList.remove('hidden');
    this.#modalElement?.classList.add('visible');
    document.body.classList.add('modal-open', 'modal-confirmation-open');
    this.#confirmButton?.focus();
  }

  hide(): void {
    if (!this.isReady()) return;
    this.#modalElement?.classList.add('hidden');
    this.#modalElement?.classList.remove('visible');
    document.body.classList.remove('modal-confirmation-open');

    if (!this.#wasAnotherModalOpen) {
      document.body.classList.remove('modal-open');
      pubsub.publish(UI_EVENTS.REQUEST_MODAL_BLUR_UPDATE);
    }
    this.#wasAnotherModalOpen = false;

    this.#onConfirmCallback = null;
    this.#onCancelCallback = null;
    if (this.#titleElement) delete this.#titleElement.dataset.dynamicTitle;
  }
}