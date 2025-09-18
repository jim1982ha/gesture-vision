/* FILE: packages/frontend/src/ui/ui-action-handler.ts */
import { UI_EVENTS, pubsub } from '#shared/index.js';
import type { UIController } from './ui-controller-core.js';
import { modalStack } from './managers/modal-manager.js';

/**
 * Handles all direct user interactions with the DOM, such as clicks and key presses.
 */
export class UIActionHandler {
    #uiControllerRef: UIController;
    #boundGlobalKeyDownHandler = this.#handleGlobalKeyDown.bind(this);

    constructor(uiController: UIController) {
        this.#uiControllerRef = uiController;
    }

    public initialize(): void {
        document.addEventListener('keydown', this.#boundGlobalKeyDownHandler);

        document.getElementById('cameraList')?.addEventListener('click', (event) => {
            const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button[data-device-id]');
            if (button) {
                const deviceId = button.dataset.deviceId;
                this.#uiControllerRef.modalManager.closeCameraSelectModal();
                pubsub.publish(UI_EVENTS.CAMERA_LIST_ITEM_CLICKED, deviceId);
            }
        });

        document.getElementById('configListContainer')?.addEventListener('click', (event) => {
            const card = (event.target as HTMLElement).closest<HTMLElement>('.card-item');
            if (!card) return;

            const deleteBtn = (event.target as HTMLElement).closest('.delete-btn');
            const gestureName = card.dataset.gestureName;

            if (deleteBtn && gestureName) {
                event.stopPropagation();
                this.handleDeleteGestureConfig(gestureName);
                return;
            }

            const editBtn = (event.target as HTMLElement).closest('.edit-btn');
            if (gestureName && editBtn) {
                event.stopPropagation();
                pubsub.publish(UI_EVENTS.REQUEST_EDIT_CONFIG, gestureName);
            }
        });
        
        document.getElementById('clearHistoryButton')?.addEventListener('click', this.#handleClearHistory);

        const openAboutModal = () => pubsub.publish('docs:requestOpen', 'ABOUT');
        document.getElementById('appBrand')?.addEventListener('click', openAboutModal);
        document.getElementById('wsStatusIndicator')?.addEventListener('click', openAboutModal);
    }

    public destroy(): void {
        document.removeEventListener('keydown', this.#boundGlobalKeyDownHandler);
    }

    #handleGlobalKeyDown(event: KeyboardEvent): void {
        if (event.key !== 'Escape') return;

        if (this.#uiControllerRef._languageManager?.isDropdownOpen()) {
            this.#uiControllerRef._languageManager.toggleDropdown();
            return;
        }
        
        if (this.#uiControllerRef._headerTogglesController?.isDropdownOpen()) {
            this.#uiControllerRef._headerTogglesController.closeActiveDropdown();
            return;
        }

        const topModal = modalStack.peek();
        switch (topModal) {
            case 'gesture-studio':
            case 'landmark-selector':
            case 'dashboard':
                pubsub.publish(`escape-for-${topModal}`);
                return;
            case 'main-settings':
                this.#uiControllerRef.modalManager.closeSettingsModal();
                return;
            case 'docs':
                this.#uiControllerRef.modalManager.closeDocsModal();
                return;
            case 'camera':
                this.#uiControllerRef.modalManager.closeCameraSelectModal();
                return;
        }
        
        if (this.#uiControllerRef._confirmationModalMgr?.isVisible()) {
            this.#uiControllerRef._confirmationModalMgr.hide(true);
            return;
        }

        if (this.#uiControllerRef.sidebarManager?.isHistorySidebarOpen()) {
            this.#uiControllerRef.sidebarManager.closeHistorySidebar();
            return;
        }
    }

    #handleClearHistory = (): void => {
        this.#uiControllerRef._confirmationModalMgr?.show({
          titleKey: 'confirmClearHistory',
          messageKey: 'confirmClearHistory',
          confirmTextKey: 'clearHistory',
          onConfirm: () => {
            this.#uiControllerRef.appStore.getState().actions.clearHistory();
            pubsub.publish(UI_EVENTS.SHOW_NOTIFICATION, { messageKey: "historyCleared", type: "info" });
          }
        });
    };

    public handleDeleteGestureConfig = (gestureName: string): void => {
        const configs = this.#uiControllerRef.getGestureConfigsSnapshot();
        const configToDelete = configs.find(c => ('gesture' in c ? c.gesture : c.pose) === gestureName);
        if (!configToDelete) return;

        this.#uiControllerRef._confirmationModalMgr?.show({
          messageKey: 'confirmDeleteMessage',
          messageSubstitutions: { item: gestureName },
          confirmTextKey: 'delete',
          onConfirm: () => {
            const updatedConfigs = configs.filter(c => ('gesture' in c ? c.gesture : c.pose) !== gestureName);
            this.#uiControllerRef.updateGestureConfigs(updatedConfigs);
            if (this.#uiControllerRef.getOriginalNameBeingEdited() === gestureName) {
              this.#uiControllerRef._gestureConfigModalManager.hide();
            }
          },
        });
    };
}