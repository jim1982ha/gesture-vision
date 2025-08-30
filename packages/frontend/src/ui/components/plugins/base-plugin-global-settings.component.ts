/* FILE: packages/frontend/src/ui/components/plugins/base-plugin-global-settings.component.ts */
import { UI_EVENTS, PLUGIN_CONFIG_UPDATED_EVENT_PREFIX } from '#shared/index.js';
import { pubsub } from '#shared/core/pubsub.js';
import { translate } from '#shared/services/translations.js';
import { createFromTemplate } from '#frontend/ui/utils/template-renderer.js';
import { setIcon } from '#frontend/ui/helpers/index.js';

import type { IPluginGlobalSettingsComponent, PluginUIContext } from '#frontend/types/index.js';
import type { ActionSettingFieldDescriptor, PluginManifest, PluginTestConnectionResultPayload } from '#shared/index.js';
import { createCardElement, createCardActionButton } from '#frontend/ui/utils/card-utils.js';

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
    protected saveButton!: HTMLButtonElement;
    protected cancelButton!: HTMLButtonElement;
    protected viewModeActionsContainer!: HTMLDivElement;
    protected formElements: Record<string, HTMLElement> = {};

    protected isEditing = false;
    protected hasChanges = false;
    protected isTestingConnection = false;
    protected isPending = false;
    protected testButtonTimeout: number | null = null;
    protected initialConfig: TConfig | null = null;
    protected lastTestResult: PluginTestConnectionResultPayload | null = null;

    #boundConfigUpdateHandler: (config?: unknown) => void;
    #isInitialized = false;

    constructor(pluginId: string, manifest: PluginManifest, context: PluginUIContext, fieldDescriptors: ActionSettingFieldDescriptor[] = []) {
        this.pluginId = pluginId;
        this.manifest = manifest;
        this.context = context;
        this.fieldDescriptors = fieldDescriptors;
        this.cardElement = this.createCardElement();
        this.#boundConfigUpdateHandler = (newConfig?: unknown) => this.onConfigUpdate(newConfig as TConfig | null);
    }

    public initialize(): void {
        if (this.#isInitialized) return;

        this.viewWrapper = this.cardElement.querySelector('.plugin-view-content-wrapper') as HTMLDivElement;
        this.formElement = this.cardElement.querySelector('.plugin-global-settings-form') as HTMLFormElement;
        this.formFieldsContainer = this.formElement.querySelector('.form-fields-container') as HTMLDivElement;
        this.testButton = this.cardElement.querySelector('.test-btn-header') as HTMLButtonElement;
        this.saveButton = this.formElement.querySelector('.save-btn') as HTMLButtonElement;
        this.cancelButton = this.formElement.querySelector('.cancel-btn') as HTMLButtonElement;
        this.viewModeActionsContainer = this.cardElement.querySelector('.card-item-actions') as HTMLDivElement;

        this.attachEventListeners();
        this.renderFormFields();
        pubsub.subscribe(`${PLUGIN_CONFIG_UPDATED_EVENT_PREFIX}${this.pluginId}`, this.#boundConfigUpdateHandler);
        
        this.#updateUI();
        
        this.#isInitialized = true;
    }

    protected createCardElement(): HTMLDivElement {
        const iconDetails = this.manifest.icon ?? { type: 'material-icons', name: 'extension' };
        const isEnabled = this.manifest.status === 'enabled';

        const testBtn = createCardActionButton({ action: 'test-connection', titleKey: 'testConnectionTooltip', iconKey: 'UI_NETWORK_CHECK', pluginId: this.pluginId, extraClasses: ['test-btn-header'] });
        const toggleBtn = createCardActionButton({ action: 'toggle', titleKey: isEnabled ? 'disable' : 'enable', iconKey: isEnabled ? 'UI_TOGGLE_ON' : 'UI_TOGGLE_OFF', pluginId: this.pluginId });
        const uninstallBtn = createCardActionButton({ action: 'uninstall', titleKey: 'uninstall', iconKey: 'UI_DELETE', pluginId: this.pluginId, extraClasses: ['btn-icon-danger'] });
        const actionButtonsHtml = `${testBtn.outerHTML}${toggleBtn.outerHTML}${uninstallBtn.outerHTML}`;

        const versionInfo = `v${this.manifest.version} by ${this.manifest.author || 'Unknown'}`;
        const footerHtml = `<div class="card-footer"><div class="card-detail-line"><span class="material-icons card-detail-icon"></span><span class="card-detail-value">${versionInfo}</span></div></div>`;

        const card = createCardElement({
            iconName: iconDetails.name,
            iconType: iconDetails.type,
            title: translate(this.manifest.nameKey, { defaultValue: this.pluginId }),
            itemClasses: "integration-config-item card-item-clickable",
            actionButtonsHtml,
            footerHtml,
        });
        card.id = `${this.pluginId}-integration-card`;

        const innerContentTemplate = `
            <div>
                <div class="plugin-view-content-wrapper"></div>
                <form class="plugin-global-settings-form" style="display: none;" onsubmit="return false;">
                    <div class="form-fields-container"></div>
                    <div class="integration-form-actions">
                        <button type="button" class="btn btn-secondary cancel-btn"><span class="btn-icon-span"></span><span class="btn-text-span">{cancelText}</span></button>
                        <button type="button" class="btn btn-primary save-btn"><span class="btn-icon-span"></span><span class="btn-text-span">{saveText}</span></button>
                    </div>
                </form>
            </div>`;
            
        const wrapper = createFromTemplate(innerContentTemplate, {
            cancelText: translate('cancel'),
            saveText: translate('save'),
        })!;
        
        const footerContainer = card.querySelector('.card-footer')?.parentElement;
        if (footerContainer) {
            Array.from(wrapper.children).forEach(child => card.insertBefore(child, footerContainer));
        } else {
            card.append(...Array.from(wrapper.children));
        }
        
        setIcon(card.querySelector('.cancel-btn .btn-icon-span'), 'UI_CANCEL');
        setIcon(card.querySelector('.save-btn .btn-icon-span'), 'UI_SAVE');
        setIcon(card.querySelector('.card-footer .card-detail-icon'), 'UI_INFO');

        return card;
    }

    protected renderFormFields(): void {
        this.formFieldsContainer.innerHTML = '';
        this.formElements = {};
        const hasPasswordField = this.fieldDescriptors.some(field => field.type === 'password');
        const hasUsernameField = this.fieldDescriptors.some(field => field.autocomplete === 'username');

        if (hasPasswordField && !hasUsernameField) {
            const hiddenInput = document.createElement('input');
            hiddenInput.type = 'text';
            hiddenInput.className = 'visually-hidden';
            hiddenInput.autocomplete = 'username';
            hiddenInput.tabIndex = -1;
            this.formFieldsContainer.appendChild(hiddenInput);
        }

        this.fieldDescriptors.forEach(field => {
            const template = `
                <div class="form-group">
                    <label for="{pluginId}-{id}">{label}</label>
                    <input type="{type}" id="{pluginId}-{id}" class="form-control" placeholder="{placeholder}" autocomplete="{autocomplete}">
                    <small data-if="hasHelpText">{helpText}</small>
                </div>`;
            const data = {
                pluginId: this.pluginId, id: field.id, label: translate(field.labelKey), type: field.type,
                placeholder: field.placeholderKey ? translate(field.placeholderKey) : '',
                autocomplete: field.autocomplete || '',
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
            const valueClass = !value || value === '' ? 'value-not-set' : (field.type === 'password' ? 'masked' : '');
            
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
        this.saveButton?.addEventListener('click', this.handleSave);
        this.cancelButton?.addEventListener('click', this.handleCancel);
        this.cardElement?.addEventListener('click', this.handleCardClick);
        this.formElement?.addEventListener('input', () => { this.hasChanges = true; this.#updateUI(); });
    }
    
    protected handleSave = async (): Promise<void> => {
        const validation = this.validateForm();
        if (!validation.isValid) {
            pubsub.publish(UI_EVENTS.SHOW_ERROR, { messageKey: 'correctErrors', substitutions: { errors: `\n- ${validation.errors?.join('\n- ') || 'Invalid fields.'}` } });
            return;
        }
        const result = await this.context.pluginUIService.savePluginGlobalConfig(this.pluginId, this.getFormValues());
        if (result.success) {
            this.switchToViewMode();
            pubsub.publish(UI_EVENTS.SHOW_NOTIFICATION, { messageKey: "notificationItemSaved", substitutions: { item: "Configuration" }, type: "success" });
        } else {
            pubsub.publish(UI_EVENTS.SHOW_ERROR, { messageKey: result.message ?? 'errorSavingConfig' });
        }
    };
    
    protected handleTestConnection = async (event: MouseEvent): Promise<void> => {
        event.stopPropagation();
        const configToTest = this.isEditing ? this.getFormValues() : this.initialConfig;
        if (!configToTest || !Object.values(configToTest).some(v => v)) {
            pubsub.publish(UI_EVENTS.SHOW_ERROR, { messageKey: "haUrlTokenMissing" }); return;
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
    
    protected handleCardClick = (e: MouseEvent): void => { 
        if (!(e.target as HTMLElement).closest('.card-item-actions button, .integration-form-actions button') && !this.isEditing) {
            e.stopPropagation();
            this.switchToEditMode(); 
        }
    };
    protected handleCancel = (): void => { this.switchToViewMode(); pubsub.publish(UI_EVENTS.SHOW_NOTIFICATION, { messageKey: "changesDiscarded", type: "info", duration: 2000 }); };
    
    protected switchToEditMode(): void { this.isEditing = true; this.hasChanges = false; this.#updateUI(); }
    protected switchToViewMode(): void { this.isEditing = false; this.hasChanges = false; this.#updateUI(); }

    #updateUI(): void {
        this.cardElement.classList.toggle("is-editing-highlight", this.isEditing);
        this.viewWrapper.style.display = this.isEditing ? 'none' : '';
        this.formElement.style.display = this.isEditing ? '' : 'none';
        this.viewModeActionsContainer.style.display = this.isEditing ? 'none' : 'flex';
        this.saveButton.disabled = !this.hasChanges;
        this.cancelButton.style.display = this.isEditing ? 'inline-flex' : 'none';

        if (this.isEditing) this.populateForm(this.initialConfig); else this.renderViewContent();

        const isEnabled = this.manifest.status === 'enabled';
        const toggleBtn = this.cardElement.querySelector<HTMLButtonElement>('button[data-action="toggle"]');
        if (toggleBtn) {
            toggleBtn.title = translate(isEnabled ? 'disable' : 'enable');
            toggleBtn.disabled = this.isPending;
            setIcon(toggleBtn, this.isPending ? 'UI_HOURGLASS' : (isEnabled ? 'UI_TOGGLE_ON' : 'UI_TOGGLE_OFF'));
        }
        this.cardElement.querySelector<HTMLButtonElement>('button[data-action="uninstall"]')!.disabled = this.isPending;
        
        const configToTest = this.isEditing ? this.getFormValues() : this.initialConfig;
        const canTest = !!configToTest && Object.values(configToTest).some(v => v);
        this.testButton.disabled = this.isTestingConnection || !canTest;
        
        this.testButton.classList.remove("connecting", "btn-success", "btn-danger");
        
        if (this.isTestingConnection) {
            this.testButton.classList.add("connecting");
            setIcon(this.testButton, 'UI_HOURGLASS');
            this.testButton.title = translate("testingConnection");
        } else if (this.lastTestResult) {
            const { success, messageKey, error } = this.lastTestResult;
            this.testButton.classList.add(success ? "btn-success" : "btn-danger");
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
        
        // FIX: Ensure the card's visual state reflects its enabled/disabled status.
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
        setIcon(this.saveButton.querySelector('.btn-icon-span'), 'UI_SAVE');
        setIcon(this.cancelButton.querySelector('.btn-icon-span'), 'UI_CANCEL');
        this.cancelButton.querySelector('.btn-text-span')!.textContent = translate('cancel');
        this.saveButton.querySelector('.btn-text-span')!.textContent = translate('save');
        this.renderFormFields();
        this.#updateUI();
    }

    public destroy(): void {
        pubsub.unsubscribe(`${PLUGIN_CONFIG_UPDATED_EVENT_PREFIX}${this.pluginId}`, this.#boundConfigUpdateHandler);
        this.cardElement?.remove();
        if (this.testButtonTimeout) clearTimeout(this.testButtonTimeout);
    }
}