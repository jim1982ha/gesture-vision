/* FILE: packages/frontend/src/ui/tabs/custom-gestures-tab.ts */
import type { AppStore } from '#frontend/core/state/app-store.js';
import { webSocketService } from '#frontend/services/websocket-service.js';
import type { ConfirmationModalManager } from '#frontend/ui/ui-confirmation-modal-manager.js';
import type { UIController } from '#frontend/ui/ui-controller-core.js';
import { type TranslationConfigItem, type MultiTranslationConfigItem } from '#frontend/ui/ui-translation-updater.js';
import { setElementVisibility, setIcon } from '#frontend/ui/helpers/index.js';
import { createCardElement, createCardActionButton } from '#frontend/ui/utils/card-utils.js';
import { BaseSettingsTab, type TabElements } from '../base-settings-tab.js';
import { EditableCard } from '#frontend/ui/components/editable-card.js';

import { pubsub } from '#shared/core/pubsub.js';
import { translate } from '#shared/services/translations.js';
import { getGestureCategoryIconDetails } from '#frontend/ui/helpers/index.js';

import type { CustomGestureMetadata, UploadCustomGestureAckPayload, DeleteCustomGestureAckPayload, UpdateCustomGestureAckPayload, FullConfiguration, UploadCustomGesturePayload, UpdateCustomGesturePayload } from '#shared/index.js';
import { UI_EVENTS, WEBSOCKET_EVENTS } from '#shared/index.js';
import type { DocsModalManager } from '../ui-docs-modal-manager.js';


export interface CustomGesturesTabElements extends TabElements {
    uploadCustomGestureFileBtn?: HTMLButtonElement | null;
    customGestureFile?: HTMLInputElement | null;
    uploadCustomGestureBtn?: HTMLButtonElement | null;
    cancelCustomGestureImportBtn?: HTMLButtonElement | null;
    customHandGestureListContainer?: HTMLElement | null;
    customHandGestureListPlaceholder?: HTMLElement | null;
    customPoseGestureListContainer?: HTMLElement | null;
    customPoseGestureListPlaceholder?: HTMLElement | null;
    savedHandGesturesTitleElement?: HTMLElement | null;
    savedPoseGesturesTitleElement?: HTMLElement | null;
    customGestureImportActions?: HTMLElement | null;
    customGestureImportPreview?: HTMLElement | null;
    importPreviewTitle?: HTMLElement | null;
    importPreviewNameInput?: HTMLInputElement | null;
    importPreviewNameLabel?: HTMLElement | null;
    importPreviewDescTextarea?: HTMLTextAreaElement | null;
    importPreviewDescLabel?: HTMLElement | null;
    importPreviewTypeLabel?: HTMLElement | null;
    importPreviewTypeValue?: HTMLElement | null;
    actionsSlot?: HTMLElement | null;
    openPluginDevDocsBtn?: HTMLButtonElement | null;
}

interface StagedImportData {
    name: string;
    description?: string;
    type: 'hand' | 'pose';
    codeString: string;
}

export class CustomGesturesTab extends BaseSettingsTab<CustomGesturesTabElements> {
    _uiControllerRef: UIController & { _confirmationModalMgr?: ConfirmationModalManager | null };
    #stagedForImport: StagedImportData | null = null;
    #editableCardInstances = new Map<string, EditableCard>();

    constructor(elements: CustomGesturesTabElements, appStore: AppStore, uiControllerRef: UIController) {
        super(elements, appStore);
        this._uiControllerRef = uiControllerRef;
        
        // Non-state subscriptions specific to this tab are initialized here.
        pubsub.subscribe(WEBSOCKET_EVENTS.BACKEND_UPLOAD_CUSTOM_GESTURE_ACK, (p: unknown) => this.#handleUploadAck(p as UploadCustomGestureAckPayload));
        pubsub.subscribe(WEBSOCKET_EVENTS.BACKEND_UPDATE_CUSTOM_GESTURE_ACK, (p: unknown) => this.#handleUpdateAck(p as UpdateCustomGestureAckPayload));
        pubsub.subscribe(WEBSOCKET_EVENTS.BACKEND_DELETE_CUSTOM_GESTURE_ACK, (p: unknown) => this.#handleDeleteAck(p as DeleteCustomGestureAckPayload));
        pubsub.subscribe(UI_EVENTS.RECEIVE_UI_CONTRIBUTION, this.#renderContributions);
    }
    
    public async finishInitialization(): Promise<void> {
        if (this._isInitialized) return;
        this._elements = this.#queryAndRefineElements(this._elements);
        await super.finishInitialization();
        this.#renderContributions();
    }
    
    #queryAndRefineElements(baseElements: CustomGesturesTabElements): CustomGesturesTabElements {
        const refined: CustomGesturesTabElements = { ...baseElements };
        const query = (id: string) => document.getElementById(id);
        refined.uploadCustomGestureFileBtn = query('upload-custom-gesture-file-btn') as HTMLButtonElement | null;
        refined.customGestureImportActions = query('custom-gesture-import-actions') as HTMLElement | null;
        refined.customGestureImportPreview = query('custom-gesture-import-preview') as HTMLElement | null;
        refined.importPreviewTitle = query('importPreviewTitle') as HTMLElement | null;
        refined.importPreviewNameInput = query('importPreviewNameInput') as HTMLInputElement | null;
        refined.importPreviewNameLabel = query('importPreviewNameLabel') as HTMLElement | null;
        refined.importPreviewDescTextarea = query('importPreviewDescTextarea') as HTMLTextAreaElement | null;
        refined.importPreviewDescLabel = query('importPreviewDescLabel') as HTMLElement | null;
        refined.importPreviewTypeLabel = query('importPreviewTypeLabel') as HTMLElement | null;
        refined.importPreviewTypeValue = query('importPreviewTypeValue') as HTMLElement | null;
        refined.actionsSlot = query('custom-gestures-actions-slot') as HTMLElement | null;
        refined.savedHandGesturesTitleElement = query('savedHandGesturesTitleElement') as HTMLElement | null;
        refined.savedPoseGesturesTitleElement = query('savedPoseGesturesTitleElement') as HTMLElement | null;
        refined.openPluginDevDocsBtn = query('openPluginDevDocsBtn') as HTMLButtonElement | null;
        return refined;
    }

    #renderContributions = (): void => {
        const slot = this._elements.actionsSlot;
        if (!slot || !this._uiControllerRef.pluginUIService) return;

        slot.innerHTML = '';
        const contributions = this._uiControllerRef.pluginUIService.getContributionsForSlot('custom-gestures-actions');
        contributions.forEach((element: HTMLElement) => {
            slot.appendChild(element);
        });
    }

    protected _initializeSpecificEventListeners(): void {
        this._addEventListenerHelper("uploadCustomGestureFileBtn", "click", () => this._elements.customGestureFile?.click());
        this._addEventListenerHelper("customGestureFile", "change", this.#handleCustomGestureFileChange);
        this._addEventListenerHelper("uploadCustomGestureBtn", "click", this.#performActualUpload);
        this._addEventListenerHelper("cancelCustomGestureImportBtn", "click", this.#handleCancelImportClick);
        this._addEventListenerHelper("openPluginDevDocsBtn", "click", this.#handleOpenDocsClick);
    }

    protected _doesConfigUpdateAffectThisTab(): boolean {
        return false;
    }

    #resetUploadState(clearFile = true): void {
        const { customGestureFile, customGestureImportActions, uploadCustomGestureFileBtn, customGestureImportPreview } = this._elements;
        this.#stagedForImport = null;
        if (customGestureFile && clearFile) customGestureFile.value = '';
        setElementVisibility(customGestureImportActions, false);
        setElementVisibility(customGestureImportPreview, false);
        setElementVisibility(uploadCustomGestureFileBtn?.parentElement, true, 'flex');
    }

    #handleCancelImportClick = (): void => this.#resetUploadState();

    #parseMetadataFromCodeString(codeString: string): Omit<StagedImportData, 'codeString'> | null {
        if (!codeString) return null;
        const match = codeString.match(/export\s+const\s+metadata\s*=\s*({[\s\S]*?});?/m);
        if (!match?.[1]) return null;
        try {
            const metadata = new Function(`return ${match[1]};`)();
            if (typeof metadata?.name !== 'string' || !metadata.name.trim()) return null;
            if (typeof metadata?.type !== 'string' || (metadata.type !== 'hand' && metadata.type !== 'pose')) {
                console.warn("Invalid or missing 'type' in custom gesture metadata:", metadata.type);
                return null;
            }
            return {
                name: metadata.name.trim(),
                description: typeof metadata.description === 'string' ? metadata.description.trim() : '',
                type: metadata.type,
            };
        } catch { return null; }
    }

    #handleCustomGestureFileChange = async (event: Event): Promise<void> => {
        const fileInput = event.target as HTMLInputElement;
        const file = fileInput.files?.[0];

        if (!file) { this.#resetUploadState(); return; }
        if (file.type !== 'application/javascript' && !file.name.endsWith('.js')) { 
            pubsub.publish(UI_EVENTS.SHOW_ERROR, { messageKey: "customGestureFileReq", type: 'warning' }); 
            this.#resetUploadState(); return;
        }

        try {
            const codeString = await file.text();
            const parsedMeta = this.#parseMetadataFromCodeString(codeString);
            if (!parsedMeta) {
                pubsub.publish(UI_EVENTS.SHOW_ERROR, { messageKey: 'customGestureMetaError' });
                this.#resetUploadState();
                return;
            }

            this.#stagedForImport = { ...parsedMeta, codeString };
            this.#updateImportPreviewUI();

            setElementVisibility(this._elements.uploadCustomGestureFileBtn?.parentElement, false);
            setElementVisibility(this._elements.customGestureImportPreview, true);
            setElementVisibility(this._elements.customGestureImportActions, true, 'flex');

        } catch (e) {
            pubsub.publish(UI_EVENTS.SHOW_ERROR, { messageKey: 'errorReadingFile', substitutions: { message: (e as Error).message } });
            this.#resetUploadState();
        }
    };

    #updateImportPreviewUI(): void {
        const { importPreviewNameInput, importPreviewDescTextarea, importPreviewTypeValue } = this._elements;
        if (importPreviewNameInput && importPreviewDescTextarea && importPreviewTypeValue && this.#stagedForImport) {
            importPreviewNameInput.value = this.#stagedForImport.name;
            importPreviewDescTextarea.value = this.#stagedForImport.description || '';
            importPreviewTypeValue.textContent = this.#stagedForImport.type;
        }
    }

    #performActualUpload = (): void => {
        if (!this.#stagedForImport) {
            pubsub.publish(UI_EVENTS.SHOW_ERROR, { messageKey: 'customGestureFileReq' });
            return;
        }
        
        const finalName = this._elements.importPreviewNameInput?.value.trim() || this.#stagedForImport.name;
        const finalDescription = this._elements.importPreviewDescTextarea?.value.trim() || this.#stagedForImport.description;
        
        const payloadToSend: UploadCustomGesturePayload = {
            name: finalName,
            description: finalDescription,
            type: this.#stagedForImport.type,
            codeString: this.#stagedForImport.codeString,
            source: 'core'
        };

        if (!payloadToSend.name || !payloadToSend.type || !payloadToSend.codeString) {
            pubsub.publish(UI_EVENTS.SHOW_ERROR, { messageKey: 'customGestureMissingData' });
            if (this._elements.uploadCustomGestureBtn) this._elements.uploadCustomGestureBtn.disabled = false;
            return;
        }

        if (this._elements.uploadCustomGestureBtn) this._elements.uploadCustomGestureBtn.disabled = true; 
        
        webSocketService.sendMessage({ type: WEBSOCKET_EVENTS.UPLOAD_CUSTOM_GESTURE, payload: payloadToSend });
    }

    #handleUploadAck = (payload: UploadCustomGestureAckPayload): void => {
        if (payload?.source !== 'core') return;
        
        if (this._elements.uploadCustomGestureBtn) this._elements.uploadCustomGestureBtn.disabled = false;
        if (payload.success) { 
            pubsub.publish(UI_EVENTS.SHOW_NOTIFICATION, { messageKey: 'customGestureSaveSuccess', substitutions: { name: payload.newDefinition?.name ?? '?' }, type: 'success' }); 
            this.#resetUploadState();
        } else { 
            pubsub.publish(UI_EVENTS.SHOW_ERROR, { messageKey: 'customGestureSaveFailed', substitutions: { message: payload.message || 'Unknown error' } });
            if (this._elements.uploadCustomGestureBtn) this._elements.uploadCustomGestureBtn.disabled = false;
        }
    }

    #handleUpdateAck = (payload: UpdateCustomGestureAckPayload): void => {
        if (payload.success) {
            pubsub.publish(UI_EVENTS.SHOW_NOTIFICATION, { messageKey: "notificationItemUpdated", substitutions: { item: payload.updatedDefinition?.name }, type: "success" });
        }
        else {
            pubsub.publish(UI_EVENTS.SHOW_ERROR, { messageKey: payload.message || "errorGeneric", type: 'error' });
        }
    };

    #handleDeleteAck = (payload: DeleteCustomGestureAckPayload): void => {
        if (payload.success) {
            this.#editableCardInstances.delete(payload.deletedId || '');
            pubsub.publish(UI_EVENTS.SHOW_NOTIFICATION, { messageKey: 'customGestureDeleteSuccess', substitutions: { id: payload.deletedId ?? 'N/A' }, type: 'info' }); 
        } else {
            pubsub.publish(UI_EVENTS.SHOW_ERROR, { messageKey: 'customGestureDeleteFailed', substitutions: { message: payload.message || 'Unknown error' } });
        }
    }

    #handleDeleteClick = (id: string, name: string): void => {
        const confirmMgr = this._uiControllerRef._confirmationModalMgr;
        if (!id || !name || !confirmMgr) return;
        
        this.#editableCardInstances.get(id)?.switchToViewMode();
        
        const confirmAction = () => webSocketService.sendMessage({ type: WEBSOCKET_EVENTS.DELETE_CUSTOM_GESTURE, payload: { id, name } });
        confirmMgr.show({ titleKey: 'confirmDeleteGestureTitle', messageKey: 'confirmDeleteMessage', messageSubstitutions: { item: name }, confirmTextKey: 'delete', onConfirm: confirmAction });
    }
    
    #handleOpenDocsClick = (): void => {
        this._uiControllerRef.getDocsModalManager()
            .then((manager: DocsModalManager | undefined) => manager?.openModal("PLUGIN_DEV"))
            .catch((error: Error) => console.error("[PluginsTab] Failed to open docs modal:", error));
    };

    #renderCustomGestureList = (definitions: CustomGestureMetadata[] = []): void => {
        const { customHandGestureListContainer: hc, customHandGestureListPlaceholder: hp, customPoseGestureListContainer: pc, customPoseGestureListPlaceholder: pp } = this._elements;
        if (!hc || !hp || !pc || !pp) return;
        
        this.#editableCardInstances.clear();
        hc.innerHTML = '';
        pc.innerHTML = '';

        const hands = definitions.filter(d => d.type !== 'pose');
        const poses = definitions.filter(d => d.type === 'pose');
        
        if (hands.length === 0) { hp.textContent = translate('noCustomGesturesSaved', { type: translate('Hand') }); setElementVisibility(hp, true, 'block');
        } else { setElementVisibility(hp, false); hands.forEach(d => hc.appendChild(this.#createGestureListItem(d))); }

        if (poses.length === 0) { pp.textContent = translate('noCustomGesturesSaved', { type: translate('Pose') }); setElementVisibility(pp, true, 'block');
        } else { setElementVisibility(pp, false); poses.forEach(d => pc.appendChild(this.#createGestureListItem(d))); }
    }

    #createGestureListItem = (def: CustomGestureMetadata): HTMLDivElement => {
        const cardId = `custom-gesture-card-${def.id}`;
        
        const detailsHtml = `
            <div class="card-details-view">
                ${def.description ? `<div class="card-detail-line"><span class="material-icons" title="Description"></span><span class="card-detail-value custom-gesture-description-value allow-wrap">${def.description}</span></div>` : ''}
            </div>
            <form class="custom-gesture-edit-form hidden" onsubmit="return false;">
                <div class="form-group"><label for="${cardId}-name">${translate('nameLabel')}</label><input type="text" id="${cardId}-name" class="form-control" value="${def.name}"></div>
                <div class="form-group"><label for="${cardId}-desc">${translate('descriptionOptionalLabel')}</label><textarea id="${cardId}-desc" class="form-control" rows="2">${def.description || ''}</textarea></div>
                <div class="form-actions-group justify-end"><button type="button" class="btn btn-secondary cancel-btn"><span class="btn-icon-span"></span><span class="btn-text-span">${translate('cancel')}</span></button><button type="button" class="btn btn-primary save-btn"><span class="btn-icon-span"></span><span class="btn-text-span">${translate('update')}</span></button></div>
            </form>
        `;
        
        const deleteButton = createCardActionButton({
            action: 'delete',
            titleKey: 'deleteTooltip',
            iconKey: 'UI_DELETE',
            extraClasses: ['btn-icon-danger', 'delete-btn'],
        });

        const card = createCardElement({
            ...getGestureCategoryIconDetails(def.type === 'pose' ? 'CUSTOM_POSE' : 'CUSTOM_HAND'),
            title: def.name,
            actionButtonsHtml: deleteButton.outerHTML,
            detailsHtml,
            itemClasses: "custom-gesture-list-item card-item-clickable", 
            datasetAttributes: { gestureId: def.id, gestureName: def.name },
            titleAttribute: translate('editTooltip', { item: def.name }), ariaLabel: translate('editTooltip', { item: def.name })
        });
        card.id = cardId;

        setIcon(card.querySelector('.card-detail-line > .material-icons'), 'UI_NOTES');

        const saveBtn = card.querySelector('.save-btn') as HTMLButtonElement;
        const cancelBtn = card.querySelector('.cancel-btn') as HTMLButtonElement;
        setIcon(saveBtn.querySelector('.btn-icon-span'), 'UI_SAVE');
        setIcon(cancelBtn.querySelector('.btn-icon-span'), 'UI_CANCEL');
        
        const editableCard = new EditableCard({
            cardElement: card,
            viewElementsContainer: card.querySelector('.card-details-view') as HTMLElement,
            formElement: card.querySelector('.custom-gesture-edit-form') as HTMLFormElement,
            saveButton: saveBtn,
            cancelButton: cancelBtn,
            onSave: async () => {
                const newName = (card.querySelector<HTMLInputElement>(`#${cardId}-name`)?.value || '').trim();
                const newDescription = (card.querySelector<HTMLTextAreaElement>(`#${cardId}-desc`)?.value || '').trim();
                if (!newName) {
                    pubsub.publish(UI_EVENTS.SHOW_ERROR, { messageKey: "customGestureNameReq" });
                    return false;
                }
                const payload: UpdateCustomGesturePayload = { id: def.id, oldName: def.name, newName, newDescription };
                const result = await webSocketService.request<UpdateCustomGestureAckPayload>(WEBSOCKET_EVENTS.UPDATE_CUSTOM_GESTURE, payload);
                return result.success;
            },
            onCancel: () => {
                const nameInput = card.querySelector<HTMLInputElement>(`#${cardId}-name`);
                const descTextarea = card.querySelector<HTMLTextAreaElement>(`#${cardId}-desc`);
                if(nameInput) nameInput.value = def.name;
                if(descTextarea) descTextarea.value = def.description || '';
            }
        });
        this.#editableCardInstances.set(def.id, editableCard);
        
        card.querySelector('.delete-btn')?.addEventListener('click', () => this.#handleDeleteClick(def.id, def.name));

        return card;
    }

    public loadSettings(): void {
        this.#resetUploadState();
        this.#renderCustomGestureList(this._appStore.getState().customGestureMetadataList ?? []);
    }
    public getSettingsToSave = (): Partial<FullConfiguration> => ({});
    public applyTranslations(): void {
        const itemsToTranslate: Array<TranslationConfigItem | MultiTranslationConfigItem>= [
            { element: this._elements.savedHandGesturesTitleElement, config: { key: 'savedCustomGesturesTitle', substitutions: { type: translate('Hand') } } },
            { element: this._elements.savedPoseGesturesTitleElement, config: { key: 'savedCustomGesturesTitle', substitutions: { type: translate('Pose') } } },
            { element: this._elements.customHandGestureListPlaceholder, config: { key: 'noCustomGesturesSaved', substitutions: { type: translate('Hand') } } },
            { element: this._elements.customPoseGestureListPlaceholder, config: { key: 'noCustomGesturesSaved', substitutions: { type: translate('Pose') } } },
            { element: this._elements.uploadCustomGestureFileBtn, config: {key: "uploadJsFileTooltip", attribute: "title"}},
            { element: this._elements.uploadCustomGestureFileBtn?.querySelector('span:not(.material-icons)'), config: 'uploadFileButtonText'},
            { element: this._elements.cancelCustomGestureImportBtn?.querySelector('span:not(.material-icons)'), config: 'cancel' },
            { element: this._elements.cancelCustomGestureImportBtn, config: {key: 'cancelTooltip', attribute: 'title' }},
            { element: this._elements.uploadCustomGestureBtn?.querySelector('span:not(.material-icons)'), config: 'importFileButtonText' },
            { element: this._elements.uploadCustomGestureBtn, config: {key: 'importFileButtonText', attribute: 'title' }},
            { element: this._elements.importPreviewTitle, config: 'importPreviewTitle' },
            { element: this._elements.importPreviewNameLabel, config: 'nameLabel' },
            { element: this._elements.importPreviewDescLabel, config: 'descriptionOptionalLabel' },
            { element: this._elements.importPreviewTypeLabel, config: 'studioGestureType' },
        ];
        this._applyTranslationsHelper(itemsToTranslate);
        
        setIcon(this._elements.uploadCustomGestureFileBtn, 'UI_FILE_ATTACH');
        setIcon(this._elements.cancelCustomGestureImportBtn, 'UI_CANCEL');
        setIcon(this._elements.uploadCustomGestureBtn, 'UI_UPLOAD');

        this.#renderCustomGestureList(this._appStore.getState().customGestureMetadataList ?? []);
    }
}