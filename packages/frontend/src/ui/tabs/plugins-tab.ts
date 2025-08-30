/* FILE: packages/frontend/src/ui/tabs/plugins-tab.ts */
import type { AppStore, FrontendFullState } from '#frontend/core/state/app-store.js';
import type { UIController } from '#frontend/ui/ui-controller-core.js';
import { createCardElement, createCardActionButton } from '#frontend/ui/utils/card-utils.js';
import { setIcon } from '#frontend/ui/helpers/index.js';
import { BaseSettingsTab, type TabElements } from '../base-settings-tab.js';

import { UI_EVENTS, pubsub, translate } from '#shared/index.js';
import type { FullConfiguration, PluginManifest } from '#shared/index.js';
import type { IPluginGlobalSettingsComponent, PluginUIContext } from '#frontend/types/index.js';

export interface PluginsTabElements extends TabElements {
    pluginsListContainer?: HTMLElement | null;
    pluginsListPlaceholder?: HTMLElement | null;
    pluginInstallUrl?: HTMLInputElement | null;
    pluginInstallBtn?: HTMLButtonElement | null;
    pluginInstallUrlLabel?: HTMLElement | null;
    pluginDevInfoText?: HTMLElement | null;
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

        pubsub.subscribe(UI_EVENTS.RECEIVE_UI_CONTRIBUTION, this.#renderContributions);
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
        } finally {
            // FIX: Always remove from pending set after the API call finishes.
            // The WebSocket update will trigger the final re-render with the correct state.
            this.#pendingPlugins.delete(pluginId);
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
                } finally {
                    this.#pendingPlugins.delete(pluginId);
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
    
        const cardElements: HTMLElement[] = [];
    
        for (const manifest of manifests) {
            const hasSettings = manifest.capabilities.hasGlobalSettings;
            const isPending = this.#pendingPlugins.has(manifest.id);
            let component = this.#pluginSettingsComponents.get(manifest.id) || null;
    
            if (hasSettings && !component && this.#uiControllerRef.pluginUIService) {
                const factory = await this.#uiControllerRef.pluginUIService.getGlobalSettingsComponentFactory(manifest.id);
                if (factory) {
                    component = factory(manifest.id, manifest, pluginUIContext);
                    this.#pluginSettingsComponents.set(manifest.id, component);
                }
            }
    
            if (component) {
                component.update(this._appStore.getState().pluginGlobalConfigs.get(manifest.id) || null, pluginUIContext, { isPending });
                cardElements.push(component.getElement());
            } else {
                cardElements.push(this.#createBasicPluginCard(manifest, isPending));
            }
        }
        
        container.replaceChildren(...cardElements);

        for (const el of cardElements) {
            const componentId = el.id.replace('-integration-card', '');
            if (this.#pluginSettingsComponents.has(componentId)) {
                const component = this.#pluginSettingsComponents.get(componentId)!;
                component.initialize?.();
            }
        }
    }

    #createBasicPluginCard(manifest: PluginManifest, isPending: boolean): HTMLDivElement {
        const isEnabled = manifest.status === 'enabled';
        
        const toggleButton = createCardActionButton({ action: 'toggle', titleKey: isEnabled ? 'disable' : 'enable', iconKey: isPending ? 'UI_HOURGLASS' : (isEnabled ? 'UI_TOGGLE_ON' : 'UI_TOGGLE_OFF'), pluginId: manifest.id });
        toggleButton.disabled = isPending;

        const uninstallButton = createCardActionButton({ action: 'uninstall', titleKey: 'uninstall', iconKey: 'UI_DELETE', pluginId: manifest.id, extraClasses: ['btn-icon-danger'] });
        uninstallButton.disabled = isPending;
        
        const actionButtonsHtml = `${toggleButton.outerHTML}${uninstallButton.outerHTML}`;

        const description = translate(manifest.descriptionKey || '', { defaultValue: '' });
        const versionInfo = `v${manifest.version} by ${manifest.author || 'Unknown'}`;

        const detailsHtml = `<div class="card-detail-line"><span class="material-icons card-detail-icon" title="${translate('descriptionOptionalLabel')}"></span><span class="card-detail-value allow-wrap">${description}</span></div>`;
        const footerHtml = `<div class="card-footer"><div class="card-detail-line"><span class="material-icons card-detail-icon" title="Version Info"></span><span class="card-detail-value">${versionInfo}</span></div></div>`;

        const card = createCardElement({
            ...(manifest.icon ? { iconName: manifest.icon.name, iconType: manifest.icon.type } : { iconName: 'UI_EXTENSION' }),
            title: translate(manifest.nameKey, { defaultValue: manifest.id }),
            itemClasses: "plugin-item", actionButtonsHtml, detailsHtml, footerHtml
        });
        
        setIcon(card.querySelector('.card-detail-line:first-of-type .card-detail-icon'), 'UI_NOTES');
        setIcon(card.querySelector('.card-footer .card-detail-icon'), 'UI_INFO');
        
        if (manifest.status !== 'enabled') card.classList.add('config-item-disabled');
        if (isPending) card.classList.add('is-pending');
        return card;
    }

    public applyTranslations(): void {
        this._applyTranslationsHelper([
            { element: this._elements.pluginInstallUrlLabel, config: 'pluginInstallUrlLabel' },
            { element: this._elements.pluginInstallUrl, config: { key: 'pluginInstallUrlPlaceholder', attribute: 'placeholder' }},
            { element: this._elements.pluginInstallBtn?.querySelector('span:not(.material-icons)'), config: 'pluginInstallBtnText' },
            { element: this._elements.pluginDevInfoText, config: 'pluginDevInfoText' },
            { element: this._elements.openPluginDevDocsBtn, config: 'pluginDevInfoLink' }
        ]);
        this.loadSettings();
    }
}