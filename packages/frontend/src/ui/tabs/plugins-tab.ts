/* FILE: packages/frontend/src/ui/tabs/plugins-tab.ts */
import type { AppStore, FrontendFullState } from '#frontend/core/state/app-store.js';
import type { UIController } from '#frontend/ui/ui-controller-core.js';
import { createCardElement } from '#frontend/ui/utils/card-utils.js';
import { setIcon } from '#frontend/ui/helpers/index.js';
import { BaseSettingsTab, type TabElements } from '../base-settings-tab.js';

import { UI_EVENTS, PLUGIN_CONFIG_UPDATED_EVENT_PREFIX } from '#shared/constants/index.js';
import { pubsub } from '#shared/core/pubsub.js';
import { translate } from '#shared/services/translations.js';

import type { FullConfiguration, PluginManifest } from '#shared/types/index.js';
import type { IPluginGlobalSettingsComponent, PluginUIContext } from '#frontend/types/index.js';

export interface PluginsTabElements extends TabElements {
    pluginsListContainer?: HTMLElement | null;
    pluginsListPlaceholder?: HTMLElement | null;
    pluginInstallUrl?: HTMLInputElement | null;
    pluginInstallBtn?: HTMLButtonElement | null;
    openPluginDevDocsBtn?: HTMLButtonElement | null;
}

export class PluginsTab extends BaseSettingsTab<PluginsTabElements> {
    #uiControllerRef: UIController;
    #isInstalling = false;
    #pendingPlugins = new Set<string>();
    #pluginSettingsComponents = new Map<string, IPluginGlobalSettingsComponent>();

    constructor(elements: PluginsTabElements, appStore: AppStore, uiControllerRef: UIController) {
        super(elements, appStore);
        this.#uiControllerRef = uiControllerRef;
    }
    
    public async finishInitialization(): Promise<void> {
        if (this._isInitialized) return;
        this._elements.openPluginDevDocsBtn = document.getElementById('openPluginDevDocsBtn') as HTMLButtonElement | null;
        await super.finishInitialization();
        this.#renderContributions();
    }
    
    #renderContributions = (): void => {
        const slot = document.getElementById('custom-gestures-actions-slot');
        if (!slot || !this.#uiControllerRef.pluginUIService) return;

        slot.innerHTML = '';
        const contributions = this.#uiControllerRef.pluginUIService.getContributionsForSlot('custom-gestures-actions');
        contributions.forEach((element: HTMLElement) => {
            slot.appendChild(element);
        });
    }

    protected _initializeSpecificEventListeners(): void {
        this._addEventListenerHelper("pluginInstallBtn", "click", this.#handleInstallPluginClick);
        this._elements.pluginsListContainer?.addEventListener('click', this.#handlePluginCardClick);
        this._addEventListenerHelper("openPluginDevDocsBtn", "click", this.#handleOpenDocsClick);
    }
    
    protected _attachCommonEventListeners(): void {
        this._appStore.subscribe((state, prevState) => {
            if(this._isInitialized && this._doesConfigUpdateAffectThisTab(state, prevState)) {
                this.#pendingPlugins.clear();
                this.loadSettings();
            }
        });
        pubsub.subscribe(UI_EVENTS.RECEIVE_UI_CONTRIBUTION, this.#renderContributions);
    }

    protected _doesConfigUpdateAffectThisTab(newState: FrontendFullState, oldState: FrontendFullState): boolean {
        return newState.pluginManifests !== oldState.pluginManifests || newState.pluginGlobalConfigs !== oldState.pluginGlobalConfigs;
    }
    
    public getSettingsToSave(): Partial<FullConfiguration> { return {}; }
    
    public loadSettings(): void {
        this.#renderPluginCards(this._appStore.getState().pluginManifests || []);
    }
    
    #handleInstallPluginClick = async (): Promise<void> => {
        const urlInput = this._elements.pluginInstallUrl;
        const url = urlInput?.value.trim();
        if (!url || this.#isInstalling) return;
        
        this.#isInstalling = true;
        this.loadSettings();

        try {
            const response = await fetch('/api/plugins/manage/install', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url }),
            });
            const result = await response.json() as { success: boolean; message: string; };

            if (result.success) {
                pubsub.publish(UI_EVENTS.SHOW_NOTIFICATION, { message: result.message, type: 'success' });
                if (urlInput) urlInput.value = '';
            } else {
                pubsub.publish(UI_EVENTS.SHOW_ERROR, { message: result.message });
            }
        } catch (error) {
            pubsub.publish(UI_EVENTS.SHOW_ERROR, { message: `Install failed: ${(error as Error).message}` });
        } finally {
            this.#isInstalling = false;
        }
    };
    
    #handlePluginCardClick = (event: MouseEvent): void => {
        const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button[data-action]');
        if (button) {
            const { pluginId, action } = button.dataset;
            if (!pluginId || !action || this.#pendingPlugins.has(pluginId)) return;
    
            if (action === 'toggle') {
                const manifest = this.#uiControllerRef.pluginUIService?.getPluginManifest(pluginId);
                const newState = manifest?.status === 'enabled' ? 'disabled' : 'enabled';
                void this.#setPluginState(pluginId, newState);
            } else if (action === 'uninstall') {
                this.#handleUninstallPlugin(pluginId);
            }
            return;
        }
    };

    #handleOpenDocsClick = (): void => {
        this.#uiControllerRef.getDocsModalManager()
            .then(manager => manager?.openModal("PLUGIN_DEV"))
            .catch(error => console.error("[PluginsTab] Failed to open docs modal:", error));
    };

    #setPluginState = async (pluginId: string, state: 'enabled' | 'disabled'): Promise<void> => {
        this.#pendingPlugins.add(pluginId);
        this.loadSettings(); 

        try {
            const response = await fetch(`/api/plugins/manage/${pluginId}/state`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ state }),
            });
            if (!response.ok) {
                const result = await response.json() as { message?: string };
                throw new Error(result.message || `HTTP error ${response.status}`);
            }
        } catch (error) {
            console.error(`[PluginsTab] Failed to set plugin state for '${pluginId}':`, error);
            pubsub.publish(UI_EVENTS.SHOW_ERROR, { message: `Failed to change plugin state: ${(error as Error).message}` });
            this.#pendingPlugins.delete(pluginId); 
            this.loadSettings();
        }
    };
    
    #handleUninstallPlugin = (pluginId: string): void => {
        const manifest = this.#uiControllerRef.pluginUIService?.getPluginManifest(pluginId);
        const name = translate(manifest?.nameKey || '', { defaultValue: pluginId });

        this.#uiControllerRef._confirmationModalMgr?.show({
            titleKey: 'confirmDeleteGestureTitle',
            messageKey: 'confirmDeleteMessage',
            messageSubstitutions: { item: name },
            confirmTextKey: 'uninstall',
            onConfirm: async () => {
                this.#pendingPlugins.add(pluginId);
                this.loadSettings();
                
                try {
                    const response = await fetch(`/api/plugins/manage/${pluginId}/uninstall`, { method: 'POST' });
                    const result = await response.json() as { success: boolean; message: string; };
                    if (result.success) {
                        pubsub.publish(UI_EVENTS.SHOW_NOTIFICATION, { message: result.message, type: 'success' });
                    } else { throw new Error(result.message); }
                } catch (error) {
                    pubsub.publish(UI_EVENTS.SHOW_ERROR, { message: `Uninstall failed: ${(error as Error).message}` });
                    this.#pendingPlugins.delete(pluginId);
                    this.loadSettings();
                }
            },
        });
    };

    #renderPluginCards = async (manifests: PluginManifest[]): Promise<void> => {
        const container = this._elements.pluginsListContainer;
        const placeholder = this._elements.pluginsListPlaceholder;
        if (!container || !placeholder) return;
    
        if(this._elements.pluginInstallUrl) this._elements.pluginInstallUrl.disabled = this.#isInstalling;
        if(this._elements.pluginInstallBtn) this._elements.pluginInstallBtn.disabled = this.#isInstalling;
        setIcon(this._elements.pluginInstallBtn, this.#isInstalling ? 'UI_HOURGLASS' : 'UI_UPLOAD');
    
        if (manifests.length === 0) {
            placeholder.textContent = translate('noPluginsInstalled');
            container.innerHTML = '';
            container.appendChild(placeholder);
            return;
        }
    
        const newManifestIds = new Set(manifests.map(m => m.id));
    
        for (const [pluginId, component] of this.#pluginSettingsComponents.entries()) {
            if (!newManifestIds.has(pluginId)) {
                component.destroy?.();
                this.#pluginSettingsComponents.delete(pluginId);
            }
        }
    
        const pluginUIContext = this.#uiControllerRef.pluginUIService?.getPluginUIContext() as PluginUIContext;
    
        const cardPromises = manifests.map(async (manifest) => {
            const hasSettings = manifest.capabilities.hasGlobalSettings;
            const isPending = this.#pendingPlugins.has(manifest.id);
            let component: IPluginGlobalSettingsComponent | null = null;
    
            if (hasSettings) {
                if (this.#pluginSettingsComponents.has(manifest.id)) {
                    component = this.#pluginSettingsComponents.get(manifest.id)!;
                } else if (this.#uiControllerRef.pluginUIService) {
                    const factory = await this.#uiControllerRef.pluginUIService.getGlobalSettingsComponentFactory(manifest.id);
                    if (factory) {
                        component = factory(manifest.id, manifest, pluginUIContext);
                        this.#pluginSettingsComponents.set(manifest.id, component);
                    }
                }
                component?.update?.(this._appStore.getState().pluginGlobalConfigs.get(manifest.id) || null, pluginUIContext, { isPending });
            }
            
            return component 
                ? component.getElement() 
                : this.#createBasicPluginCard(manifest, isPending);
        });
    
        const elementsToRender = await Promise.all(cardPromises);
        container.replaceChildren(...elementsToRender.filter((el): el is HTMLElement => !!el));
    }

    #createBasicPluginCard(manifest: PluginManifest, isPending: boolean): HTMLDivElement {
        const isEnabled = manifest.status === 'enabled';
        const actionButtons = `
            <button class="btn btn-icon" data-plugin-id="${manifest.id}" data-action="toggle" title="${translate(isEnabled ? 'disable' : 'enable')}" ${isPending ? 'disabled' : ''}>
                <span class="material-icons">${isPending ? 'hourglass_top' : (isEnabled ? 'toggle_on' : 'toggle_off')}</span>
            </button>
            <button class="btn btn-icon btn-icon-danger" data-plugin-id="${manifest.id}" data-action="uninstall" title="${translate('uninstall')}" ${isPending ? 'disabled' : ''}>
                <span class="material-icons">delete_forever</span>
            </button>
        `;
        const description = translate(manifest.descriptionKey || '', { defaultValue: '' });
        const versionInfo = `v${manifest.version} by ${manifest.author || 'Unknown'}`;

        const detailsHtml = `<div class="card-detail-line"><span class="material-icons card-detail-icon" title="${translate('descriptionOptionalLabel')}">notes</span><span class="card-detail-value allow-wrap">${description}</span></div>`;
        const footerHtml = `<div class="card-footer"><div class="card-detail-line"><span class="material-icons card-detail-icon" title="Version Info">info_outline</span><span class="card-detail-value">${versionInfo}</span></div></div>`;

        const card = createCardElement({
            ...(manifest.icon ? { iconName: manifest.icon.name, iconType: manifest.icon.type } : { iconName: 'extension' }),
            title: translate(manifest.nameKey, { defaultValue: manifest.id }),
            itemClasses: "plugin-item", actionButtonsHtml: actionButtons, detailsHtml, footerHtml
        });
        
        if (manifest.status !== 'enabled') card.classList.add('config-item-disabled');
        if (isPending) card.classList.add('is-pending');
        return card;
    }

    public applyTranslations(): void {
        this._applyTranslationsHelper([
            { element: this._elements.pluginInstallUrlLabel, config: 'pluginInstallUrlLabel' },
            { element: this._elements.pluginInstallUrl, config: { key: 'pluginInstallUrlPlaceholder', attribute: 'placeholder' }},
            { element: this._elements.pluginInstallBtn?.querySelector('span:not(.material-icons)'), config: 'pluginInstallBtnText' },
            { element: document.getElementById('pluginDevInfoText'), config: 'pluginDevInfoText' },
            { element: this._elements.openPluginDevDocsBtn, config: 'pluginDevInfoLink' }
        ]);
        this.loadSettings();
    }
}