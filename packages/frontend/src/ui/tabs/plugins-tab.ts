/* FILE: packages/frontend/src/ui/tabs/plugins-tab.ts */
import type { AppStore, FrontendFullState } from '#frontend/core/state/app-store.js';
import type { ConfirmationModalManager } from '#frontend/ui/ui-confirmation-modal-manager.js';
import type { UIController } from '#frontend/ui/ui-controller-core.js';
import { BaseSettingsTab, type TabElements } from '../base-settings-tab.js';
import { pubsub } from '#shared/core/pubsub.js';
import type { DocsModalManager } from '../ui-docs-modal-manager.js';
import { PluginInstallManager } from '../components/plugins/plugin-install-manager.js';
import { BasePluginGlobalSettingsComponent } from '../components/plugins/base-plugin-global-settings.component.js';
import type { IPluginGlobalSettingsComponent } from '#frontend/types/index.js';
import { UI_EVENTS } from '#shared/index.js';

export interface PluginsTabElements extends TabElements {
    container?: HTMLElement | null;
    pluginsListContainer?: HTMLElement | null;
    pluginsListPlaceholder?: HTMLElement | null;
    pluginInstallContainer?: HTMLElement | null;
    pluginDevInfoText?: HTMLElement | null;
    openPluginDevDocsBtn?: HTMLButtonElement | null;
}

export class PluginsTab extends BaseSettingsTab<PluginsTabElements> {
    #uiControllerRef: UIController & { _confirmationModalMgr?: ConfirmationModalManager | null };
    #pendingPlugins = new Set<string>();
    #installManager: PluginInstallManager | null = null;
    #editingPluginId: string | null = null;
    #cardComponents = new Map<string, IPluginGlobalSettingsComponent>();

    constructor(appStore: AppStore, uiControllerRef: UIController) {
        super(appStore, uiControllerRef, { container: '[data-tab-content="plugins"]' });
        this.#uiControllerRef = uiControllerRef;
        pubsub.subscribe(UI_EVENTS.RECEIVE_UI_CONTRIBUTION, this.#renderContributions);
    }
    
    public async finishInitialization(): Promise<void> {
        if (this._isInitialized) return;
        this.#renderLayout();
        await super.finishInitialization();
        this.#renderContributions();
    }
    
    #renderContributions = (): void => {
        // This tab does not have a dynamic contribution slot itself, but is called by the pubsub event.
    }

    protected _initializeSpecificEventListeners(): void {
        this._elements.pluginsListContainer?.addEventListener('click', this.#handlePluginCardClick);
        this._addEventListenerHelper("openPluginDevDocsBtn", "click", this.#handleOpenDocsClick);
    }
    
    protected _doesConfigUpdateAffectThisTab(newState: FrontendFullState, oldState: FrontendFullState): boolean {
        const newManifests = newState.pluginManifests || [];
        const oldManifests = oldState.pluginManifests || [];
    
        if (newManifests.length !== oldManifests.length) {
            return true;
        }
    
        newManifests.forEach(newManifest => {
            const oldManifest = oldManifests.find(m => m.id === newManifest.id);
            const component = this.#cardComponents.get(newManifest.id);
            if (!component) return;
    
            if (oldManifest && newManifest.status !== oldManifest.status) {
                component.manifest = newManifest;
                component.updateToggleButtonState();
                component.getElement().classList.toggle('config-item-disabled', newManifest.status !== 'enabled');
            }
    
            const newConfig = newState.pluginGlobalConfigs.get(newManifest.id) as object | null;
            const oldConfig = oldState.pluginGlobalConfigs.get(newManifest.id) as object | null;
            if (JSON.stringify(newConfig) !== JSON.stringify(oldConfig)) {
                component.update(newConfig);
            }
        });
    
        return false;
    }
    
    public loadSettings(): void {
        this.#renderPluginList();
    }

    #setEditing = (pluginId: string | null): void => {
        if (this.#editingPluginId === pluginId) return;

        const oldEditingId = this.#editingPluginId;
        if (oldEditingId && this.#cardComponents.has(oldEditingId)) {
            this.#cardComponents.get(oldEditingId)?.switchToViewMode();
        }

        this.#editingPluginId = pluginId;
        if (this.#editingPluginId && this.#cardComponents.has(this.#editingPluginId)) {
            this.#cardComponents.get(this.#editingPluginId)?.switchToEditMode();
        }
    }
    
    #handlePluginCardClick = (event: MouseEvent): void => {
        const card = (event.target as HTMLElement).closest<HTMLDivElement>('.config-item');
        if (!card?.dataset.pluginId) return;

        const pluginId = card.dataset.pluginId;
        const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button[data-action]');
        
        if (button && !this.#pendingPlugins.has(pluginId)) {
            event.preventDefault();
            event.stopPropagation();
            const { action } = button.dataset;
            if (action === 'toggle') {
                const manifest = this.#uiControllerRef.pluginUIService?.getPluginManifest(pluginId);
                const newState = manifest?.status === 'enabled' ? 'disabled' : 'enabled';
                void this.#setPluginState(pluginId, newState);
            } else if (action === 'uninstall') {
                this.#handleUninstallPlugin(pluginId);
            } else if (action === 'save') {
                void this.#handleSave(pluginId);
            } else if (action === 'cancel') {
                this.#setEditing(null);
            } else if (action === 'test-connection') {
                this.#handleTestConnection(pluginId);
            }
        } else if (card.classList.contains('card-item-clickable') && this.#editingPluginId !== pluginId) {
            this.#setEditing(pluginId);
        }
    };
    
    #handleOpenDocsClick = (): void => {
        this.#uiControllerRef.getDocsModalManager()
            .then((manager: DocsModalManager | undefined) => manager?.openModal("PLUGIN_DEV"))
            .catch((error: unknown) => console.error("[PluginsTab] Failed to open docs modal:", error));
    };

    #handleSave = async (pluginId: string): Promise<void> => {
        const component = this.#cardComponents.get(pluginId);
        if (!component) return;
    
        const newConfig = component.getFormValues();
        const result = await this.#uiControllerRef.pluginUIService.savePluginGlobalConfig(pluginId, newConfig);

        if (result.success) {
            component.update(result.config as object | null);
            this.#setEditing(null);
            pubsub.publish(UI_EVENTS.SHOW_NOTIFICATION, { messageKey: "notificationItemSaved", substitutions: { item: "Configuration" }, type: "success" });
        } else {
            pubsub.publish(UI_EVENTS.SHOW_ERROR, { messageKey: result.message ?? 'errorSavingConfig' });
        }
    };

    #handleTestConnection = async (pluginId: string): Promise<void> => {
        const component = this.#cardComponents.get(pluginId);
        if (!component) return;
    
        const configToTest = component.isEditing() ? component.getFormValues() : (component as BasePluginGlobalSettingsComponent<object>).initialConfig;
        
        component.updateTestState(true);

        try {
            const result = await this.#uiControllerRef.pluginUIService.sendPluginTestConnectionRequest?.(pluginId, configToTest) || null;
            if (result?.success === false) {
                pubsub.publish(UI_EVENTS.SHOW_ERROR, { 
                    messageKey: result.messageKey ?? 'haConnectionFailed', 
                    substitutions: { ...(result.error ?? {}) }, type: 'error' 
                });
            } else if (result?.success === true) {
                pubsub.publish(UI_EVENTS.SHOW_NOTIFICATION, { messageKey: result.messageKey || 'genericConnectionSuccess', type: 'success' });
            }
            component.updateTestState(false, result);
        } catch (error) {
            const result = { pluginId: pluginId, success: false, messageKey: 'TEST_FAILED', error: { message: (error as Error).message } };
            component.updateTestState(false, result);
        }
    }

    #setPluginState = async (pluginId: string, state: 'enabled' | 'disabled'): Promise<void> => {
        this.#pendingPlugins.add(pluginId);
        const component = this.#cardComponents.get(pluginId);
        if (component) {
            component.isPending = true;
            component.getElement().classList.add('is-pending');
        }

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
            // The backend file watcher will now trigger a resync and broadcast,
            // which will be handled by our smart subscription logic (_doesConfigUpdateAffectThisTab).
        } catch (error) {
            console.error(`[PluginsTab] Failed to set plugin state for '${pluginId}':`, error);
            pubsub.publish(UI_EVENTS.SHOW_ERROR, { message: `Failed to change plugin state: ${(error as Error).message}` });
        } finally {
            this.#pendingPlugins.delete(pluginId);
            if (component) {
                component.isPending = false;
                component.getElement().classList.remove('is-pending');
            }
        }
    };
    
    #handleUninstallPlugin = (pluginId: string): void => {
        const manifest = this.#uiControllerRef.pluginUIService?.getPluginManifest(pluginId);
        const name = this._translate(manifest?.nameKey || '', { defaultValue: pluginId });

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
    
    #renderPluginList(): void {
        const container = this._elements.pluginsListContainer;
        const placeholder = this._elements.pluginsListPlaceholder;
        const manifests = this._appStore.getState().pluginManifests || [];
        if (!container || !placeholder) return;

        if (manifests.length === 0) {
            placeholder.textContent = this._translate('noPluginsInstalled');
            container.innerHTML = '';
            container.appendChild(placeholder);
            return;
        }

        const sortedManifests = [...manifests].sort((a, b) => {
            const nameA = this._translate(a.nameKey, { defaultValue: a.id });
            const nameB = this._translate(b.nameKey, { defaultValue: b.id });
            return nameA.localeCompare(nameB);
        });
        
        const currentIds = new Set(sortedManifests.map(m => m.id));
        
        for (const id of this.#cardComponents.keys()) {
            if (!currentIds.has(id)) {
                const componentToDestroy = this.#cardComponents.get(id);
                componentToDestroy?.destroy?.();
                this.#cardComponents.delete(id);
            }
        }
    
        const cardElements = sortedManifests.map((manifest) => {
            let component = this.#cardComponents.get(manifest.id);
            if (!component) {
                const module = this.#uiControllerRef.pluginUIService.getLoadedModuleById(manifest.id);
                const componentFactory = module?.createGlobalSettingsComponent;

                component = componentFactory 
                    ? componentFactory(manifest.id, manifest, this.#uiControllerRef.pluginUIService.getPluginUIContext(manifest.id))
                    : new BasePluginGlobalSettingsComponent(manifest.id, manifest, this.#uiControllerRef.pluginUIService.getPluginUIContext(manifest.id), []);
                
                this.#cardComponents.set(manifest.id, component);
            }
            
            component.manifest = manifest;
            component.updateToggleButtonState();
            component.isPending = this.#pendingPlugins.has(manifest.id);

            const cardElement = component.getElement(); 
            cardElement.classList.toggle('config-item-disabled', manifest.status !== 'enabled');
            cardElement.classList.toggle('is-pending', component.isPending);

            if (this.#editingPluginId === manifest.id && !component.isEditing()) {
                component.switchToEditMode();
            } else if (this.#editingPluginId !== manifest.id && component.isEditing()) {
                component.switchToViewMode();
            }
            
            return cardElement;
        });
        
        container.replaceChildren(...cardElements);
    }

    public applyTranslations(): void {
        this._applyTranslationsHelper([
            { element: this._elements.pluginDevInfoText, config: { key: "pluginDevInfoText" } },
            { element: this._elements.openPluginDevDocsBtn, config: { key: "pluginDevInfoLink" } },
        ]);
        
        // Corrected logic: Iterate and apply translations to existing components
        // instead of calling the destructive loadSettings().
        for (const component of this.#cardComponents.values()) {
            component.applyTranslations?.();
        }
        
        this.#installManager?.applyTranslations();
        this.#renderContributions();
    }
    
    #renderLayout(): void {
        const container = this._elements.container;
        if (!container) return;
        container.innerHTML = `
            <div id="plugins-list-view">
                <div class="mb-6" id="pluginInstallContainer">
                    <!-- PluginInstallManager will render its content here -->
                </div>
                <div id="pluginsListContainer" class="flex flex-col gap-3"></div>
                <p id="pluginsListPlaceholder" class="list-placeholder"></p>
                <div class="flex items-center justify-center gap-2 text-sm text-text-secondary py-2 mt-6">
                    <span class="material-icons">code</span>
                    <span id="pluginDevInfoText"></span>
                    <button id="openPluginDevDocsBtn" class="underline hover:text-primary" type="button"></button>
                </div>
            </div>
        `;
        this._elements.pluginsListContainer = container.querySelector('#pluginsListContainer');
        this._elements.pluginsListPlaceholder = container.querySelector('#pluginsListPlaceholder');
        this._elements.pluginInstallContainer = container.querySelector('#pluginInstallContainer');
        this._elements.openPluginDevDocsBtn = container.querySelector('#openPluginDevDocsBtn');
        this._elements.pluginDevInfoText = container.querySelector('#pluginDevInfoText');
    }
}