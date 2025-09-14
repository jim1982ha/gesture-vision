/* FILE: packages/frontend/src/ui/components/rtsp/rtsp-form-manager.ts */
import { UI_EVENTS, pubsub, type RtspSourceConfig, type RoiConfig, type ActionSettingFieldDescriptor } from '#shared/index.js';
import { renderFormFields, setIcon } from '#frontend/ui/helpers/index.js';
import type { UIController } from '#frontend/ui/ui-controller-core.js';
import type { Substitutions } from '#shared/index.js';

const DEFAULT_ROI_FORM_VALUES: RoiConfig = { x: 0, y: 0, width: 100, height: 100 };

export class RtspFormManager {
    #container: HTMLElement;
    #uiControllerRef: UIController;
    #formElements: Record<string, HTMLElement> = {};

    constructor(container: HTMLElement, uiControllerRef: UIController) {
        this.#container = container;
        this.#uiControllerRef = uiControllerRef;
    }

    public render(): void {
        const isEditing = this.#uiControllerRef.getEditingRtspSourceIndex() !== null;
        this.#container.innerHTML = `
            <h5 class="text-base font-semibold mb-4">${this._translate(isEditing ? "editXTitle" : "addXTitle", { item: "RTSP Source" })}</h5>
            <div id="rtsp-form-fields-container"></div>
            <div class="mt-4 flex justify-end gap-2">
                <button id="rtspCancelEditButton" class="btn btn-secondary">
                    <span class="material-icons"></span><span>${this._translate('cancel')}</span>
                </button>
                <button id="rtspSaveSourceButton" class="btn btn-primary">
                    <span class="material-icons"></span><span id="rtspSaveButtonLabel">${this._translate(isEditing ? "update" : "add")}</span>
                </button>
            </div>
        `;
        setIcon(this.#container.querySelector('#rtspCancelEditButton'), 'UI_CANCEL');
        setIcon(this.#container.querySelector('#rtspSaveSourceButton'), isEditing ? 'UI_SAVE' : 'UI_ADD');
        
        const formFieldsContainer = this.#container.querySelector('#rtsp-form-fields-container') as HTMLElement;
        this.renderFields(formFieldsContainer);
    }
    
    private renderFields(container: HTMLElement): void {
        const fieldDescriptors: ActionSettingFieldDescriptor[] = [
            { id: 'name', type: 'text', labelKey: 'rtspNameLabel', placeholderKey: 'rtspNamePlaceholder', required: true },
            { id: 'url', type: 'text', labelKey: 'rtspUrlLabel', placeholderKey: 'rtspUrlPlaceholder', helpTextKey: 'rtspUrlHelp', required: true },
            { id: 'sourceOnDemand', type: 'checkbox', labelKey: 'rtspSourceOnDemandLabel' }
        ];
        this.#formElements = renderFormFields(container, fieldDescriptors, 'rtsp', this.#uiControllerRef.pluginUIService.getPluginUIContext());
        
        const roiFieldset = document.createElement('fieldset');
        roiFieldset.className = 'form-group';
        roiFieldset.innerHTML = `
            <legend class="form-label">${this._translate('rtspRoiSettingsLabel')}</legend>
            <div class="form-row">
                <div class="form-group"><label for="rtsp-roiX" class="form-label">${this._translate('roiLeftOffsetLabel')}</label><input type="number" id="rtsp-roiX" class="form-control" min="0" max="100" step="1" /></div>
                <div class="form-group"><label for="rtsp-roiY" class="form-label">${this._translate('roiTopOffsetLabel')}</label><input type="number" id="rtsp-roiY" class="form-control" min="0" max="100" step="1" /></div>
            </div>
            <div class="form-row">
                <div class="form-group"><label for="rtsp-roiWidth" class="form-label">${this._translate('roiWidthLabel')}</label><input type="number" id="rtsp-roiWidth" class="form-control" min="1" max="100" step="1" /></div>
                <div class="form-group"><label for="rtsp-roiHeight" class="form-label">${this._translate('roiHeightLabel')}</label><input type="number" id="rtsp-roiHeight" class="form-control" min="1" max="100" step="1" /></div>
            </div>
            <small class="form-help-text">${this._translate('rtspRoiHelpUpdated')}</small>
        `;
        container.appendChild(roiFieldset);
        this.#formElements.roiX = roiFieldset.querySelector('#rtsp-roiX')!;
        this.#formElements.roiY = roiFieldset.querySelector('#rtsp-roiY')!;
        this.#formElements.roiWidth = roiFieldset.querySelector('#rtsp-roiWidth')!;
        this.#formElements.roiHeight = roiFieldset.querySelector('#rtsp-roiHeight')!;
    }

    public populate(source: RtspSourceConfig | null): void {
        (this.#formElements.name as HTMLInputElement).value = source?.name || "";
        (this.#formElements.url as HTMLInputElement).value = source?.url || "";
        (this.#formElements.sourceOnDemand as HTMLInputElement).checked = source?.sourceOnDemand ?? false;
        
        const roi = source?.roi || DEFAULT_ROI_FORM_VALUES;
        (this.#formElements.roiX as HTMLInputElement).value = String(roi.x);
        (this.#formElements.roiY as HTMLInputElement).value = String(roi.y);
        (this.#formElements.roiWidth as HTMLInputElement).value = String(roi.width);
        (this.#formElements.roiHeight as HTMLInputElement).value = String(roi.height);
    }

    public getFormData(): RtspSourceConfig | null {
        const name = (this.#formElements.name as HTMLInputElement)?.value.trim();
        const url = (this.#formElements.url as HTMLInputElement)?.value.trim();
        
        if (!name || !url || !url.toLowerCase().startsWith("rtsp://")) {
            if (!name) this.#formElements.name?.setAttribute("aria-invalid", "true");
            if (!url || !url.toLowerCase().startsWith("rtsp://")) this.#formElements.url?.setAttribute("aria-invalid", "true");
            pubsub.publish(UI_EVENTS.SHOW_ERROR, { messageKey: "rtspNameUrlRequired" });
            return null;
        }
        this.#formElements.name?.removeAttribute("aria-invalid");
        this.#formElements.url?.removeAttribute("aria-invalid");

        const x = parseFloat((this.#formElements.roiX as HTMLInputElement).value || "" + DEFAULT_ROI_FORM_VALUES.x);
        const y = parseFloat((this.#formElements.roiY as HTMLInputElement).value || "" + DEFAULT_ROI_FORM_VALUES.y);
        const w = parseFloat((this.#formElements.roiWidth as HTMLInputElement).value || "" + DEFAULT_ROI_FORM_VALUES.width);
        const h = parseFloat((this.#formElements.roiHeight as HTMLInputElement).value || "" + DEFAULT_ROI_FORM_VALUES.height);
        const roi: RoiConfig = { x: isNaN(x) ? 0 : Math.max(0, Math.min(100, x)), y: isNaN(y) ? 0 : Math.max(0, Math.min(100, y)), width: isNaN(w) ? 100 : Math.max(1, Math.min(100, w)), height: isNaN(h) ? 100 : Math.max(1, Math.min(100, h)) };
        
        if (roi.x + roi.width > 100) roi.width = 100 - roi.x;
        if (roi.y + roi.height > 100) roi.height = 100 - roi.y;
        
        return { name, url, sourceOnDemand: (this.#formElements.sourceOnDemand as HTMLInputElement).checked, roi };
    }

    public getSaveButton = (): HTMLButtonElement | null => this.#container.querySelector('#rtspSaveSourceButton');
    public getCancelButton = (): HTMLButtonElement | null => this.#container.querySelector('#rtspCancelEditButton');
    private _translate = (key: string, subs?: Substitutions) => this.#uiControllerRef.translationService.translate(key, subs);
}