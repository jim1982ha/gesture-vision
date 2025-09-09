/* FILE: packages/frontend/src/services/plugin-ui.service.ts */
import type { AppStore } from '#frontend/core/state/app-store.js';
import type { CameraService } from '#frontend/services/camera.service.js';
import { UI_EVENTS, pubsub } from '#shared/index.js';
import { webSocketService } from './websocket-service.js';
import { translate } from '#shared/services/translations.js';
import { setIcon, updateButtonGroupActiveState } from '#frontend/ui/helpers/index.js';
import { BasePluginGlobalSettingsComponent } from '#frontend/ui/components/plugins/base-plugin-global-settings.component.js';
import { GenericPluginActionSettingsComponent } from '#frontend/ui/components/plugins/generic-plugin-action-settings.component.js';
import { createCardElement } from '#frontend/ui/utils/card-utils.js';
import type { PluginManifest, PluginTestConnectionResultPayload,} from '#shared/index.js';
import type {
  FrontendPluginModule,
  CreatePluginGlobalSettingsComponentFn,
  IPluginActionSettingsComponent,
  ActionDisplayDetailsRendererFn,
  PluginUIContext,
  IPluginGlobalSettingsComponent,
} from '#frontend/types/index.js';
import type { TranslationService } from './translation.service.js';
import type { UIController } from '#frontend/ui/ui-controller-core.js';
import type { GestureProcessor } from '#frontend/gestures/processor.js';
import * as constants from '#shared/index.js';
import * as actionDisplayUtils from '#frontend/ui/helpers/display-helpers.js';
import * as utils from '#shared/utils/index.js';
import { ActionPluginUIManager } from '#frontend/ui/components/gesture-form/action-plugin-ui-manager.js';

// Global plugin registry, populated by individual plugin scripts
declare global {
  interface Window {
    GestureVisionPlugins: Record<string, FrontendPluginModule>;
  }
}

export class PluginUIService {
  #pluginManifests = new Map<string, PluginManifest>();
  #loadedFrontendModules = new Map<string, FrontendPluginModule>();
  #actionDisplayRenderers = new Map<string, ActionDisplayDetailsRendererFn>();
  #moduleLoadPromises = new Map<
    string,
    Promise<FrontendPluginModule | undefined>
  >();
  #pluginSettingsComponents = new Map<string, IPluginGlobalSettingsComponent>();
  #appStore: AppStore;
  #translationService: TranslationService;
  #cameraServiceRef: CameraService | null = null;
  #gestureProcessorRef: GestureProcessor | null = null;
  #uiContributions = new Map<
    string,
    { element: HTMLElement; pluginId: string }[]
  >();
  #uiControllerRef: UIController | null = null;
  #unsubscribeStore: () => void;

  constructor(
    appStore: AppStore,
    translationService: TranslationService
  ) {
    this.#appStore = appStore;
    this.#translationService = translationService;

    // FIX: Remove debounce to prevent race condition on initial load.
    // Manifests should be processed immediately when the store updates.
    this.#unsubscribeStore = this.#appStore.subscribe((state) =>
      this.#handleManifestUpdate(state.pluginManifests).catch((e) => console.error(e))
    );

    this.#handleManifestUpdate(
      this.#appStore.getState().pluginManifests
    ).catch((e) =>
      console.error('Error during initial plugin manifest handling:', e)
    );
  }

  public setUIController(uiController: UIController): void {
    this.#uiControllerRef = uiController;
    this.#cameraServiceRef = uiController.cameraService;
    this.#gestureProcessorRef = uiController.gesture;
  }

  destroy() {
    this.#unsubscribeStore();
    this.#pluginSettingsComponents.forEach(component => component.destroy?.());
    this.#pluginSettingsComponents.clear();
  }

  async #handleManifestUpdate(manifests?: PluginManifest[]): Promise<void> {
    if (!manifests || !Array.isArray(manifests)) return;
    const oldManifestsMap = new Map(this.#pluginManifests);
    const newManifestsMap = new Map(manifests.map((m) => [m.id, m]));
    this.#pluginManifests = newManifestsMap;
    this.#translationService.mergePluginTranslations(manifests);

    await this.#reconcilePluginComponents(newManifestsMap, oldManifestsMap);

    pubsub.publish(UI_EVENTS.PLUGINS_MANIFESTS_PROCESSED);
  }

  async #reconcilePluginComponents(newManifests: Map<string, PluginManifest>, oldManifests: Map<string, PluginManifest>): Promise<void> {
    const pluginsToDeregister = Array.from(oldManifests.values()).filter(m => !newManifests.has(m.id) || newManifests.get(m.id)!.status === 'disabled');
    const pluginsToInitialize = Array.from(newManifests.values()).filter(m => m.status === 'enabled' && oldManifests.get(m.id)?.status !== 'enabled');
    const pluginsToUpdate = Array.from(newManifests.values()).filter(m => m.status === 'enabled' && oldManifests.get(m.id)?.status === 'enabled');

    for (const plugin of pluginsToDeregister) {
      this.#deregisterPlugin(plugin.id);
    }
    for (const plugin of pluginsToInitialize) {
      await this.#initializePlugin(plugin);
    }
    for (const manifest of pluginsToUpdate) {
        const component = this.#pluginSettingsComponents.get(manifest.id);
        if (component) {
            const config = this.#appStore.getState().pluginGlobalConfigs.get(manifest.id) || null;
            component.update(config, this.getPluginUIContext(manifest.id), {});
        }
    }
    
    if (pluginsToDeregister.length > 0 || pluginsToInitialize.length > 0) {
      this.#uiControllerRef?.applyTranslations();
      pubsub.publish(UI_EVENTS.RECEIVE_UI_CONTRIBUTION, {
          initialized: pluginsToInitialize.map(p => p.id),
          deregistered: pluginsToDeregister.map(p => p.id)
      });
    }
  }

  async #initializePlugin(manifest: PluginManifest): Promise<void> {
    const module = await this.loadPluginFrontendModule(manifest.id);
    if (!module) return;

    if (manifest.capabilities.hasGlobalSettings && module.createGlobalSettingsComponent) {
      const component = module.createGlobalSettingsComponent(manifest.id, manifest, this.getPluginUIContext(manifest.id));
      component.initialize?.();
      const config = this.#appStore.getState().pluginGlobalConfigs.get(manifest.id) || null;
      component.update(config, this.getPluginUIContext(manifest.id));
      this.#pluginSettingsComponents.set(manifest.id, component);
    }
  }

  #deregisterPlugin(pluginId: string): void {
    const component = this.#pluginSettingsComponents.get(pluginId);
    component?.destroy?.();
    this.#pluginSettingsComponents.delete(pluginId);
    
    for (const slotId of this.#uiContributions.keys()) {
        const contributions = (this.#uiContributions.get(slotId) || []).filter(c => c.pluginId !== pluginId);
        this.#uiContributions.set(slotId, contributions);
    }

    document.head.querySelector<HTMLLinkElement>(`link[data-plugin-id="${pluginId}"]`)?.remove();
    this.#loadedFrontendModules.delete(pluginId);
    this.#actionDisplayRenderers.delete(pluginId);
    this.#moduleLoadPromises.delete(pluginId);
  }

  public setCameraService(cameraService: CameraService | null): void {
    this.#cameraServiceRef = cameraService;
  }
  
  public getLoadedModuleById = (pluginId: string): FrontendPluginModule | undefined => this.#loadedFrontendModules.get(pluginId);
  public getGlobalSettingsComponents = (): Map<string, IPluginGlobalSettingsComponent> => this.#pluginSettingsComponents;

  public getPluginUIContext(pluginId?: string): PluginUIContext {
    return {
      manifest: pluginId ? this.getPluginManifest(pluginId) : undefined,
      coreStateManager: this.#appStore,
      pluginUIService: this,
      cameraService: this.#cameraServiceRef || undefined,
      gesture: this.#gestureProcessorRef || undefined,
      webSocketService: webSocketService || undefined,
      requestCloseSettingsModal: () => this.#uiControllerRef?.modalManager?.closeSettingsModal(),
      globalSettingsModalManager: this.#uiControllerRef?._globalSettingsForm || undefined,
      uiController: this.#uiControllerRef || undefined,
      data: {},
      services: {
        translate: translate as ( key: string, substitutions?: Record<string, unknown> | undefined ) => string,
        pubsub,
      },
      uiComponents: {
        createCardElement, setIcon, updateButtonGroupActiveState,
        BasePluginGlobalSettingsComponent, GenericPluginActionSettingsComponent, ActionPluginUIManager,
      },
      shared: { constants, services: { actionDisplayUtils }, utils },
    };
  }

  public async loadPluginFrontendModule(pluginId: string): Promise<FrontendPluginModule | undefined> {
    if (this.#loadedFrontendModules.has(pluginId)) {
        return this.#loadedFrontendModules.get(pluginId);
    }
    if (this.#moduleLoadPromises.has(pluginId)) {
        return this.#moduleLoadPromises.get(pluginId)!;
    }

    const manifest = this.getPluginManifest(pluginId);
    if (!manifest) {
        console.error(`[PluginLoader] ERROR: Manifest not found for plugin '${pluginId}'. Cannot load.`);
        return undefined;
    }
    
    if (!manifest.frontendEntry) {
        return undefined;
    }

    const loadPromise = new Promise<FrontendPluginModule | undefined>((resolve, reject) => {
        const scriptId = `plugin-script-${pluginId}`;
        document.getElementById(scriptId)?.remove();

        const script = document.createElement('script');
        script.id = scriptId;
        script.type = 'module';
        script.async = true;

        const versionQuery = `v=${manifest.version || Date.now()}`;
        
        const entryFile = manifest.frontendEntry;
        const finalUrl = `/plugins/${pluginId}/${entryFile}?${versionQuery}`;
        
        script.src = finalUrl;

        script.onload = async () => {
            const module = window.GestureVisionPlugins[pluginId];
            if (module) {
                module.manifest = manifest;
                if (typeof module.getActionDisplayDetails === 'function') this.#actionDisplayRenderers.set(pluginId, module.getActionDisplayDetails);
                if (typeof module.init === 'function') await module.init(this.getPluginUIContext(pluginId));
                this.#loadedFrontendModules.set(pluginId, module);
                resolve(module);
            } else {
                reject(new Error(`Plugin '${pluginId}' script loaded but did not register itself correctly.`));
            }
        };
        script.onerror = (event) => {
            reject(new Error(`Failed to load script for plugin '${pluginId}'. Details: ${event}`));
        };
        
        document.head.appendChild(script);
    });

    this.#moduleLoadPromises.set(pluginId, loadPromise);
    return loadPromise.finally(() => { this.#moduleLoadPromises.delete(pluginId); });
  }

  public getPluginManifest = (pluginId: string): PluginManifest | undefined => this.#pluginManifests.get(pluginId);
  public getAllPluginManifests = (): PluginManifest[] => Array.from(this.#pluginManifests.values());
  public getAvailableActionPlugins = (): PluginManifest[] => this.getAllPluginManifests().filter(m => m.capabilities.providesActions && m.status === 'enabled');
  public getPluginsWithGlobalSettings = (): PluginManifest[] => this.getAllPluginManifests().filter((m) => m.capabilities.hasGlobalSettings);
  public hasAnyPluginWithGlobalSettings = (): boolean => this.getPluginsWithGlobalSettings().length > 0;

  public async getGlobalSettingsComponentFactory(pluginId: string): Promise<CreatePluginGlobalSettingsComponentFn | undefined> {
    const module = await this.loadPluginFrontendModule(pluginId);
    return module?.createGlobalSettingsComponent;
  }

  public async createActionSettingsComponent(pluginId: string, currentSettings: Record<string, unknown> | null): Promise<IPluginActionSettingsComponent | null> {
    const module = await this.loadPluginFrontendModule(pluginId);
    if (!module?.actionSettingsFields) return null;

    const context = this.getPluginUIContext(pluginId);
    const component = new GenericPluginActionSettingsComponent(pluginId, module.actionSettingsFields, context);
    component.render(currentSettings);
    return component;
  }

  public getActionDisplayDetailsRenderer = (pluginId: string): ActionDisplayDetailsRendererFn | undefined => this.#actionDisplayRenderers.get(pluginId);

  public async getPluginGlobalConfig(pluginId: string): Promise<unknown | null> {
    const cachedConfig = this.#appStore.getState().pluginGlobalConfigs.get(pluginId);
    if (cachedConfig !== undefined) return cachedConfig;

    webSocketService.request('GET_PLUGIN_GLOBAL_CONFIG', { pluginId });
    return undefined;
  }

  public async savePluginGlobalConfig(pluginId: string, config: unknown): Promise<{ success: boolean; message?: string; config?: unknown; validationErrors?: unknown; }> {
    if (!this.#pluginManifests.has(pluginId)) return { success: false, message: `Plugin '${pluginId}' not registered.` };
    return webSocketService.request('PATCH_PLUGIN_GLOBAL_CONFIG', { pluginId, config });
  }

  public async sendPluginTestConnectionRequest(pluginId: string, configToTest: unknown): Promise<PluginTestConnectionResultPayload | null> {
    if (!this.#pluginManifests.has(pluginId)) return { pluginId, success: false, messageKey: 'pluginNotRegistered', error: { message: `Plugin '${pluginId}' not found.` } };
    try {
      const response = await fetch(`/api/plugins/${pluginId}/test`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(configToTest), });
      return response.json() as Promise<PluginTestConnectionResultPayload>;
    } catch (error) {
      return { pluginId, success: false, messageKey: 'TEST_FAILED', error: { message: (error as Error).message } };
    }
  }

  public registerContribution(slotId: string, element: HTMLElement, pluginId: string): void {
    if (!this.#uiContributions.has(slotId)) {
      this.#uiContributions.set(slotId, []);
    }
    const slotContributions = this.#uiContributions.get(slotId)!;
    if (!slotContributions.some(c => c.pluginId === pluginId)) {
        slotContributions.push({ element, pluginId });
    }
    pubsub.publish(UI_EVENTS.RECEIVE_UI_CONTRIBUTION, { slotId, pluginId });
  }
  public getContributionsForSlot = (slotId: string): HTMLElement[] => (this.#uiContributions.get(slotId) || []).map((c) => c.element);
}