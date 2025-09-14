/* FILE: packages/frontend/src/ui/tabs/custom-gestures-tab.ts */
import type { AppStore, FrontendFullState } from '#frontend/core/state/app-store.js';
import { webSocketService } from '#frontend/services/websocket-service.js';
import type { ConfirmationModalManager } from '#frontend/ui/ui-confirmation-modal-manager.js';
import type { UIController } from '#frontend/ui/ui-controller-core.js';
import { setElementVisibility } from '#frontend/ui/helpers/index.js';
import { BaseSettingsTab, type TabElements } from '../base-settings-tab.js';
import { GestureImportManager } from '../components/custom-gestures/gesture-import-manager.js';
import { CustomGestureCardComponent } from '../components/custom-gestures/custom-gesture-card.component.js';

import { pubsub } from '#shared/core/pubsub.js';
import type { CustomGestureMetadata, UploadCustomGestureAckPayload, DeleteCustomGestureAckPayload, UpdateCustomGestureAckPayload, FullConfiguration } from '#shared/index.js';
import { UI_EVENTS, WEBSOCKET_EVENTS } from '#shared/index.js';

export interface CustomGesturesTabElements extends TabElements {
    container?: HTMLElement | null;
    customHandGestureListContainer?: HTMLElement | null;
    customHandGestureListPlaceholder?: HTMLElement | null;
    customPoseGestureListContainer?: HTMLElement | null;
    customPoseGestureListPlaceholder?: HTMLElement | null;
    actionsSlot?: HTMLElement | null;
}

export class CustomGesturesTab extends BaseSettingsTab<CustomGesturesTabElements> {
    _uiControllerRef: UIController & { _confirmationModalMgr?: ConfirmationModalManager | null };
    #importManager: GestureImportManager | null = null;
    #cardComponents = new Map<string, CustomGestureCardComponent>();
    #editingGestureId: string | null = null;

    constructor(appStore: AppStore, uiControllerRef: UIController) {
        super(appStore, uiControllerRef, { container: '[data-tab-content="customGestures"]' });
        this._uiControllerRef = uiControllerRef;
        
        pubsub.subscribe(WEBSOCKET_EVENTS.BACKEND_UPLOAD_CUSTOM_GESTURE_ACK, (p: unknown) => this.#importManager?.handleUploadAck(p as UploadCustomGestureAckPayload));
        pubsub.subscribe(WEBSOCKET_EVENTS.BACKEND_UPDATE_CUSTOM_GESTURE_ACK, (p: unknown) => this.#handleUpdateAck(p as UpdateCustomGestureAckPayload));
        pubsub.subscribe(WEBSOCKET_EVENTS.BACKEND_DELETE_CUSTOM_GESTURE_ACK, (p: unknown) => this.#handleDeleteAck(p as DeleteCustomGestureAckPayload));
        pubsub.subscribe(UI_EVENTS.RECEIVE_UI_CONTRIBUTION, this.#renderContributions);
    }
    
    public async finishInitialization(): Promise<void> {
        if (this._isInitialized) return;
        this.#renderLayout();
        await super.finishInitialization();
        this.#renderContributions();
    }
    
    #renderContributions = (): void => {
        const slot = this._elements.actionsSlot;
        if (!slot || !this._uiControllerRef.pluginUIService) return;
        slot.innerHTML = '';
        const contributions = this._uiControllerRef.pluginUIService.getContributionsForSlot('custom-gestures-actions-slot');
        contributions.forEach((element: HTMLElement) => {
            slot.appendChild(element);
        });
    }

    protected _initializeSpecificEventListeners(): void {
        this._elements.container?.addEventListener('click', this.#handleCardClick);
    }
    
    protected _doesConfigUpdateAffectThisTab(newState: FrontendFullState, oldState: FrontendFullState): boolean { 
        return newState.customGestureMetadataList !== oldState.customGestureMetadataList;
    }
    
    public getSettingsToSave = (): Partial<FullConfiguration> => ({});

    #handleUpdateAck = (payload: UpdateCustomGestureAckPayload): void => { if (payload.success) pubsub.publish(UI_EVENTS.SHOW_NOTIFICATION, { messageKey: "notificationItemUpdated", substitutions: { item: payload.updatedDefinition?.name }, type: "success" }); else pubsub.publish(UI_EVENTS.SHOW_ERROR, { messageKey: payload.message || "errorGeneric", type: 'error' }); };
    #handleDeleteAck = (payload: DeleteCustomGestureAckPayload): void => { if (payload.success) pubsub.publish(UI_EVENTS.SHOW_NOTIFICATION, { messageKey: 'customGestureDeleteSuccess', substitutions: { id: payload.deletedId ?? 'N/A' }, type: 'info' }); else pubsub.publish(UI_EVENTS.SHOW_ERROR, { messageKey: 'customGestureDeleteFailed', substitutions: { message: payload.message || 'Unknown error' } }); };
    
    #handleCardClick = (event: MouseEvent): void => {
        const card = (event.target as HTMLElement).closest<HTMLDivElement>('.custom-gesture-card');
        if (!card?.dataset.gestureId) return;

        const { gestureId, gestureName } = card.dataset;
        if (!gestureId || !gestureName) return;

        if ((event.target as HTMLElement).closest('.delete-btn')) {
            this.#handleDeleteClick(gestureId, gestureName);
            return;
        }

        // Switch clicked card to edit mode and all others to view mode.
        this.#cardComponents.forEach((component, id) => {
            if (id === gestureId) {
                component.editableCard.switchToEditMode();
            } else {
                component.editableCard.switchToViewMode();
            }
        });
    }

    #handleDeleteClick = (id: string, name: string): void => {
        const confirmMgr = this._uiControllerRef._confirmationModalMgr;
        if (!id || !name || !confirmMgr) return;
        const confirmAction = () => webSocketService.sendMessage({ type: WEBSOCKET_EVENTS.DELETE_CUSTOM_GESTURE, payload: { id, name } });
        confirmMgr.show({ titleKey: 'confirmDeleteGestureTitle', messageKey: 'confirmDeleteMessage', messageSubstitutions: { item: name }, confirmTextKey: 'delete', onConfirm: confirmAction });
    }

    #handleEditStateChange = (gestureId: string, isEditing: boolean): void => {
        if (isEditing) {
            this.#editingGestureId = gestureId;
            // When one card enters edit mode, tell all others to exit edit mode.
            this.#cardComponents.forEach((component, id) => {
                if (id !== gestureId) {
                    component.editableCard.switchToViewMode();
                }
            });
        } else if (this.#editingGestureId === gestureId) {
            this.#editingGestureId = null;
        }
    };
    
    #renderCustomGestureList = (definitions: CustomGestureMetadata[] = []): void => {
        const { customHandGestureListContainer: hc, customHandGestureListPlaceholder: hp, customPoseGestureListContainer: pc, customPoseGestureListPlaceholder: pp } = this._elements;
        if (!hc || !hp || !pc || !pp) return;
        
        const currentIds = new Set(definitions.map(d => d.id));

        this.#cardComponents.forEach((component, id) => {
            if (!currentIds.has(id)) {
                component.destroy();
                this.#cardComponents.delete(id);
            }
        });
    
        const handsContainer = document.createDocumentFragment();
        const posesContainer = document.createDocumentFragment();
        
        definitions.forEach(def => {
            let component = this.#cardComponents.get(def.id);
            if (!component) {
                component = new CustomGestureCardComponent(
                    def, 
                    this._uiControllerRef.pluginUIService.getPluginUIContext(), 
                    () => this.#handleDeleteClick(def.id, def.name),
                    (isEditing) => this.#handleEditStateChange(def.id, isEditing)
                );
                this.#cardComponents.set(def.id, component);
            }

            component.update(def, this._uiControllerRef.pluginUIService.getPluginUIContext(def.id), {
                isEditing: this.#editingGestureId === def.id
            });
            
            if (def.type === 'pose') {
                posesContainer.appendChild(component.getElement());
            } else {
                handsContainer.appendChild(component.getElement());
            }
        });
    
        hc.innerHTML = '';
        pc.innerHTML = '';
    
        if (handsContainer.childElementCount > 0) {
            hc.appendChild(handsContainer);
            setElementVisibility(hp, false);
        } else {
            hp.textContent = this._translate('noCustomGesturesSaved', { type: this._translate('Hand') });
            setElementVisibility(hp, true);
        }
    
        if (posesContainer.childElementCount > 0) {
            pc.appendChild(posesContainer);
            setElementVisibility(pp, false);
        } else {
            pp.textContent = this._translate('noCustomGesturesSaved', { type: this._translate('Pose') });
            setElementVisibility(pp, true);
        }
    }

    public loadSettings(): void {
        this.#importManager?.reset();
        this.#renderCustomGestureList(this._appStore.getState().customGestureMetadataList ?? []);
    }
    
    public applyTranslations(): void {
        this._applyTranslationsHelper([
            { element: this._elements.container?.querySelector('#custom-gestures-hand-list-title'), config: { key: 'savedCustomGesturesTitle', substitutions: { type: this._translate('Hand') } } },
            { element: this._elements.container?.querySelector('#custom-gestures-pose-list-title'), config: { key: 'savedCustomGesturesTitle', substitutions: { type: this._translate('Pose') } } },
        ]);
        
        this.#cardComponents.forEach(component => component.applyTranslations());
        this.#importManager?.applyTranslations();
        this.loadSettings();
        this.#renderContributions();
    }
    
    #renderLayout(): void {
        const container = this._elements.container;
        if (!container) return;
        
        container.innerHTML = `
            <div id="custom-gestures-list-view">
                <div class="form-section" id="custom-gestures-hand-section">
                    <h4 id="custom-gestures-hand-list-title" class="form-label"></h4>
                    <div id="customHandGestureListContainer" class="mt-2 grid grid-cols-1 gap-3"></div>
                    <p id="customHandGestureListPlaceholder" class="list-placeholder"></p>
                </div>
                <div class="form-section" id="custom-gestures-pose-section">
                    <h4 id="custom-gestures-pose-list-title" class="form-label"></h4>
                    <div id="customPoseGestureListContainer" class="mt-2 grid grid-cols-1 gap-3"></div>
                    <p id="customPoseGestureListPlaceholder" class="list-placeholder"></p>
                </div>
                <div class="form-section" id="custom-gestures-import-section">
                    <div id="custom-gesture-import-form" class="mt-6">
                        <div id="custom-gestures-actions-container" class="flex justify-end items-center gap-2">
                            <div id="custom-gestures-actions-slot"></div>
                            <input type="file" id="customGestureFile" class="visually-hidden" accept=".js" />
                            <button id="upload-custom-gesture-file-btn" type="button" class="btn btn-secondary">
                                <span class="material-icons"></span>
                                <span id="upload-custom-gesture-file-btn-text"></span>
                            </button>
                        </div>
                        <div id="custom-gesture-import-preview" class="mt-4 border border-dashed border-border p-4 rounded-lg bg-background">
                          <h4 class="text-base font-semibold mb-4"></h4>
                          <div class="form-group"><label for="importPreviewNameInput"></label><input type="text" id="importPreviewNameInput" class="form-control" /></div>
                          <div class="form-group"><label for="importPreviewDescTextarea"></label><textarea id="importPreviewDescTextarea" class="form-control" rows="2"></textarea></div>
                          <div class="form-group"><label class="form-label"></label><p id="importPreviewTypeValue" class="px-3 py-2"></p></div>
                        </div>
                        <div id="custom-gesture-import-actions" class="mt-2 flex justify-end gap-2">
                          <button id="cancelCustomGestureImportBtn" type="button" class="btn btn-secondary"></button>
                          <button id="uploadCustomGestureBtn" type="button" class="btn btn-primary"></button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        this._elements.customHandGestureListContainer = container.querySelector('#customHandGestureListContainer');
        this._elements.customHandGestureListPlaceholder = container.querySelector('#customHandGestureListPlaceholder');
        this._elements.customPoseGestureListContainer = container.querySelector('#customPoseGestureListContainer');
        this._elements.customPoseGestureListPlaceholder = container.querySelector('#customPoseGestureListPlaceholder');
        this._elements.actionsSlot = container.querySelector('#custom-gestures-actions-slot');
        
        const importFormContainer = container.querySelector<HTMLElement>('#custom-gesture-import-form');
        if (importFormContainer) {
            this.#importManager = new GestureImportManager(importFormContainer, this._uiControllerRef);
            this.#importManager.applyTranslations();
        }
    }
}