/* FILE: packages/frontend/src/ui/modals/gesture-config-modal-manager.ts */
import type { UIController } from '#frontend/ui/ui-controller-core.js';
import { GestureConfigForm } from '#frontend/ui/components/gesture-form/gesture-config-form.js';
import { pubsub, UI_EVENTS, type GestureConfig, type PoseConfig } from '#shared/index.js';

/**
 * Manages the lifecycle and state of the gesture configuration modal.
 * It orchestrates the GestureConfigForm and handles showing/hiding the modal.
 */
export class GestureConfigModalManager {
    #modalElement: HTMLElement | null;
    #form: GestureConfigForm;
    #uiControllerRef: UIController;
    #isModalVisible = false;

    constructor(uiControllerRef: UIController) {
        this.#uiControllerRef = uiControllerRef;
        this.#modalElement = document.getElementById("gestureConfigModal");

        this.#form = new GestureConfigForm(this, this.#uiControllerRef);
    }

    public initialize(): void {
        this.#form.initialize();
        this.#attachEventListeners();
    }

    #attachEventListeners(): void {
        this.#modalElement?.addEventListener('click', (e) => {
            const target = e.target as HTMLElement;
            if (target.closest('#addGestureConfig')) this.#handleSave();
            if (target.closest('#cancelEditButton')) this.hide();
            if (target.closest('#gestureConfigModalCloseBtn')) this.hide();
        });

        document.getElementById('addNewActionButton')?.addEventListener('click', () => this.startNew());

        pubsub.subscribe(UI_EVENTS.REQUEST_EDIT_CONFIG, (gestureName?: unknown) => {
            const index = this.#uiControllerRef.getGestureConfigsSnapshot().findIndex(
                (c: GestureConfig | PoseConfig) => ('gesture' in c ? c.gesture : c.pose) === (gestureName as string)
            );
            if (index > -1) {
                this.startEdit(index);
            }
        });
    }

    public startNew(): void {
        this.#uiControllerRef.setEditingConfigIndex(null);
        this.#form.populateForm(null, false);
        this.show();
    }

    public startEdit(index: number): void {
        const configs = this.#uiControllerRef.getGestureConfigsSnapshot();
        if (index < 0 || index >= configs.length) return;

        const config = configs[index];
        const gestureNameForCard = 'gesture' in config ? config.gesture : config.pose;
        this.#uiControllerRef.setEditingConfigIndex(index, gestureNameForCard);
        
        this.#form.populateForm(config, true);
        this.show();
    }

    public show(): void {
        if (this.#isModalVisible) return;
        this.#isModalVisible = true;
        this.#uiControllerRef.sidebarManager.closeAllSidebars();
        this.#uiControllerRef.modalManager.closeAllModals();
        this.#modalElement?.classList.add('visible');
        document.body.classList.add('modal-open');
    }

    public hide(): void {
        if (!this.#isModalVisible) return;
        this.#isModalVisible = false;
        this.#modalElement?.classList.remove('visible');
        document.body.classList.remove('modal-open');
        this.#uiControllerRef.setEditingConfigIndex(null);
    }

    async #handleSave(): Promise<void> {
        const validationResult = this.#form.validateAndGetData();
        if (!validationResult.isValid || !validationResult.configData) return;

        const configData = validationResult.configData;
        const editingIndex = this.#uiControllerRef.getEditingConfigIndex();
        
        const currentConfigs = this.#uiControllerRef.getGestureConfigsSnapshot();
        const updatedConfigs = editingIndex !== null
            ? currentConfigs.map((c: GestureConfig | PoseConfig, i: number) => i === editingIndex ? configData : c)
            : [...currentConfigs, configData];
            
        await this.#uiControllerRef.updateGestureConfigs(updatedConfigs);
        this.hide();
        
        pubsub.publish(UI_EVENTS.SHOW_NOTIFICATION, {
            messageKey: editingIndex !== null ? 'notificationItemUpdated' : 'notificationItemAdded',
            substitutions: { item: 'Configuration' },
            type: 'success',
        });
    }

    public applyTranslations(): void {
        this.#form.applyTranslations();
    }
}