/* FILE: packages/frontend/src/ui/components/custom-gestures/gesture-import-manager.ts */
import { UI_EVENTS, WEBSOCKET_EVENTS, type UploadCustomGesturePayload, type UploadCustomGestureAckPayload } from '#shared/index.js';
import { pubsub } from '#shared/core/pubsub.js';
import { setElementVisibility, setIcon } from '#frontend/ui/helpers/index.js';
import type { UIController } from '#frontend/ui/ui-controller-core.js';
import { webSocketService } from '#frontend/services/websocket-service.js';

interface StagedImportData {
    name: string; description?: string; type: 'hand' | 'pose'; codeString: string;
}

export class GestureImportManager {
    #uiControllerRef: UIController;
    #stagedForImport: StagedImportData | null = null;
    #elements: { [key: string]: HTMLElement | HTMLInputElement | null };
    #boundFileChangeHandler: (event: Event) => void;

    constructor(container: HTMLElement, uiControllerRef: UIController) {
        this.#uiControllerRef = uiControllerRef;
        this.#elements = {
            uploadBtn: container.querySelector("#upload-custom-gesture-file-btn"),
            fileInput: container.querySelector("#customGestureFile"),
            confirmImportBtn: container.querySelector("#uploadCustomGestureBtn"),
            cancelImportBtn: container.querySelector("#cancelCustomGestureImportBtn"),
            importActionsContainer: container.querySelector("#custom-gesture-import-actions"),
            importPreviewContainer: container.querySelector("#custom-gesture-import-preview"),
            nameInput: container.querySelector("#importPreviewNameInput"),
            descTextarea: container.querySelector("#importPreviewDescTextarea"),
            typeValue: container.querySelector("#importPreviewTypeValue"),
        };
        this.#boundFileChangeHandler = this.#handleFileChange.bind(this);
        this.#attachEventListeners();
    }

    #attachEventListeners(): void {
        this.#elements.uploadBtn?.addEventListener("click", () => this.#elements.fileInput?.click());
        this.#elements.fileInput?.addEventListener("change", this.#boundFileChangeHandler);
        this.#elements.confirmImportBtn?.addEventListener("click", this.#performUpload);
        this.#elements.cancelImportBtn?.addEventListener("click", () => this.reset());
    }

    reset = (clearFile = true): void => {
        this.#stagedForImport = null;
        if (this.#elements.fileInput instanceof HTMLInputElement && clearFile) {
            this.#elements.fileInput.value = '';
        }
        setElementVisibility(this.#elements.importActionsContainer, false);
        setElementVisibility(this.#elements.importPreviewContainer, false);
        setElementVisibility(this.#elements.uploadBtn?.parentElement, true);
    };

    #parseMetadata(code: string): Omit<StagedImportData, 'codeString'> | null {
        const match = code.match(/export\s+const\s+metadata\s*=\s*({[\s\S]*?});?/m);
        if (!match?.[1]) return null;
        try {
            const meta = new Function(`return ${match[1]};`)();
            if (typeof meta.name !== 'string' || !meta.name.trim()) return null;
            if (meta.type !== 'hand' && meta.type !== 'pose') return null;
            return { name: meta.name.trim(), description: meta.description?.trim() || '', type: meta.type };
        } catch { return null; }
    }

    #handleFileChange = async (event: Event): Promise<void> => {
        const file = (event.target as HTMLInputElement).files?.[0];
        if (!file) { this.reset(); return; }
        if (!file.name.endsWith('.js')) {
            pubsub.publish(UI_EVENTS.SHOW_ERROR, { messageKey: "customGestureFileReq", type: 'warning' });
            this.reset(); return;
        }

        try {
            const codeString = await file.text();
            const parsedMeta = this.#parseMetadata(codeString);
            if (!parsedMeta) {
                pubsub.publish(UI_EVENTS.SHOW_ERROR, { messageKey: 'customGestureMetaError' });
                this.reset(); return;
            }
            this.#stagedForImport = { ...parsedMeta, codeString };
            this.#updatePreviewUI();
            setElementVisibility(this.#elements.uploadBtn?.parentElement, false);
            setElementVisibility(this.#elements.importPreviewContainer, true);
            setElementVisibility(this.#elements.importActionsContainer, true);
        } catch (e) {
            pubsub.publish(UI_EVENTS.SHOW_ERROR, { messageKey: 'errorReadingFile', substitutions: { message: (e as Error).message } });
            this.reset();
        }
    };

    #updatePreviewUI(): void {
        const { nameInput, descTextarea, typeValue } = this.#elements;
        if (nameInput instanceof HTMLInputElement) nameInput.value = this.#stagedForImport?.name || '';
        if (descTextarea instanceof HTMLTextAreaElement) descTextarea.value = this.#stagedForImport?.description || '';
        if (typeValue) typeValue.textContent = this.#stagedForImport?.type || '';
    }

    #performUpload = (): void => {
        if (!this.#stagedForImport) { pubsub.publish(UI_EVENTS.SHOW_ERROR, { messageKey: 'customGestureFileReq' }); return; }
        
        const name = (this.#elements.nameInput as HTMLInputElement)?.value.trim() || this.#stagedForImport.name;
        const description = (this.#elements.descTextarea as HTMLTextAreaElement)?.value.trim() || this.#stagedForImport.description;
        
        const payload: UploadCustomGesturePayload = { ...this.#stagedForImport, name, description, source: 'core' };
        if (!payload.name || !payload.type || !payload.codeString) {
            pubsub.publish(UI_EVENTS.SHOW_ERROR, { messageKey: 'customGestureMissingData' });
            return;
        }

        if (this.#elements.confirmImportBtn) (this.#elements.confirmImportBtn as HTMLButtonElement).disabled = true;
        webSocketService.sendMessage({ type: WEBSOCKET_EVENTS.UPLOAD_CUSTOM_GESTURE, payload });
    };
    
    public handleUploadAck(payload: UploadCustomGestureAckPayload): void {
        if (payload?.source !== 'core') return;
        if (this.#elements.confirmImportBtn) (this.#elements.confirmImportBtn as HTMLButtonElement).disabled = false;

        if (payload.success) {
            pubsub.publish(UI_EVENTS.SHOW_NOTIFICATION, { messageKey: 'customGestureSaveSuccess', substitutions: { name: payload.newDefinition?.name ?? '?' }, type: 'success' });
            this.reset();
        } else {
            pubsub.publish(UI_EVENTS.SHOW_ERROR, { messageKey: 'customGestureSaveFailed', substitutions: { message: payload.message || 'Unknown error' } });
        }
    }

    public applyTranslations(): void {
        const translate = this.#uiControllerRef.translationService.translate;
        const setAttr = (el: Element | null | undefined, attr: string, key: string) => { if (el) el.setAttribute(attr, translate(key)); };
        const setText = (el: Element | null | undefined, key: string) => { if (el) el.textContent = translate(key); };

        setAttr(this.#elements.uploadBtn, 'title', 'uploadJsFileTooltip');
        setText(this.#elements.uploadBtn?.querySelector('span:not(.material-icons)'), 'uploadFileButtonText');
        setText(this.#elements.cancelImportBtn?.querySelector('span:not(.material-icons)'), 'cancel');
        setAttr(this.#elements.cancelImportBtn, 'title', 'cancelTooltip');
        setText(this.#elements.confirmImportBtn?.querySelector('span:not(.material-icons)'), 'importFileButtonText');
        setAttr(this.#elements.confirmImportBtn, 'title', 'importFileButtonText');
        setText(this.#elements.importPreviewContainer?.querySelector('h4'), 'importPreviewTitle');
        setText(this.#elements.importPreviewContainer?.querySelector('label[for*="NameInput"]'), 'nameLabel');
        setText(this.#elements.importPreviewContainer?.querySelector('label[for*="DescTextarea"]'), 'descriptionOptionalLabel');
        setText(this.#elements.importPreviewContainer?.querySelector('label:not([for])'), 'studioGestureType');

        setIcon(this.#elements.uploadBtn, 'UI_FILE_ATTACH');
        setIcon(this.#elements.cancelImportBtn, 'UI_CANCEL');
        setIcon(this.#elements.confirmImportBtn, 'UI_UPLOAD');
    }
}