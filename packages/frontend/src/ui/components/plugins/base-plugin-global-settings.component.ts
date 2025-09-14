/* FILE: packages/frontend/src/ui/components/plugins/base-plugin-global-settings.component.ts */
import { UI_EVENTS, PLUGIN_CONFIG_UPDATED_EVENT_PREFIX } from '#shared/index.js';
import { pubsub } from '#shared/core/pubsub.js';
import { setIcon } from '#frontend/ui/helpers/index.js';
import { createCardElement, buildFooterHtml, createButton, type CardFooterConfig } from '#frontend/ui/utils/card-utils.js';
import { EditableCard } from '../editable-card.js';

import type { IPluginGlobalSettingsComponent, PluginUIContext } from '#frontend/types/index.js';
import type { ActionSettingFieldDescriptor, PluginManifest, PluginTestConnectionResultPayload } from '#shared/index.js';
import { renderFormFields } from '#frontend/ui/helpers/form-renderer.js';

export class BasePluginGlobalSettingsComponent<TConfig extends object> implements IPluginGlobalSettingsComponent {
    protected cardElement: HTMLDivElement;
    protected formFieldsContainer!: HTMLDivElement;
    protected viewWrapper!: HTMLDivElement;
    public editableCard!: EditableCard;
    
    protected context: PluginUIContext;
    protected manifest: PluginManifest;
    protected fieldDescriptors: ActionSettingFieldDescriptor[];
    protected initialConfig: TConfig | null = null;
    
    protected testButton!: HTMLButtonElement;
    protected formElements: Record<string, HTMLElement> = {};

    protected isTestingConnection = false;
    protected isPending = false;
    protected testButtonTimeout: number | null = null;
    protected lastTestResult: PluginTestConnectionResultPayload | null = null;

    #boundConfigUpdateHandler: (config?: unknown) => void;
    #isInitialized = false;

    constructor(pluginId: string, manifest: PluginManifest, context: PluginUIContext, fieldDescriptors: ActionSettingFieldDescriptor[] = []) {
        this.context = context;
        this.manifest = manifest;
        this.fieldDescriptors = fieldDescriptors;
        this.#boundConfigUpdateHandler = (newConfig?: unknown) => this.onConfigUpdate(newConfig as TConfig | null);

        const iconDetails = manifest.icon ?? { type: 'material-icons', name: 'extension' };
        
        this.cardElement = createCardElement({
            title: this.context.services.translationService.translate(manifest.nameKey),
            iconName: iconDetails.name,
            iconType: iconDetails.type,
            itemClasses: "config-item" + (manifest.capabilities.hasGlobalSettings ? " card-item-clickable" : ""),
            datasetAttributes: { pluginId: pluginId },
            actionButtons: [
                { action: 'test-connection', titleKey: 'testConnectionTooltip', iconKey: 'UI_NETWORK_CHECK', pluginId: pluginId, extraClasses: ['test-btn-header'], translate: this.context.services.translationService.translate },
                { action: 'toggle', titleKey: 'enable', iconKey: 'UI_TOGGLE_OFF', pluginId: pluginId, translate: this.context.services.translationService.translate },
                { action: 'uninstall', titleKey: 'uninstall', iconKey: 'UI_DELETE', pluginId: pluginId, extraClasses: ['btn-icon-danger'], translate: this.context.services.translationService.translate }
            ],
            translate: this.context.services.translationService.translate
        });
        this.cardElement.id = `${pluginId}-integration-card`;
        
        const detailsContainer = this.cardElement.querySelector('.card-details')!;
        this.viewWrapper = document.createElement('div');
        this.viewWrapper.className = 'plugin-view-content-wrapper p-1';
        detailsContainer.appendChild(this.viewWrapper);
    }

    public initialize(): void {
        if (this.#isInitialized) return;

        if (this.manifest.capabilities.hasGlobalSettings) {
            const formElement = this.renderForm();
            this.cardElement.querySelector('.card-details')?.appendChild(formElement);

            this.editableCard = new EditableCard({
                cardElement: this.cardElement,
                viewElementsContainer: this.viewWrapper,
                formElement: formElement,
                saveButton: formElement.querySelector('.save-btn'),
                cancelButton: formElement.querySelector('.cancel-btn'),
                onEnterEditMode: () => this.populateForm(this.initialConfig),
                onSave: this.save,
                onCancel: () => this.populateForm(this.initialConfig)
            });
        }
        
        this.testButton = this.cardElement.querySelector('.test-btn-header') as HTMLButtonElement;
        this.attachEventListeners();
        pubsub.subscribe(`${PLUGIN_CONFIG_UPDATED_EVENT_PREFIX}${this.manifest.id}`, this.#boundConfigUpdateHandler);
        
        this.#updateUI();
        this.applyTranslations();
        
        this.#isInitialized = true;
    }

    protected renderFormFields(): void {
        this.formFieldsContainer = document.createElement('div');
        this.formElements = renderFormFields(this.formFieldsContainer, this.fieldDescriptors, this.manifest.id, this.context);
    }

    public renderForm(): HTMLFormElement {
        const form = document.createElement('form');
        form.className = 'plugin-global-settings-form hidden p-1';
        form.onsubmit = () => false;

        this.renderFormFields();
        this.populateForm(this.initialConfig);
        form.appendChild(this.formFieldsContainer);

        const saveButton = createButton({ action: 'save', textKey: 'save', iconKey: 'UI_SAVE', extraClasses: ['btn-primary', 'save-btn'], translate: this.context.services.translationService.translate });
        const cancelButton = createButton({ action: 'cancel', textKey: 'cancel', iconKey: 'UI_CANCEL', extraClasses: ['btn-secondary', 'cancel-btn'], translate: this.context.services.translationService.translate });

        const actionsDiv = document.createElement('div');
        actionsDiv.className = 'mt-4 flex justify-end gap-2';
        actionsDiv.append(cancelButton, saveButton);
        form.appendChild(actionsDiv);

        return form;
    }

    protected renderViewContent(): void {
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
        this.viewWrapper.innerHTML = `<div class="card-details">${contentHtml}</div>`;
    }

    protected getFormValues = (): TConfig => { const s: Record<string,unknown>={}; for(const f of this.fieldDescriptors){const e=this.formElements[f.id] as HTMLInputElement|HTMLTextAreaElement; if(e)s[f.id]=e.value.trim();} return s as TConfig;};
    protected populateForm = (c:TConfig|null):void=>{for(const f of this.fieldDescriptors){const e=this.formElements[f.id] as HTMLInputElement|HTMLTextAreaElement; if(e)e.value=c?String((c as Record<string,unknown>)[f.id]||''):'';}};
    protected validateForm = ():{isValid:boolean,errors?:string[]}=>({isValid:true});
    
    protected attachEventListeners(): void {
        this.testButton?.addEventListener('click', this.handleTestConnection);
    }
    
    public save = async (): Promise<boolean> => {
        const validation = this.validateForm();
        if (!validation.isValid) {
            pubsub.publish(UI_EVENTS.SHOW_ERROR, { messageKey: 'correctErrors', substitutions: { errors: `\n- ${validation.errors?.join('\n- ') || 'Invalid fields.'}` } });
            return false;
        }
        const result = await this.context.pluginUIService.savePluginGlobalConfig(this.manifest.id, this.getFormValues());
        if (result.success) {
            pubsub.publish(UI_EVENTS.SHOW_NOTIFICATION, { messageKey: "notificationItemSaved", substitutions: { item: "Configuration" }, type: "success" });
        } else {
            pubsub.publish(UI_EVENTS.SHOW_ERROR, { messageKey: result.message ?? 'errorSavingConfig' });
        }
        return result.success;
    };
    
    protected handleTestConnection = async (event: MouseEvent): Promise<void> => {
        event.stopPropagation();
        const configToTest = this.editableCard?.isEditing() ? this.getFormValues() : this.initialConfig;
        if (!configToTest || !Object.values(configToTest).some(v => v)) {
            pubsub.publish(UI_EVENTS.SHOW_ERROR, { messageKey: "pluginTestConfigMissing" }); return;
        }
        this.isTestingConnection = true; this.#updateUI();
        try {
            this.lastTestResult = await this.context.pluginUIService.sendPluginTestConnectionRequest?.(this.manifest.id, configToTest) || null;
            if (this.lastTestResult?.success === false) {
                pubsub.publish(UI_EVENTS.SHOW_ERROR, { 
                    messageKey: this.lastTestResult.messageKey ?? 'haConnectionFailed', 
                    substitutions: { ...(this.lastTestResult.error ?? {}) }, type: 'error' 
                });
            }
        } catch (error) {
            this.lastTestResult = { pluginId: this.manifest.id, success: false, messageKey: 'TEST_FAILED', error: { message: (error as Error).message } };
            pubsub.publish(UI_EVENTS.SHOW_ERROR, { messageKey: 'TEST_FAILED', substitutions: { message: (error as Error).message } });
        } finally {
            this.isTestingConnection = false; this.#updateUI();
            if (this.testButtonTimeout) clearTimeout(this.testButtonTimeout);
            this.testButtonTimeout = window.setTimeout(() => { this.lastTestResult = null; this.#updateUI(); }, this.lastTestResult?.success ? 3000 : 7000);
        }
    };
    
    #updateUI(): void {
        if (!this.#isInitialized) return;
        this.renderViewContent();
        
        const isEnabled = this.manifest.status === 'enabled';
        const toggleBtn = this.cardElement.querySelector<HTMLButtonElement>('button[data-action="toggle"]');
        if (toggleBtn) {
            toggleBtn.title = this.context.services.translationService.translate(isEnabled ? 'disable' : 'enable');
            toggleBtn.disabled = this.isPending;
            setIcon(toggleBtn, this.isPending ? 'UI_HOURGLASS' : (isEnabled ? 'UI_TOGGLE_ON' : 'UI_TOGGLE_OFF'));
        }
        this.cardElement.querySelector<HTMLButtonElement>('button[data-action="uninstall"]')!.disabled = this.isPending;
        
        const configToTest = this.initialConfig;
        const canTest = !!configToTest && Object.values(configToTest).some(v => v);
        this.testButton.disabled = this.isTestingConnection || !canTest;
        
        this.testButton.classList.remove("bg-success", "bg-error", "text-on-primary", "border-transparent");
        
        if (this.isTestingConnection) {
            setIcon(this.testButton, 'UI_HOURGLASS');
            this.testButton.title = this.context.services.translationService.translate("testingConnection");
        } else if (this.lastTestResult) {
            const { success, messageKey, error } = this.lastTestResult;
            if (success) this.testButton.classList.add("bg-success", "text-on-primary", "border-transparent");
            else this.testButton.classList.add("bg-error", "text-on-primary", "border-transparent");
            
            setIcon(this.testButton, success ? "UI_CONFIRM" : "UI_ERROR");
            this.testButton.title = this.context.services.translationService.translate(messageKey ?? (success ? 'haConnectionSuccess' : 'haConnectionFailed'), { message: error?.message ?? '' });
        } else {
            setIcon(this.testButton, 'UI_NETWORK_CHECK');
            this.testButton.title = this.context.services.translationService.translate("testConnectionTooltip");
        }
    }

    public update(c: TConfig | null, x: PluginUIContext, extraState: { isPending?: boolean, isEditing?: boolean } = {}): void {
        this.context = x;
        this.isPending = extraState.isPending || false;
        const newManifest = this.context.pluginUIService.getPluginManifest(this.manifest.id);
        if (newManifest) this.manifest = newManifest;
        
        this.cardElement.classList.toggle('config-item-disabled', this.manifest.status !== 'enabled');
        this.cardElement.classList.toggle('is-pending', this.isPending);

        if (this.editableCard) {
            if (extraState.isEditing) {
                this.editableCard.switchToEditMode();
            } else {
                this.editableCard.switchToViewMode();
            }
        }
        
        this.onConfigUpdate(c);
    }

    public onConfigUpdate(newConfig: TConfig | null): void {
        if (JSON.stringify(this.initialConfig) !== JSON.stringify(newConfig)) {
            this.initialConfig = newConfig ? JSON.parse(JSON.stringify(newConfig)) : null;
            if (this.#isInitialized) {
                this.#updateUI();
            }
        }
    }
    
    public applyTranslations(): void {
        const translate = this.context.services.translationService.translate;
        const titleEl = this.cardElement.querySelector<HTMLElement>('.card-title');
        if (titleEl) titleEl.textContent = translate(this.manifest.nameKey, { defaultValue: this.manifest.id });
        
        const footerConfig: CardFooterConfig = { mainText: `v${this.manifest.version} by ${this.manifest.author || 'Unknown'}`, statusIconKey: 'UI_INFO' };
        const footerHtml = buildFooterHtml(footerConfig);
        const existingFooter = this.cardElement.querySelector('.card-footer');
        if (footerHtml && existingFooter) existingFooter.innerHTML = footerHtml;

        this.renderViewContent();
    }

    public destroy(): void {
        this.cardElement.remove();
        pubsub.unsubscribe(`${PLUGIN_CONFIG_UPDATED_EVENT_PREFIX}${this.manifest.id}`, this.#boundConfigUpdateHandler);
        if (this.testButtonTimeout) clearTimeout(this.testButtonTimeout);
    }

    public getElement(): HTMLElement {
        return this.cardElement;
    }
}