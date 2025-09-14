/* FILE: packages/frontend/src/ui/components/plugins/base-plugin-global-settings.component.ts */
import { setIcon } from '#frontend/ui/helpers/index.js';
import { createCardElement, buildFooterHtml, createButton, type CardFooterConfig, type ActionButtonConfig } from '#frontend/ui/helpers/card-utils.js';
import type { IPluginGlobalSettingsComponent, PluginUIContext } from '#frontend/types/index.js';
import type { ActionSettingFieldDescriptor, PluginManifest, PluginTestConnectionResultPayload } from '#shared/index.js';
import { renderFormFields } from '#frontend/ui/helpers/form-renderer.js';
import type { AppStore } from '#frontend/core/state/app-store.js';

/**
 * A stateful component that renders a single plugin card and manages its own view/edit state.
 */
export class BasePluginGlobalSettingsComponent<TConfig extends object> implements IPluginGlobalSettingsComponent {
    public cardElement: HTMLDivElement;
    public manifest: PluginManifest;
    protected context: PluginUIContext;
    protected fieldDescriptors: ActionSettingFieldDescriptor[];
    public initialConfig: TConfig | null = null;
    protected formElements: Record<string, HTMLElement> = {};
    
    #viewWrapper!: HTMLDivElement;
    #formWrapper!: HTMLDivElement;
    #isEditing = false;
    
    public isTestingConnection = false;
    public isPending = false;
    public testButtonTimeout: number | null = null;
    public lastTestResult: PluginTestConnectionResultPayload | null = null;

    constructor(
        pluginId: string,
        manifest: PluginManifest,
        context: PluginUIContext,
        fieldDescriptors: ActionSettingFieldDescriptor[] = []
    ) {
        this.context = context;
        this.manifest = manifest;
        this.fieldDescriptors = fieldDescriptors;
        this.initialConfig = (this.context.coreStateManager as AppStore).getState().pluginGlobalConfigs.get(pluginId) as TConfig | null;

        const iconDetails = manifest.icon ?? { type: 'material-icons', name: 'extension' };
        
        const actionButtons: ActionButtonConfig[] = [];
        if (manifest.capabilities.hasGlobalSettings && manifest.capabilities.canTestConnection) {
             actionButtons.push({ action: 'test-connection', titleKey: 'testConnectionTooltip', iconKey: 'UI_NETWORK_CHECK', pluginId: pluginId, extraClasses: ['test-btn-header'], translate: this.context.services.translationService.translate });
        }
        
        const isEnabled = this.manifest.status === 'enabled';
        actionButtons.push({ 
            action: 'toggle', 
            titleKey: isEnabled ? 'disable' : 'enable', 
            iconKey: isEnabled ? 'UI_TOGGLE_ON' : 'UI_TOGGLE_OFF', 
            pluginId: pluginId, 
            translate: this.context.services.translationService.translate 
        });

        actionButtons.push({ action: 'uninstall', titleKey: 'uninstall', iconKey: 'UI_DELETE_FOREVER', pluginId: pluginId, extraClasses: ['btn-icon-danger'], translate: this.context.services.translationService.translate });

        this.cardElement = createCardElement({
            title: this.context.services.translationService.translate(manifest.nameKey),
            iconName: iconDetails.name,
            iconType: iconDetails.type,
            itemClasses: "config-item w-full" + (manifest.capabilities.hasGlobalSettings ? " card-item-clickable" : ""),
            datasetAttributes: { pluginId: pluginId },
            actionButtons: actionButtons,
            translate: this.context.services.translationService.translate,
            detailsHtml: `<div class="plugin-details-content-wrapper p-1"></div>`
        });
        this.cardElement.id = `${pluginId}-integration-card`;
        
        const detailsContainer = this.cardElement.querySelector('.plugin-details-content-wrapper')!;
        this.#viewWrapper = document.createElement('div');
        this.#formWrapper = document.createElement('div');
        this.#formWrapper.className = "hidden w-full";
        detailsContainer.append(this.#viewWrapper, this.#formWrapper);

        this.renderView();
    }

    public getElement(): HTMLElement { return this.cardElement; }
    
    public getFormValues(): TConfig {
        const settings: Record<string, unknown> = {};
        for (const field of this.fieldDescriptors) {
            const element = this.formElements[field.id];
            if (element instanceof HTMLInputElement && element.type === 'checkbox') {
                settings[field.id] = element.checked;
            } else if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
                settings[field.id] = element.value.trim();
            } else if (element instanceof HTMLSelectElement) {
                settings[field.id] = element.value;
            }
        }
        return settings as TConfig;
    }

    protected renderView(): void {
        const translate = this.context.services.translationService.translate;
        const description = translate(this.manifest.descriptionKey || '', { defaultValue: '' });
        const descIcon = document.createElement('span'); setIcon(descIcon, 'UI_NOTES'); descIcon.className = 'material-icons card-detail-icon'; descIcon.title = translate('descriptionOptionalLabel');
        let contentHtml = `<div class="card-detail-line">${descIcon.outerHTML}<span class="card-detail-value allow-wrap">${description}</span></div>`;

        this.fieldDescriptors.forEach(field => {
            const value = this.initialConfig ? (this.initialConfig as Record<string, unknown>)[field.id] : undefined;
            const displayValue = field.type === 'password' && value ? '********' : value || translate('Not Set');
            const valueClass = !value || value === '' ? 'text-text-secondary italic' : (field.type === 'password' ? 'font-mono' : '');
            
            const fieldIcon = document.createElement('span'); setIcon(fieldIcon, 'UI_KEY'); fieldIcon.className = 'material-icons card-detail-icon';
            contentHtml += `<div class="card-detail-line">${fieldIcon.outerHTML}<span class="card-detail-value ${valueClass}">${displayValue}</span></div>`;
        });
        
        this.#viewWrapper.innerHTML = contentHtml;
        
        const footerConfig: CardFooterConfig = { mainText: `v${this.manifest.version} by ${this.manifest.author || 'Unknown'}`, statusIconKey: 'UI_INFO' };
        const footerHtml = buildFooterHtml(footerConfig);
        let existingFooter = this.cardElement.querySelector('.card-footer');
        if (!existingFooter) {
            existingFooter = document.createElement('div');
            existingFooter.className = 'card-footer';
            this.cardElement.appendChild(existingFooter);
        }
        existingFooter.innerHTML = footerHtml;
    }
    
    protected renderForm(): void {
        if (this.#formWrapper.hasChildNodes()) {
            for (const field of this.fieldDescriptors) {
                const element = this.formElements[field.id];
                if (element instanceof HTMLInputElement && element.type === 'checkbox') {
                    element.checked = this.initialConfig ? !!(this.initialConfig as Record<string, unknown>)[field.id] : false;
                } else if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) {
                    element.value = this.initialConfig ? String((this.initialConfig as Record<string, unknown>)[field.id] || '') : '';
                }
            }
            return;
        }

        const form = document.createElement('form');
        form.className = 'plugin-global-settings-form w-full';
        form.onsubmit = () => false;

        this.formElements = renderFormFields(form, this.fieldDescriptors, this.manifest.id, this.context);
        
        for (const field of this.fieldDescriptors) {
            const element = this.formElements[field.id];
            if (element instanceof HTMLInputElement && element.type === 'checkbox') {
                element.checked = this.initialConfig ? !!(this.initialConfig as Record<string, unknown>)[field.id] : false;
            } else if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) {
                element.value = this.initialConfig ? String((this.initialConfig as Record<string, unknown>)[field.id] || '') : '';
            }
        }
        
        const saveButton = createButton({ action: 'save', textKey: 'save', iconKey: 'UI_SAVE', extraClasses: ['btn-primary', 'save-btn'], translate: this.context.services.translationService.translate });
        const cancelButton = createButton({ action: 'cancel', textKey: 'cancel', iconKey: 'UI_CANCEL', extraClasses: ['btn-secondary', 'cancel-btn'], translate: this.context.services.translationService.translate });
        const actionsDiv = document.createElement('div');
        actionsDiv.className = 'mt-4 flex justify-end gap-2';
        actionsDiv.append(cancelButton, saveButton);
        form.appendChild(actionsDiv);
        
        this.#formWrapper.innerHTML = '';
        this.#formWrapper.appendChild(form);
    }
    
    public switchToEditMode(): void {
        if (this.#isEditing) return;
        this.#isEditing = true;
        this.cardElement.classList.add("is-editing-highlight");
        this.renderForm();
        this.#viewWrapper.classList.add('hidden');
        this.#formWrapper.classList.remove('hidden');
    }

    public switchToViewMode(): void {
        if (!this.#isEditing) return;
        this.#isEditing = false;
        this.cardElement.classList.remove("is-editing-highlight");
        this.#viewWrapper.classList.remove('hidden');
        this.#formWrapper.classList.add('hidden');
        this.renderView();
    }

    public updateToggleButtonState(): void {
        const isEnabled = this.manifest.status === 'enabled';
        const toggleButton = this.cardElement.querySelector<HTMLButtonElement>('button[data-action="toggle"]');
        if (!toggleButton) return;

        const titleKey = isEnabled ? 'disable' : 'enable';
        const iconKey = isEnabled ? 'UI_TOGGLE_ON' : 'UI_TOGGLE_OFF';
        
        const title = this.context.services.translationService.translate(titleKey);
        toggleButton.title = title;
        toggleButton.setAttribute('aria-label', title);
        setIcon(toggleButton.querySelector('.btn-icon-span'), iconKey);
    }

    public updateTestState(isTesting: boolean, result?: PluginTestConnectionResultPayload | null): void {
        this.isTestingConnection = isTesting;
        if (result !== undefined) this.lastTestResult = result;
        
        const testButton = this.cardElement.querySelector<HTMLButtonElement>('.test-btn-header');
        if (!testButton) return;
        
        testButton.disabled = this.isTestingConnection;
        const iconSpan = testButton.querySelector('.btn-icon-span');
        if (!iconSpan) return;

        if (this.isTestingConnection) {
            setIcon(iconSpan, 'UI_HOURGLASS');
        } else if (this.lastTestResult) {
            setIcon(iconSpan, this.lastTestResult.success ? 'UI_CONFIRM' : 'UI_ERROR');
        } else {
            setIcon(iconSpan, 'UI_NETWORK_CHECK');
        }

        if (this.testButtonTimeout) clearTimeout(this.testButtonTimeout);
        if (!isTesting && this.lastTestResult) {
            this.testButtonTimeout = window.setTimeout(() => { 
                this.lastTestResult = null;
                this.updateTestState(false, null);
            }, this.lastTestResult.success ? 3000 : 7000);
        }
    }

    public isEditing = (): boolean => this.#isEditing;
    public update(newConfig?: TConfig | null): void {
        if(newConfig !== undefined) this.initialConfig = newConfig;
        this.renderView();
    }
    public destroy(): void { this.cardElement.remove(); if (this.testButtonTimeout) clearTimeout(this.testButtonTimeout); }
    public onConfigUpdate(): void {}
    public applyTranslations(): void { this.renderView(); this.#formWrapper.innerHTML = ''; this.renderForm(); }
}