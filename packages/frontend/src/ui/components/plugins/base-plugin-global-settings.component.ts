/* FILE: packages/frontend/src/ui/components/plugins/base-plugin-global-settings.component.ts */
import { UI_EVENTS, PLUGIN_CONFIG_UPDATED_EVENT_PREFIX } from '#shared/index.js';
import { pubsub } from '#shared/core/pubsub.js';
import { translate } from '#shared/services/translations.js';
import { createFromTemplate } from '#frontend/ui/utils/template-renderer.js';
import { setIcon } from '#frontend/ui/helpers/index.js';
import { EditableCard } from '../editable-card.js';

import type { IPluginGlobalSettingsComponent, PluginUIContext } from '#frontend/types/index.js';
import type { ActionSettingFieldDescriptor, PluginManifest, PluginTestConnectionResultPayload } from '#shared/index.js';
import { createCardElement, createCardActionButton, type CardFooterConfig } from '#frontend/ui/utils/card-utils.js';

export class BasePluginGlobalSettingsComponent<TConfig extends object> implements IPluginGlobalSettingsComponent {
    protected pluginId: string;
    protected context: PluginUIContext;
    protected manifest: PluginManifest;
    protected fieldDescriptors: ActionSettingFieldDescriptor[];

    protected cardElement: HTMLDivElement;
    protected viewWrapper!: HTMLDivElement;
    protected formElement!: HTMLFormElement;
    protected formFieldsContainer!: HTMLDivElement;
    protected testButton!: HTMLButtonElement;
    protected formElements: Record<string, HTMLElement> = {};

    protected isTestingConnection = false;
    protected isPending = false;
    protected testButtonTimeout: number | null = null;
    protected initialConfig: TConfig | null = null;
    protected lastTestResult: PluginTestConnectionResultPayload | null = null;
    #editableCard: EditableCard | null = null;

    #boundConfigUpdateHandler: (config?: unknown) => void;
    #isInitialized = false;

    constructor(pluginId: string, manifest: PluginManifest, context: PluginUIContext, fieldDescriptors: ActionSettingFieldDescriptor[] = []) {
        this.pluginId = pluginId;
        this.manifest = manifest;
        this.context = context;
        this.fieldDescriptors = fieldDescriptors;
        this.cardElement = this.createAndQueryCardElement();
        this.#boundConfigUpdateHandler = (newConfig?: unknown) => this.onConfigUpdate(newConfig as TConfig | null);
    }

    public initialize(): void {
        if (this.#isInitialized) return;
        this.attachEventListeners();
        this.renderFormFields();
        pubsub.subscribe(`${PLUGIN_CONFIG_UPDATED_EVENT_PREFIX}${this.pluginId}`, this.#boundConfigUpdateHandler);
        
        this.#updateUI();
        this.applyTranslations();
        
        this.#isInitialized = true;
    }

    protected createAndQueryCardElement(): HTMLDivElement {
        const iconDetails = this.manifest.icon ?? { type: 'material-icons', name: 'extension' };
        
        const testBtn = createCardActionButton({ action: 'test-connection', titleKey: 'testConnectionTooltip', iconKey: 'UI_NETWORK_CHECK', pluginId: this.pluginId, extraClasses: ['test-btn-header'] });
        const toggleBtn = createCardActionButton({ action: 'toggle', titleKey: 'enable', iconKey: 'UI_TOGGLE_OFF', pluginId: this.pluginId });
        const uninstallBtn = createCardActionButton({ action: 'uninstall', titleKey: 'uninstall', iconKey: 'UI_DELETE', pluginId: this.pluginId, extraClasses: ['btn-icon-danger'] });
        const actionButtonsHtml = `${testBtn.outerHTML}${toggleBtn.outerHTML}${uninstallBtn.outerHTML}`;
        
        const saveButton = createCardActionButton({ action: 'save', textKey: 'save', iconKey: 'UI_SAVE', extraClasses: ['btn-primary', 'save-btn'] });
        const cancelButton = createCardActionButton({ action: 'cancel', textKey: 'cancel', iconKey: 'UI_CANCEL', extraClasses: ['btn-secondary', 'cancel-btn'] });
        
        const innerContentTemplate = `
            <div>
                <div class="plugin-view-content-wrapper p-1"></div>
                <form class="plugin-global-settings-form hidden p-1" onsubmit="return false;">
                    <div class="form-fields-container"></div>
                    <div class="mt-4 flex justify-end gap-2">${cancelButton.outerHTML}${saveButton.outerHTML}</div>
                </form>
            </div>`;

        const card = createCardElement({
            iconName: iconDetails.name, iconType: iconDetails.type, title: this.manifest.nameKey,
            itemClasses: "config-item card-item-clickable", actionButtonsHtml,
            detailsHtml: innerContentTemplate,
        });
        card.id = `${this.pluginId}-integration-card`;

        this.viewWrapper = card.querySelector('.plugin-view-content-wrapper') as HTMLDivElement;
        this.formElement = card.querySelector('.plugin-global-settings-form') as HTMLFormElement;
        this.formFieldsContainer = this.formElement.querySelector('.form-fields-container') as HTMLDivElement;
        this.testButton = card.querySelector('.test-btn-header') as HTMLButtonElement;
        
        this.#editableCard = new EditableCard({
            cardElement: card,
            viewElementsContainer: this.viewWrapper,
            formElement: this.formElement,
            saveButton: this.formElement.querySelector('.save-btn'),
            cancelButton: this.formElement.querySelector('.cancel-btn'),
            // FIX: Implement the onEnterEditMode callback to populate the form just before it's shown.
            onEnterEditMode: () => this.populateForm(this.initialConfig),
            onSave: this.handleSave,
            onCancel: this.handleCancel
        });

        return card;
    }

    protected renderFormFields(): void {
        this.formFieldsContainer.innerHTML = '';
        this.formElements = {};
        this.fieldDescriptors.forEach(field => {
            const template = `<div class="form-group"><label for="{pluginId}-{id}" class="form-label">{label}</label><input type="{type}" id="{pluginId}-{id}" class="form-control" placeholder="{placeholder}" autocomplete="{autocomplete}"><small data-if="hasHelpText" class="form-help-text">{helpText}</small></div>`;
            const data = {
                pluginId: this.pluginId, id: field.id, label: translate(field.labelKey), type: field.type,
                placeholder: field.placeholderKey ? translate(field.placeholderKey) : '',
                autocomplete: field.autocomplete || 'off',
                hasHelpText: !!field.helpTextKey, helpText: field.helpTextKey ? translate(field.helpTextKey) : '',
            };
            const formGroup = createFromTemplate(template, data);
            if (formGroup) {
                this.formElements[field.id] = formGroup.querySelector('input')!;
                this.formFieldsContainer.appendChild(formGroup);
            }
        });
    }

    protected renderViewContent(): void {
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
    
    protected handleSave = async (): Promise<boolean> => {
        const validation = this.validateForm();
        if (!validation.isValid) {
            pubsub.publish(UI_EVENTS.SHOW_ERROR, { messageKey: 'correctErrors', substitutions: { errors: `\n- ${validation.errors?.join('\n- ') || 'Invalid fields.'}` } });
            return false;
        }
        const result = await this.context.pluginUIService.savePluginGlobalConfig(this.pluginId, this.getFormValues());
        if (result.success) {
            pubsub.publish(UI_EVENTS.SHOW_NOTIFICATION, { messageKey: "notificationItemSaved", substitutions: { item: "Configuration" }, type: "success" });
        } else {
            pubsub.publish(UI_EVENTS.SHOW_ERROR, { messageKey: result.message ?? 'errorSavingConfig' });
        }
        return result.success;
    };
    
    protected handleTestConnection = async (event: MouseEvent): Promise<void> => {
        event.stopPropagation();
        const configToTest = this.#editableCard?.isEditing() ? this.getFormValues() : this.initialConfig;
        if (!configToTest || !Object.values(configToTest).some(v => v)) {
            pubsub.publish(UI_EVENTS.SHOW_ERROR, { messageKey: "pluginTestConfigMissing" }); return;
        }
        this.isTestingConnection = true; this.#updateUI();
        try {
            this.lastTestResult = await this.context.pluginUIService.sendPluginTestConnectionRequest?.(this.pluginId, configToTest) || null;
            if (this.lastTestResult?.success === false) {
                pubsub.publish(UI_EVENTS.SHOW_ERROR, { 
                    messageKey: this.lastTestResult.messageKey ?? 'haConnectionFailed', 
                    substitutions: { ...(this.lastTestResult.error ?? {}) }, type: 'error' 
                });
            }
        } catch (error) {
            this.lastTestResult = { pluginId: this.pluginId, success: false, messageKey: 'TEST_FAILED', error: { message: (error as Error).message } };
            pubsub.publish(UI_EVENTS.SHOW_ERROR, { messageKey: 'TEST_FAILED', substitutions: { message: (error as Error).message } });
        } finally {
            this.isTestingConnection = false; this.#updateUI();
            if (this.testButtonTimeout) clearTimeout(this.testButtonTimeout);
            this.testButtonTimeout = window.setTimeout(() => { this.lastTestResult = null; this.#updateUI(); }, this.lastTestResult?.success ? 3000 : 7000);
        }
    };
    
    protected handleCancel = (): void => {
        this.populateForm(this.initialConfig);
        pubsub.publish(UI_EVENTS.SHOW_NOTIFICATION, { messageKey: "changesDiscarded", type: "info", duration: 2000 });
    };

    #updateUI(): void {
        if (!this.#isInitialized) return;
        this.renderViewContent();
        this.populateForm(this.initialConfig);
        this.applyTranslations();

        const isEnabled = this.manifest.status === 'enabled';
        const toggleBtn = this.cardElement.querySelector<HTMLButtonElement>('button[data-action="toggle"]');
        if (toggleBtn) {
            toggleBtn.title = translate(isEnabled ? 'disable' : 'enable');
            toggleBtn.disabled = this.isPending;
            setIcon(toggleBtn, this.isPending ? 'UI_HOURGLASS' : (isEnabled ? 'UI_TOGGLE_ON' : 'UI_TOGGLE_OFF'));
        }
        this.cardElement.querySelector<HTMLButtonElement>('button[data-action="uninstall"]')!.disabled = this.isPending;
        
        const configToTest = this.#editableCard?.isEditing() ? this.getFormValues() : this.initialConfig;
        const canTest = !!configToTest && Object.values(configToTest).some(v => v);
        this.testButton.disabled = this.isTestingConnection || !canTest;
        
        this.testButton.classList.remove("bg-success", "bg-error", "text-on-primary", "border-transparent");
        
        if (this.isTestingConnection) {
            setIcon(this.testButton, 'UI_HOURGLASS');
            this.testButton.title = translate("testingConnection");
        } else if (this.lastTestResult) {
            const { success, messageKey, error } = this.lastTestResult;
            if (success) this.testButton.classList.add("bg-success", "text-on-primary", "border-transparent");
            else this.testButton.classList.add("bg-error", "text-on-primary", "border-transparent");
            
            setIcon(this.testButton, success ? "UI_CONFIRM" : "UI_ERROR");
            this.testButton.title = translate(messageKey ?? (success ? 'haConnectionSuccess' : 'haConnectionFailed'), { message: error?.message ?? '' });
        } else {
            setIcon(this.testButton, 'UI_NETWORK_CHECK');
            this.testButton.title = translate("testConnectionTooltip");
        }
    }

    public getElement = (): HTMLElement => this.cardElement;

    public update(c: TConfig | null, x: PluginUIContext, extraState: { isPending?: boolean } = {}): void {
        this.context = x;
        this.isPending = extraState.isPending || false;
        const newManifest = this.context.pluginUIService.getPluginManifest(this.pluginId);
        if (newManifest) this.manifest = newManifest;
        
        this.cardElement.classList.toggle('config-item-disabled', this.manifest.status !== 'enabled');
        this.cardElement.classList.toggle('is-pending', this.isPending);
        
        this.onConfigUpdate(c);
    }

    public onConfigUpdate(newConfig: TConfig | null): void {
        this.initialConfig = structuredClone(newConfig) as TConfig | null;
        if (this.#isInitialized) {
            this.#updateUI();
        }
    }
    
    public applyTranslations(): void {
        const titleEl = this.cardElement.querySelector<HTMLElement>('.card-title');
        if (titleEl) titleEl.textContent = translate(this.manifest.nameKey, { defaultValue: this.pluginId });
        
        const footerConfig: CardFooterConfig = { mainText: `v${this.manifest.version} by ${this.manifest.author || 'Unknown'}`, statusIconKey: 'UI_INFO' };
        const footer = createCardElement({ ...this.manifest.icon ? { iconName: this.manifest.icon.name, iconType: this.manifest.icon.type } : { iconName: 'UI_EXTENSION' }, title: '', footerConfig }).querySelector('.card-footer');
        const existingFooter = this.cardElement.querySelector('.card-footer');
        if (footer && existingFooter) existingFooter.innerHTML = footer.innerHTML;

        this.renderFormFields();
        this.renderViewContent();
    }

    public destroy(): void {
        pubsub.unsubscribe(`${PLUGIN_CONFIG_UPDATED_EVENT_PREFIX}${this.pluginId}`, this.#boundConfigUpdateHandler);
        this.cardElement?.remove();
        if (this.testButtonTimeout) clearTimeout(this.testButtonTimeout);
    }
}