/* FILE: packages/frontend/src/ui/components/plugins/base-plugin-global-settings.component.ts */
import { UI_EVENTS, PLUGIN_CONFIG_UPDATED_EVENT_PREFIX } from '#shared/constants/index.js';
import { pubsub } from '#shared/core/pubsub.js';
import { translate } from '#shared/services/translations.js';
import { createFromTemplate } from '#frontend/ui/utils/template-renderer.js';
import { setIcon } from '#frontend/ui/helpers/index.js';
import type { AppStore } from '#frontend/core/state/app-store.js';

import type { IPluginGlobalSettingsComponent, PluginUIContext } from '#frontend/types/index.js';
import type { ActionSettingFieldDescriptor, PluginManifest, PluginTestConnectionResultPayload } from '#shared/types/index.js';

export class BasePluginGlobalSettingsComponent<TConfig extends object> implements IPluginGlobalSettingsComponent {
    protected pluginId: string;
    protected context: PluginUIContext;
    protected manifest: PluginManifest;
    protected fieldDescriptors: ActionSettingFieldDescriptor[];

    protected cardElement: HTMLDivElement;
    protected viewWrapper: HTMLDivElement;
    protected formElement: HTMLFormElement;
    protected formFieldsContainer: HTMLDivElement;
    protected testButton: HTMLButtonElement;
    protected saveButton: HTMLButtonElement;
    protected cancelButton: HTMLButtonElement;
    protected viewModeActionsContainer: HTMLDivElement;
    protected formElements: Record<string, HTMLElement> = {};

    protected isEditing = false;
    protected hasChanges = false;
    protected isTestingConnection = false;
    protected isPending = false;
    protected testButtonTimeout: number | null = null;
    protected initialConfig: TConfig | null = null;
    protected lastTestResult: PluginTestConnectionResultPayload | null = null;

    #boundConfigUpdateHandler: (config?: unknown) => void;

    constructor(pluginId: string, manifest: PluginManifest, context: PluginUIContext, fieldDescriptors: ActionSettingFieldDescriptor[] = []) {
        this.pluginId = pluginId;
        this.manifest = manifest;
        this.context = context;
        this.fieldDescriptors = fieldDescriptors;
        
        this.cardElement = this.createCardElement();
        this.viewWrapper = this.cardElement.querySelector('.plugin-view-content-wrapper') as HTMLDivElement;
        this.formElement = this.cardElement.querySelector('.plugin-global-settings-form') as HTMLFormElement;
        this.formFieldsContainer = this.formElement.querySelector('.form-fields-container') as HTMLDivElement;
        this.testButton = this.cardElement.querySelector('.test-btn-header') as HTMLButtonElement;
        this.saveButton = this.formElement.querySelector('.save-btn') as HTMLButtonElement;
        this.cancelButton = this.formElement.querySelector('.cancel-btn') as HTMLButtonElement;
        this.viewModeActionsContainer = this.cardElement.querySelector('.view-mode-actions') as HTMLDivElement;
        
        this.#boundConfigUpdateHandler = (newConfig?: unknown) => this.onConfigUpdate(newConfig as TConfig | null);

        this.attachEventListeners();
        this.renderFormFields();
        const appStore = this.context.coreStateManager as AppStore;
        this.onConfigUpdate(appStore.getState().pluginGlobalConfigs.get(pluginId) as TConfig || null);
    }

    protected createCardElement(): HTMLDivElement {
        const template = `
            <div class="card-item integration-config-item card-item-clickable" id="{pluginId}-integration-card">
                <div class="card-header">
                    <div class="card-header-info">
                        <div class="card-title-actions-wrapper">
                            <span class="{iconClasses}">{iconContent}</span>
                            <span class="card-title">{pluginDisplayName}</span>
                            <div class="card-item-actions view-mode-actions">
                                <button type="button" class="btn btn-icon test-btn-header" title="{testConnectionTooltip}" aria-label="{testConnectionTooltip}"><span class="material-icons">network_check</span></button>
                                <button class="btn btn-icon" data-plugin-id="{pluginId}" data-action="toggle" title="{toggleTooltip}"><span class="material-icons">{toggleIcon}</span></button>
                                <button class="btn btn-icon btn-icon-danger" data-plugin-id="{pluginId}" data-action="uninstall" title="{uninstallTooltip}"><span class="material-icons">delete_forever</span></button>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="plugin-view-content-wrapper"></div>
                <form class="plugin-global-settings-form" style="display: none;" onsubmit="return false;">
                    <div class="form-fields-container"></div>
                    <div class="integration-form-actions">
                        <button type="button" class="btn btn-secondary cancel-btn"><span class="material-icons"></span><span>{cancelText}</span></button>
                        <button type="button" class="btn btn-primary save-btn"><span class="material-icons"></span><span>{saveText}</span></button>
                    </div>
                </form>
                <div data-if="hasFooter" data-html-key="footerHtml"></div>
            </div>`;
        
        const iconDetails = this.manifest.icon ?? { type: 'material-icons', name: 'extension' };
        const isMdi = iconDetails.type === 'mdi' || iconDetails.name.startsWith('mdi-');
        const isEnabled = this.manifest.status === 'enabled';
        const versionInfo = `v${this.manifest.version} by ${this.manifest.author || 'Unknown'}`;
        const footerHtml = `<div class="card-footer"><div class="card-detail-line"><span class="material-icons card-detail-icon" title="Version Info">info_outline</span><span class="card-detail-value">${versionInfo}</span></div></div>`;

        return createFromTemplate(template, {
            pluginId: this.pluginId,
            iconClasses: `card-icon ${isMdi ? `mdi ${iconDetails.name}` : 'material-icons'}`,
            iconContent: isMdi ? '' : iconDetails.name,
            pluginDisplayName: translate(this.manifest.nameKey, { defaultValue: this.pluginId }),
            testConnectionTooltip: translate('testConnectionTooltip'),
            cancelText: translate('cancel'), saveText: translate('save'),
            toggleTooltip: translate(isEnabled ? 'disable' : 'enable'),
            toggleIcon: isEnabled ? 'toggle_on' : 'toggle_off',
            uninstallTooltip: translate('uninstall'),
            hasFooter: true, footerHtml: footerHtml
        }) as HTMLDivElement;
    }

    protected renderFormFields(): void {
        this.formFieldsContainer.innerHTML = '';
        this.formElements = {};
        this.fieldDescriptors.forEach(field => {
            const template = `
                <div class="form-group">
                    <label for="{pluginId}-{id}">{label}</label>
                    <input type="{type}" id="{pluginId}-{id}" class="form-control" placeholder="{placeholder}" {autocompleteAttr}>
                    <small data-if="hasHelpText">{helpText}</small>
                </div>`;
            const data = {
                pluginId: this.pluginId, id: field.id, label: translate(field.labelKey), type: field.type,
                placeholder: field.placeholderKey ? translate(field.placeholderKey) : '',
                autocompleteAttr: field.type === 'password' ? 'autocomplete="current-password"' : '',
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
        let contentHtml = `<div class="card-detail-line"><span class="material-icons card-detail-icon" title="${translate('descriptionOptionalLabel')}">notes</span><span class="card-detail-value allow-wrap">${description}</span></div>`;

        this.fieldDescriptors.forEach(field => {
            const value = this.initialConfig ? (this.initialConfig as Record<string, unknown>)[field.id] : undefined;
            const displayValue = field.type === 'password' && value ? '********' : value || translate('Not Set');
            const valueClass = !value || value === '' ? 'value-not-set' : (field.type === 'password' ? 'masked' : '');
            contentHtml += `<div class="card-detail-line"><span class="card-detail-icon material-icons">vpn_key</span><span class="card-detail-value ${valueClass}">${displayValue}</span></div>`;
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
        pubsub.subscribe(`${PLUGIN_CONFIG_UPDATED_EVENT_PREFIX}${this.pluginId}`, this.#boundConfigUpdateHandler);
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
    
    protected handleTestConnection = async (): Promise<void> => {
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
    
    protected handleCardClick = (e: MouseEvent): void => { if (!(e.target as HTMLElement).closest('.card-item-actions button, .integration-form-actions button') && !this.isEditing) this.switchToEditMode(); };
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
            setIcon(toggleBtn, this.isPending ? 'UI_HOURGLASS' : (isEnabled ? 'toggle_on' : 'toggle_off'));
        }
        this.cardElement.querySelector<HTMLButtonElement>('button[data-action="uninstall"]')!.disabled = this.isPending;
        
        const configToTest = this.isEditing ? this.getFormValues() : this.initialConfig;
        const canTest = !!configToTest && Object.values(configToTest).some(v => v);
        this.testButton.disabled = this.isTestingConnection || !canTest;

        const iconEl = this.testButton.querySelector(".material-icons")!;
        this.testButton.classList.remove("connecting", "btn-success", "btn-danger");
        
        if (this.isTestingConnection) {
            this.testButton.classList.add("connecting");
            iconEl.textContent = "hourglass_top";
            this.testButton.title = translate("testingConnection");
        } else if (this.lastTestResult) {
            const { success, messageKey, error } = this.lastTestResult;
            this.testButton.classList.add(success ? "btn-success" : "btn-danger");
            iconEl.textContent = success ? "check_circle" : "error";
            this.testButton.title = translate(messageKey ?? (success ? 'haConnectionSuccess' : 'haConnectionFailed'), { message: error?.message ?? '' });
        } else {
            iconEl.textContent = "network_check";
            this.testButton.title = translate("testConnectionTooltip");
        }
    }

    public getElement = (): HTMLElement => this.cardElement;

    public update(c: TConfig | null, x: PluginUIContext, extraState: { isPending?: boolean } = {}): void {
        this.context = x;
        this.isPending = extraState.isPending || false;
        const newManifest = this.context.pluginUIService.getPluginManifest(this.pluginId);
        if (newManifest) this.manifest = newManifest;
        this.onConfigUpdate(c);
        this.cardElement.classList.toggle('config-item-disabled', this.manifest.status !== 'enabled');
        this.cardElement.classList.toggle('is-pending', this.isPending);
    }

    public onConfigUpdate(newConfig: TConfig | null): void {
        this.initialConfig = structuredClone(newConfig) as TConfig | null;
        this.#updateUI();
    }
    
    public applyTranslations(): void {
        const titleEl = this.cardElement.querySelector<HTMLElement>('.card-title');
        if (titleEl) titleEl.textContent = translate(this.manifest.nameKey, { defaultValue: this.pluginId });
        setIcon(this.saveButton, 'UI_SAVE');
        setIcon(this.cancelButton, 'UI_CANCEL');
        this.cancelButton.querySelector('span:not(.material-icons)')!.textContent = translate('cancel');
        this.saveButton.querySelector('span:not(.material-icons)')!.textContent = translate('save');
        this.renderFormFields();
        this.#updateUI();
    }

    public destroy(): void {
        pubsub.unsubscribe(`${PLUGIN_CONFIG_UPDATED_EVENT_PREFIX}${this.pluginId}`, this.#boundConfigUpdateHandler);
        this.cardElement?.remove();
        if (this.testButtonTimeout) clearTimeout(this.testButtonTimeout);
    }
}