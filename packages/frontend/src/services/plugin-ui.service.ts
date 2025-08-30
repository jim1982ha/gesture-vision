/* FILE: packages/frontend/src/services/plugin-ui.service.ts */
import type { AppStore } from '#frontend/core/state/app-store.js';
import type { CameraService } from '#frontend/services/camera.service.js';
import { UI_EVENTS, pubsub } from '#shared/index.js';
import { webSocketService } from './websocket-service.js';
import { translate } from '#shared/services/translations.js';
import { createSearchableDropdown } from '#frontend/ui/components/searchable-dropdown.js';
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
} from '#frontend/types/index.js';
import type { TranslationService } from './translation.service.js';
import type { UIController } from '#frontend/ui/ui-controller-core.js';
import type { GestureProcessor } from '#frontend/gestures/processor.js';
import * as constants from '#shared/index.js';
import * as actionDisplayUtils from '#frontend/ui/helpers/display-helpers.js';
import * as utils from '#shared/utils/index.js';
import { ActionPluginUIManager } from '#frontend/ui/components/gesture-form/action-plugin-ui-manager.js';

export class PluginUIService {
  #pluginManifests = new Map<string, PluginManifest>();
  #loadedFrontendModules = new Map<string, FrontendPluginModule>();
  #actionDisplayRenderers = new Map<string, ActionDisplayDetailsRendererFn>();
  #moduleLoadPromises = new Map<
    string,
    Promise<FrontendPluginModule | undefined>
  >();
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
  #manifestUpdateDebounceTimer: number | null = null;

  constructor(
    appStore: AppStore,
    translationService: TranslationService
  ) {
    this.#appStore = appStore;
    this.#translationService = translationService;

    this.#unsubscribeStore = this.#appStore.subscribe((state) =>
      this.#debounceManifestUpdate(state.pluginManifests)
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
  }

  #debounceManifestUpdate(manifests?: PluginManifest[]): void {
    if (this.#manifestUpdateDebounceTimer) {
      clearTimeout(this.#manifestUpdateDebounceTimer);
    }
    this.#manifestUpdateDebounceTimer = window.setTimeout(() => {
      this.#handleManifestUpdate(manifests).catch((e) => console.error(e));
    }, 100);
  }

  async #handleManifestUpdate(manifests?: PluginManifest[]): Promise<void> {
    if (!manifests || !Array.isArray(manifests)) return;

    const oldManifestsMap = new Map(this.#pluginManifests);
    const newManifestsMap = new Map(manifests.map((m) => [m.id, m]));
    this.#pluginManifests = newManifestsMap;

    this.#translationService.mergePluginTranslations(manifests);

    const addedPlugins = manifests.filter(
      (m) => !oldManifestsMap.has(m.id) && m.status === 'enabled'
    );
    const removedPlugins = Array.from(oldManifestsMap.values()).filter(
      (m) => !newManifestsMap.has(m.id)
    );
    const statusChangedPlugins = manifests.filter((m) => {
      const oldM = oldManifestsMap.get(m.id);
      return oldM && oldM.status !== m.status;
    });

    const pluginsToDeregister = [
      ...removedPlugins,
      ...statusChangedPlugins.filter((m) => m.status === 'disabled'),
    ];
    const pluginsToInitialize = [
      ...addedPlugins,
      ...statusChangedPlugins.filter((m) => m.status === 'enabled'),
    ];

    if (pluginsToDeregister.length > 0 || pluginsToInitialize.length > 0) {
      this.#uiControllerRef?.applyTranslations();
    }

    if (pluginsToDeregister.length > 0) {
      pluginsToDeregister.forEach((p) => this.#deregisterPluginUI(p.id));
    }

    if (pluginsToInitialize.length > 0) {
      await this.#initializePlugins(pluginsToInitialize.map((p) => p.id));
    }
    
    // Signal that manifests are processed and UI can render things depending on them
    pubsub.publish(UI_EVENTS.PLUGINS_MANIFESTS_PROCESSED);
  }

  #deregisterPluginUI(pluginId: string): void {
    const moduleToDestroy = this.#loadedFrontendModules.get(pluginId);
    if (moduleToDestroy && typeof moduleToDestroy.destroy === 'function') {
      try {
        moduleToDestroy.destroy();
      } catch (e) {
        console.error(
          `[PluginUIService] Error destroying frontend module for '${pluginId}':`,
          e
        );
      }
    }

    for (const slotId of this.#uiContributions.keys()) {
      const contributions = this.#uiContributions.get(slotId) || [];
      this.#uiContributions.set(
        slotId,
        contributions.filter((c) => {
          if (c.pluginId === pluginId) {
            c.element.remove();
            return false;
          }
          return true;
        })
      );
    }
    const existingLink = document.head.querySelector<HTMLLinkElement>(
      `link[data-plugin-id="${pluginId}"]`
    );
    if (existingLink) existingLink.remove();

    this.#loadedFrontendModules.delete(pluginId);
    this.#actionDisplayRenderers.delete(pluginId);
    this.#moduleLoadPromises.delete(pluginId);
    pubsub.publish(UI_EVENTS.RECEIVE_UI_CONTRIBUTION, {
      removedPluginId: pluginId,
    });
  }
  
  async #initializePlugins(pluginIds: string[]): Promise<void> {
    if (pluginIds.length === 0) return;
    const initPromises = pluginIds.map((id) =>
      this.loadPluginFrontendModule(id).catch((err) => {
        console.error(
          `[PluginUIService] Failed to load module for plugin ${id}:`,
          err
        );
        return undefined;
      })
    );
    await Promise.all(initPromises);
    pubsub.publish(UI_EVENTS.RECEIVE_UI_CONTRIBUTION, { pluginIds });
  }

  public setCameraService(cameraService: CameraService | null): void {
    this.#cameraServiceRef = cameraService;
  }
  
  public getLoadedModuleById(pluginId: string): FrontendPluginModule | undefined {
    return this.#loadedFrontendModules.get(pluginId);
  }

  public getPluginUIContext(pluginId?: string): PluginUIContext {
    return {
      manifest: pluginId ? this.getPluginManifest(pluginId) : undefined,
      coreStateManager: this.#appStore,
      pluginUIService: this,
      cameraService: this.#cameraServiceRef || undefined,
      gesture: this.#gestureProcessorRef || undefined,
      webSocketService: webSocketService || undefined,
      requestCloseSettingsModal: () =>
        this.#uiControllerRef?.modalManager?.closeSettingsModal(),
      globalSettingsModalManager:
        this.#uiControllerRef?._globalSettingsForm || undefined,
      uiController: this.#uiControllerRef || undefined,
      data: {},
      services: {
        translate: translate as (
          key: string,
          substitutions?: Record<string, unknown> | undefined
        ) => string,
        pubsub,
      },
      uiComponents: {
        createCardElement,
        createSearchableDropdown,
        setIcon,
        updateButtonGroupActiveState,
        BasePluginGlobalSettingsComponent,
        GenericPluginActionSettingsComponent,
        ActionPluginUIManager,
      },
      shared: {
        constants,
        services: {
          actionDisplayUtils,
        },
        utils,
      },
    };
  }

  public async loadPluginFrontendModule(
    pluginId: string
  ): Promise<FrontendPluginModule | undefined> {
    if (this.#loadedFrontendModules.has(pluginId))
      return this.#loadedFrontendModules.get(pluginId);
    if (this.#moduleLoadPromises.has(pluginId))
      return this.#moduleLoadPromises.get(pluginId)!;

    const manifest = this.getPluginManifest(pluginId);
    if (!manifest) return undefined;

    if (manifest.frontendStyle) {
      const existingLink = document.head.querySelector<HTMLLinkElement>(
        `link[data-plugin-id="${pluginId}"]`
      );
      if (!existingLink) {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.type = 'text/css';
        link.href = `/api/plugins/assets/${pluginId}/${manifest.frontendStyle}`;
        link.dataset.pluginId = pluginId;
        document.head.appendChild(link);
      }
    }

    if (!manifest.frontendEntry) return undefined;
    const moduleUrl = `/api/plugins/assets/${pluginId}/${manifest.frontendEntry}`;
    const loadPromise = (async () => {
      try {
        const module = (await import(/* @vite-ignore */ moduleUrl))
          .default as FrontendPluginModule;
        module.manifest = manifest;
        if (typeof module.getActionDisplayDetails === 'function')
          this.#actionDisplayRenderers.set(
            pluginId,
            module.getActionDisplayDetails
          );
        if (typeof module.init === 'function')
          await module.init(this.getPluginUIContext(pluginId));
        this.#loadedFrontendModules.set(pluginId, module);
        return module;
      } catch (error) {
        console.error(
          `[PluginUIService] Error loading module for '${pluginId}':`,
          error
        );
        return undefined;
      } finally {
        this.#moduleLoadPromises.delete(pluginId);
      }
    })();
    this.#moduleLoadPromises.set(pluginId, loadPromise);
    return loadPromise;
  }

  public getPluginManifest = (pluginId: string): PluginManifest | undefined =>
    this.#pluginManifests.get(pluginId);
  public getAllPluginManifests = (): PluginManifest[] =>
    Array.from(this.#pluginManifests.values());
  public getAvailableActionPlugins = (): PluginManifest[] =>
    this.getAllPluginManifests().filter(
      (m) => m.capabilities.providesActions && m.status === 'enabled'
    );
  public getPluginsWithGlobalSettings = (): PluginManifest[] =>
    this.getAllPluginManifests().filter((m) => m.capabilities.hasGlobalSettings);
  public hasAnyPluginWithGlobalSettings = (): boolean =>
    this.getPluginsWithGlobalSettings().length > 0;

  public async getGlobalSettingsComponentFactory(
    pluginId: string
  ): Promise<CreatePluginGlobalSettingsComponentFn | undefined> {
    const module = await this.loadPluginFrontendModule(pluginId);
    return module?.createGlobalSettingsComponent;
  }

  public async createActionSettingsComponent(
    pluginId: string,
    currentSettings: Record<string, unknown> | null
  ): Promise<IPluginActionSettingsComponent | null> {
    const module = await this.loadPluginFrontendModule(pluginId);
    if (!module?.actionSettingsFields) return null;

    const context = this.getPluginUIContext(pluginId);
    const component = new GenericPluginActionSettingsComponent(
      pluginId,
      module.actionSettingsFields,
      context
    );
    component.render(currentSettings);
    return component;
  }

  public getActionDisplayDetailsRenderer = (
    pluginId: string
  ): ActionDisplayDetailsRendererFn | undefined =>
    this.#actionDisplayRenderers.get(pluginId);

  public async getPluginGlobalConfig(
    pluginId: string
  ): Promise<unknown | null> {
    const cachedConfig = this.#appStore
      .getState()
      .pluginGlobalConfigs.get(pluginId);
    if (cachedConfig !== undefined) return cachedConfig;

    webSocketService.request('GET_PLUGIN_GLOBAL_CONFIG', { pluginId });
    return undefined;
  }

  public async savePluginGlobalConfig(
    pluginId: string,
    config: unknown
  ): Promise<{
    success: boolean;
    message?: string;
    config?: unknown;
    validationErrors?: unknown;
  }> {
    if (!this.#pluginManifests.has(pluginId))
      return {
        success: false,
        message: `Plugin '${pluginId}' not registered.`,
      };
    return webSocketService.request('PATCH_PLUGIN_GLOBAL_CONFIG', {
      pluginId,
      config,
    });
  }

  public async sendPluginTestConnectionRequest(
    pluginId: string,
    configToTest: unknown
  ): Promise<PluginTestConnectionResultPayload | null> {
    if (!this.#pluginManifests.has(pluginId))
      return {
        pluginId,
        success: false,
        messageKey: 'pluginNotRegistered',
        error: { message: `Plugin '${pluginId}' not found.` },
      };
    try {
      const response = await fetch(`/api/plugins/${pluginId}/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(configToTest),
      });
      return response.json() as Promise<PluginTestConnectionResultPayload>;
    } catch (error) {
      return {
        pluginId,
        success: false,
        messageKey: 'TEST_FAILED',
        error: { message: (error as Error).message },
      };
    }
  }

  public registerContribution(
    slotId: string,
    element: HTMLElement,
    pluginId: string
  ): void {
    if (!this.#uiContributions.has(slotId))
      this.#uiContributions.set(slotId, []);
    this.#uiContributions.get(slotId)!.push({ element, pluginId });
  }
  public getContributionsForSlot = (slotId: string): HTMLElement[] =>
    (this.#uiContributions.get(slotId) || []).map((c) => c.element);
}