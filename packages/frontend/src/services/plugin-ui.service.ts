/* FILE: packages/frontend/src/services/plugin-ui.service.ts */
import type { AppStore } from '#frontend/core/state/app-store.js';
import type { CameraService } from '#frontend/services/camera.service.js';
import { UI_EVENTS, WEBSOCKET_EVENTS, pubsub } from '#shared/index.js';
import { webSocketService } from './websocket-service.js';
import { setIcon, updateButtonGroupActiveState, setElementVisibility } from '#frontend/ui/helpers/index.js';
import { BasePluginGlobalSettingsComponent } from '#frontend/ui/components/plugins/base-plugin-global-settings.component.js';
import { GenericPluginActionSettingsComponent } from '#frontend/ui/components/plugins/generic-plugin-action-settings.component.js';
import { createCardElement } from '#frontend/ui/utils/card-utils.js';
import type { PluginManifest, PluginTestConnectionResultPayload,} from '#shared/index.js';
import type {
  FrontendPluginModule,
  IPluginActionSettingsComponent,
  ActionDisplayDetailsRendererFn,
  PluginUIContext,
  IPluginGlobalSettingsComponent,
} from '#frontend/types/index.js';
import type { TranslationService } from './translation.service.js';
import type { UIController } from '#frontend/ui/ui-controller-core.js';
import type { GestureProcessor } from '#frontend/gestures/processor.js';
import * as constants from '#shared/index.js';
import * as actionDisplayUtils from '#frontend/ui/helpers/index.js';
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
    const allIds = new Set([...newManifests.keys(), ...oldManifests.keys()]);

    const changes = {
        uninstalled: [] as string[],
        installed: [] as string[],
        disabled: [] as string[],
        enabled: [] as string[],
        updated: [] as string[],
    };

    for (const id of allIds) {
        const oldM = oldManifests.get(id);
        const newM = newManifests.get(id);

        if (oldM && !newM) {
            changes.uninstalled.push(id);
        } else if (!oldM && newM) {
            if (newM.status === 'enabled') changes.installed.push(id);
        } else if (oldM && newM) {
            if (oldM.status === 'enabled' && newM.status === 'disabled') {
                changes.disabled.push(id);
            } else if (oldM.status === 'disabled' && newM.status === 'enabled') {
                changes.enabled.push(id);
            } else if (oldM.status === 'enabled' && newM.status === 'enabled') {
                changes.updated.push(id);
            }
        }
    }
    
    const hasStructuralChanges = changes.uninstalled.length > 0 || changes.installed.length > 0 || changes.enabled.length > 0 || changes.disabled.length > 0;

    for (const pluginId of [...changes.uninstalled, ...changes.disabled]) {
        const wasUninstalled = changes.uninstalled.includes(pluginId);
        this.#deregisterPlugin(pluginId, wasUninstalled);
        this.#appStore.getState().actions.clearPluginExtData(pluginId);
    }
    
    const initializationPromises = [...changes.installed, ...changes.enabled].map(pluginId => {
        if (changes.enabled.includes(pluginId)) {
            this.#deregisterPlugin(pluginId, false);
        }
        return this.#initializePlugin(newManifests.get(pluginId)!);
    });
    await Promise.all(initializationPromises);

    for (const pluginId of changes.updated) {
        const component = this.#pluginSettingsComponents.get(pluginId);
        if (component) {
            const config = this.#appStore.getState().pluginGlobalConfigs.get(pluginId) || null;
            component.update(config, this.getPluginUIContext(pluginId), {});
        }
    }
    
    if (hasStructuralChanges) {
      this.#uiControllerRef?.applyTranslations();
      pubsub.publish(UI_EVENTS.RECEIVE_UI_CONTRIBUTION, {
          initialized: [...changes.installed, ...changes.enabled],
          deregistered: [...changes.uninstalled, ...changes.disabled]
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

  #deregisterPlugin(pluginId: string, wasUninstalled: boolean): void {
    const component = this.#pluginSettingsComponents.get(pluginId);
    component?.destroy?.();
    this.#pluginSettingsComponents.delete(pluginId);
    
    for (const slotId of this.#uiContributions.keys()) {
        const contributions = (this.#uiContributions.get(slotId) || []).filter(c => c.pluginId !== pluginId);
        this.#uiContributions.set(slotId, contributions);
    }

    this.#loadedFrontendModules.delete(pluginId);
    this.#actionDisplayRenderers.delete(pluginId);
    this.#moduleLoadPromises.delete(pluginId);

    // Remove the plugin's stylesheet if it was injected
    const stylesheetId = `plugin-stylesheet-${pluginId}`;
    document.getElementById(stylesheetId)?.remove();

    if (wasUninstalled) {
      webSocketService.sendMessage({ type: WEBSOCKET_EVENTS.FINALIZE_UNINSTALL, payload: { pluginId } });
    }
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
        translationService: this.#translationService,
        pubsub,
      },
      uiComponents: {
        createCardElement, setIcon, updateButtonGroupActiveState, setElementVisibility,
        BasePluginGlobalSettingsComponent, GenericPluginActionSettingsComponent, ActionPluginUIManager,
      },
      shared: { constants, services: { actionDisplayUtils }, utils },
    };
  }

  private injectStylesheet(pluginId: string, manifest: PluginManifest): void {
    if (!manifest.hasFrontendStyle) {
      return;
    }

    const stylesheetId = `plugin-stylesheet-${pluginId}`;
    if (document.getElementById(stylesheetId)) return;
  
    const cssPath = `/plugins/${pluginId}/frontend/style.css?v=${manifest.version || Date.now()}`;
    console.log(`[PluginUIService] Injecting stylesheet for '${pluginId}' from: ${cssPath}`);
    
    const link = document.createElement('link');
    link.id = stylesheetId;
    link.rel = 'stylesheet';
    link.type = 'text/css';
    link.href = cssPath;
    
    link.onload = () => {
      console.log(`[PluginUIService] SUCCESS: Stylesheet for '${pluginId}' loaded successfully.`);
    };
    link.onerror = () => {
      console.error(`[PluginUIService] FAILED: Could not load stylesheet for '${pluginId}' at ${cssPath}. Check if the file exists and the server path is correct.`);
      link.remove();
    };

    document.head.appendChild(link);
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

    const loadPromise = (async () => {
        const scriptUrl = `/plugins/${pluginId}/${manifest.frontendEntry}?v=${manifest.version || Date.now()}`;
        try {
            await import(/* @vite-ignore */ scriptUrl);
            const module = window.GestureVisionPlugins[pluginId];
            if (module) {
                module.manifest = manifest;
                this.injectStylesheet(pluginId, manifest);
                if (typeof module.getActionDisplayDetails === 'function') this.#actionDisplayRenderers.set(pluginId, module.getActionDisplayDetails);
                if (typeof module.init === 'function') await module.init(this.getPluginUIContext(pluginId));
                this.#loadedFrontendModules.set(pluginId, module);
                return module;
            } else {
                throw new Error(`Plugin '${pluginId}' script loaded but did not register itself correctly.`);
            }
        } catch (e) {
            console.error(`Failed to load script for plugin '${pluginId}'.`, e);
            throw e;
        }
    })();
    
    this.#moduleLoadPromises.set(pluginId, loadPromise);
    
    try {
        return await loadPromise;
    } finally {
        this.#moduleLoadPromises.delete(pluginId);
    }
  }

  public getPluginManifest = (pluginId: string): PluginManifest | undefined => this.#pluginManifests.get(pluginId);
  public getAllPluginManifests = (): PluginManifest[] => Array.from(this.#pluginManifests.values());
  public getAvailableActionPlugins = (): PluginManifest[] => this.getAllPluginManifests().filter(m => m.capabilities.providesActions && m.status === 'enabled');
  public getPluginsWithGlobalSettings = (): PluginManifest[] => this.getAllPluginManifests().filter((m) => m.capabilities.hasGlobalSettings);
  public hasAnyPluginWithGlobalSettings = (): boolean => this.getPluginsWithGlobalSettings().length > 0;

  public async getGlobalSettingsComponentFactory(pluginId: string): Promise<FrontendPluginModule['createGlobalSettingsComponent'] | undefined> {
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