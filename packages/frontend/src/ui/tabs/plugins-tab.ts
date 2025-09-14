/* FILE: packages/frontend/src/ui/tabs/plugins-tab.ts */
import type { AppStore, FrontendFullState } from '#frontend/core/state/app-store.js';
import type { UIController } from '#frontend/ui/ui-controller-core.js';
import { BaseSettingsTab, type TabElements } from '../base-settings-tab.js';
import { UI_EVENTS, pubsub, type FullConfiguration } from '#shared/index.js';
import type { DocsModalManager } from '../ui-docs-modal-manager.js';
import { PluginInstallManager } from '../components/plugins/plugin-install-manager.js';
import { PluginListRenderer } from '../components/plugins/plugin-list-renderer.js';

export interface PluginsTabElements extends TabElements {
    container?: HTMLElement | null;
    pluginsListContainer?: HTMLElement | null;
    pluginsListPlaceholder?: HTMLElement | null;
    pluginInstallContainer?: HTMLElement | null;
    pluginDevInfoText?: HTMLElement | null;
    openPluginDevDocsBtn?: HTMLButtonElement | null;
}

export class PluginsTab extends BaseSettingsTab<PluginsTabElements> {
    #uiControllerRef: UIController;
    #pendingPlugins = new Set<string>();
    #installManager: PluginInstallManager | null = null;
    #listRenderer: PluginListRenderer | null = null;
    #editingPluginId: string | null = null;

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
    
    protected async _additionalInitializationChecks(): Promise<void> {
        if (this._elements.pluginInstallContainer) {
            this.#installManager = new PluginInstallManager(this._elements.pluginInstallContainer, this.#uiControllerRef);
        }
        if (this._elements.pluginsListContainer && this._elements.pluginsListPlaceholder) {
            this.#listRenderer = new PluginListRenderer(
                this._elements.pluginsListContainer,
                this._elements.pluginsListPlaceholder,
                this.#uiControllerRef
            );
        }
    }
    
    #renderContributions = (): void => {
        // This tab does not have a dynamic contribution slot itself, but is called by the pubsub event.
    }

    protected _initializeSpecificEventListeners(): void {
        this._elements.pluginsListContainer?.addEventListener('click', this.#handlePluginCardClick);
        this._addEventListenerHelper("openPluginDevDocsBtn", "click", this.#handleOpenDocsClick);
    }
    
    protected _doesConfigUpdateAffectThisTab(newState: FrontendFullState, oldState: FrontendFullState): boolean { 
        return newState.pluginManifests !== oldState.pluginManifests || newState.pluginGlobalConfigs !== oldState.pluginGlobalConfigs;
    }
    
    public getSettingsToSave(): Partial<FullConfiguration> { return {}; }
    
    public loadSettings(): void {
        this.#listRenderer?.render(
            this._appStore.getState().pluginManifests || [],
            this.#pendingPlugins,
            this.#editingPluginId
        );
    }
    
    #handlePluginCardClick = (event: MouseEvent): void => {
        const card = (event.target as HTMLElement).closest<HTMLDivElement>('.plugin-item');
        if (!card?.dataset.pluginId) return;

        const pluginId = card.dataset.pluginId;
        const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button[data-action]');
        
        if (button) {
            const { action } = button.dataset;
            if (!action || this.#pendingPlugins.has(pluginId)) return;
            if (action === 'toggle') {
                const manifest = this.#uiControllerRef.pluginUIService?.getPluginManifest(pluginId);
                const newState = manifest?.status === 'enabled' ? 'disabled' : 'enabled';
                void this.#setPluginState(pluginId, newState);
            } else if (action === 'uninstall') {
                this.#handleUninstallPlugin(pluginId);
            }
        } else {
            const manifest = this.#uiControllerRef.pluginUIService.getPluginManifest(pluginId);
            if (manifest?.capabilities.hasGlobalSettings) {
                this.#editingPluginId = pluginId;
                this.loadSettings(); // Re-render to highlight the editing card
            }
        }
    };
    
    #handleOpenDocsClick = (): void => {
        this.#uiControllerRef.getDocsModalManager()
            .then((manager: DocsModalManager | undefined) => manager?.openModal("PLUGIN_DEV"))
            .catch((error: unknown) => console.error("[PluginsTab] Failed to open docs modal:", error));
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
            this.#pendingPlugins.delete(pluginId);
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

    public applyTranslations(): void {
        this._applyTranslationsHelper([
            { element: this._elements.pluginDevInfoText, config: "pluginDevInfoText" },
            { element: this._elements.openPluginDevDocsBtn, config: "pluginDevInfoLink" },
        ]);
        this.loadSettings();
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
                <div id="pluginsListContainer" class="grid grid-cols-1 gap-3"></div>
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
    }
}