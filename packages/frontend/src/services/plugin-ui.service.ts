/* FILE: packages/frontend/src/services/plugin-ui.service.ts */
import type { AppStore } from '#frontend/core/state/app-store.js';
import type { CameraService } from '#frontend/services/camera.service.js';
import { UI_EVENTS, WEBSOCKET_EVENTS, pubsub } from '#shared/index.js';
import { webSocketService } from './websocket-service.js';
import type { PluginManifest, PluginTestConnectionResultPayload } from '#shared/index.js';
import type { FrontendPluginModule, ActionDisplayDetailsRendererFn, PluginUIContext } from '#frontend/types/index.js';
import type { TranslationService } from '#frontend/services/translation.service.js';
import type { GestureProcessor } from '#frontend/gestures/processor.js';
import * as constants from '#shared/index.js';
import * as actionDisplayUtils from '#frontend/ui/helpers/ui-helpers.js';
import * as sharedUtils from '#shared/utils/index.js';

const pluginModules = import.meta.glob('../../../../extensions/plugins/*/frontend/index.{js,ts,tsx}');
const ENTRY_FILE_CANDIDATES =['index.tsx', 'index.ts', 'index.jsx', 'index.js'];

export class PluginUIService {
  #pluginManifests = new Map<string, PluginManifest>();
  #loadedFrontendModules = new Map<string, FrontendPluginModule>();
  #actionDisplayRenderers = new Map<string, ActionDisplayDetailsRendererFn>();
  #moduleLoadPromises = new Map<string, Promise<FrontendPluginModule | undefined>>();
  #appStore: AppStore;
  #translationService: TranslationService;
  #cameraServiceRef: CameraService | null = null;
  #gestureProcessorRef: GestureProcessor | null = null;
  #unsubscribeStore: () => void;

  constructor(appStore: AppStore, translationService: TranslationService) {
    this.#appStore = appStore;
    this.#translationService = translationService;
    this.#unsubscribeStore = this.#appStore.subscribe((state, prevState) => {
      if (state.pluginManifests !== prevState.pluginManifests) {
        this.#handleManifestUpdate(state.pluginManifests).catch((e) => console.error(e));
      }
    });
  }

  public setDependencies(deps: { cameraService: CameraService; gestureProcessor: GestureProcessor }): void {
      this.#cameraServiceRef = deps.cameraService;
      this.#gestureProcessorRef = deps.gestureProcessor;
  }

  destroy() {
    this.#unsubscribeStore();
    this.#loadedFrontendModules.forEach(async (module, pluginId) => {
      try {
        await module.destroy?.();
      } catch (error) {
        console.error(`[PluginUIService] Error destroying module for plugin '${pluginId}':`, error);
      }
    });
    this.#loadedFrontendModules.clear();
  }

  async #handleManifestUpdate(manifests?: PluginManifest[]): Promise<void> {
    if (!manifests || !Array.isArray(manifests)) return;

    const oldManifestsMap = new Map(this.#pluginManifests);
    const newManifestsMap = new Map(manifests.map(m => [m.id, m]));
    
    this.#pluginManifests = newManifestsMap;
    this.#translationService.mergePluginTranslations(manifests);

    await this.#reconcilePluginComponents(newManifestsMap, oldManifestsMap);
    pubsub.publish(UI_EVENTS.PLUGINS_MANIFESTS_PROCESSED);
  }

  async #reconcilePluginComponents(newManifests: Map<string, PluginManifest>, oldManifests: Map<string, PluginManifest>): Promise<void> {
    const allIds = new Set([...newManifests.keys(), ...oldManifests.keys()]);

    for (const id of allIds) {
        const oldM = oldManifests.get(id);
        const newM = newManifests.get(id);

        if (oldM && !newM) {
            await this.#deregisterPlugin(id, true);
            this.#appStore.getState().actions.clearPluginExtData(id);
        } else if (!oldM && newM?.status === 'enabled') {
            await this.loadPluginFrontendModule(newM.id);
        } else if (oldM && newM) {
            if (oldM.status === 'enabled' && newM.status === 'disabled') await this.#deregisterPlugin(id, false);
            else if (oldM.status === 'disabled' && newM.status === 'enabled') {
                await this.#deregisterPlugin(id, false);
                await this.loadPluginFrontendModule(newM.id);
            }
        }
    }
  }

  async #deregisterPlugin(pluginId: string, wasUninstalled: boolean): Promise<void> {
    const loadedModule = this.#loadedFrontendModules.get(pluginId);
    
    if (loadedModule && typeof loadedModule.destroy === 'function') {
      try {
        await loadedModule.destroy();
      } catch (error) {
        console.error(`[PluginUIService] Error on destroying module for '${pluginId}':`, error);
      }
    }

    this.#loadedFrontendModules.delete(pluginId);
    this.#actionDisplayRenderers.delete(pluginId);
    this.#moduleLoadPromises.delete(pluginId);
    document.getElementById(`plugin-stylesheet-${pluginId}`)?.remove();

    if (wasUninstalled) webSocketService.sendMessage({ type: WEBSOCKET_EVENTS.FINALIZE_UNINSTALL, payload: { pluginId } });
  }

  public getLoadedModuleById = (pluginId: string): FrontendPluginModule | undefined => this.#loadedFrontendModules.get(pluginId);

  public getPluginUIContext(pluginId?: string): PluginUIContext {
    return {
      manifest: pluginId ? this.getPluginManifest(pluginId) : undefined,
      coreStateManager: this.#appStore,
      pluginUIService: this,
      cameraService: this.#cameraServiceRef || undefined,
      gesture: this.#gestureProcessorRef || undefined,
      webSocketService: webSocketService || undefined,
      requestCloseSettingsModal: () => this.#appStore.getState().actions.closeCurrentOverlay(),
      data: {},
      services: { translationService: this.#translationService, pubsub, },
      shared: { constants, services: { actionDisplayUtils }, utils: sharedUtils },
    };
  }

  private injectStylesheet(pluginId: string, manifest: PluginManifest): void {
    if (!manifest.hasFrontendStyle) return;
    
    const stylesheetId = `plugin-stylesheet-${pluginId}`;
    if (document.getElementById(stylesheetId)) return;
    
    // FIX: Accurately calculate the base path (resolves Ingress routing issues in HA)
    const basePath = window.location.pathname.replace(/\/index\.html$/, '').replace(/\/$/, '');
    
    const link = Object.assign(document.createElement('link'), {
        id: stylesheetId, rel: 'stylesheet', type: 'text/css',
        href: `${basePath}/plugins/${pluginId}/frontend/style.css?v=${manifest.version || Date.now()}`,
        onerror: () => link.remove()
    });
    
    document.head.appendChild(link);
  }

  public loadPluginFrontendModule(pluginId: string): Promise<FrontendPluginModule | undefined> {
    if (this.#loadedFrontendModules.has(pluginId)) return Promise.resolve(this.#loadedFrontendModules.get(pluginId));
    if (this.#moduleLoadPromises.has(pluginId)) return this.#moduleLoadPromises.get(pluginId)!;

    const manifest = this.getPluginManifest(pluginId);
    if (!manifest?.frontendEntry) return Promise.resolve(undefined);

    // 1. Try finding via Glob first (build-time index)
    const modulePath = Object.keys(pluginModules).find(p => p.includes(`/${pluginId}/frontend/index.`));

    const loadPromise = (async () => {
        let module: FrontendPluginModule | undefined;
        
        if (modulePath) {
             const loaded = await pluginModules[modulePath]() as { default: FrontendPluginModule };
             module = loaded.default;
        } else {
             // 2. Fallback: Dynamic import for runtime-added plugins
             if (import.meta.env.DEV) {
                 for (const ext of ENTRY_FILE_CANDIDATES) {
                     try {
                         const devPath = `/@fs/app/extensions/plugins/${pluginId}/frontend/${ext}?t=${Date.now()}`;
                         const loaded = await import(/* @vite-ignore */ devPath);
                         module = loaded.default;
                         if (module) break;
                     } catch (_e) {
                         // Ignored
                     }
                 }
                 if (!module) {
                     console.error(`[PluginUIService] Failed to load plugin '${pluginId}' via Vite FS.`);
                 }
             } else {
                 // PROD MODE: Expect a standard built file served by Nginx
                 try {
                    // FIX: Ensure absolute path relative to current URL so it doesn't fail under chunks
                    const basePath = window.location.pathname.replace(/\/index\.html$/, '').replace(/\/$/, '');
                    const importPath = `${basePath}/plugins/${pluginId}/frontend/index.js?t=${Date.now()}`;
                    const loaded = await import(/* @vite-ignore */ importPath);
                    module = loaded.default;
                 } catch (e) {
                     console.error(`[PluginUIService] Production import failed for '${pluginId}'.`, e);
                 }
             }
        }

        if (!module) {
             this.#moduleLoadPromises.delete(pluginId);
             return undefined; 
        }

        this.injectStylesheet(pluginId, manifest);

        if (typeof module.getActionDisplayDetails === 'function') {
            this.#actionDisplayRenderers.set(pluginId, module.getActionDisplayDetails);
            pubsub.publish(UI_EVENTS.PLUGIN_RENDERERS_UPDATED, { pluginId });
        }

        const cleanup = await module.init?.(this.getPluginUIContext(pluginId));
        if (typeof cleanup === 'function') {
            module.destroy = cleanup;
        }

        this.#loadedFrontendModules.set(pluginId, module);
        return module;
    })().catch(e => {
        console.error(`Failed to load module for plugin '${pluginId}'.`, e);
        this.#moduleLoadPromises.delete(pluginId);
        throw e;
    });

    this.#moduleLoadPromises.set(pluginId, loadPromise);
    loadPromise.finally(() => this.#moduleLoadPromises.delete(pluginId));
    return loadPromise;
  }

  public getPluginManifest = (pluginId: string): PluginManifest | undefined => this.#pluginManifests.get(pluginId);
  public getActionDisplayDetailsRenderer = (pluginId: string): ActionDisplayDetailsRendererFn | undefined => this.#actionDisplayRenderers.get(pluginId);

  public async savePluginGlobalConfig(pluginId: string, config: unknown): Promise<{ success: boolean; message?: string; config?: unknown; validationErrors?: unknown; }> {
    if (!this.#pluginManifests.has(pluginId)) return { success: false, message: `Plugin '${pluginId}' not registered.` };
    return webSocketService.request('PATCH_PLUGIN_GLOBAL_CONFIG', { pluginId, config });
  }

  public async sendPluginTestConnectionRequest(pluginId: string, configToTest: unknown): Promise<PluginTestConnectionResultPayload | null> {
    if (!this.#pluginManifests.has(pluginId)) return { pluginId, success: false, messageKey: 'pluginNotRegistered', error: { message: `Plugin '${pluginId}' not found.` } };
    try {
      const response = await fetch(`api/plugins/${pluginId}/test`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(configToTest), });
      return response.json() as Promise<PluginTestConnectionResultPayload>;
    } catch (error) {
      return { pluginId, success: false, messageKey: 'TEST_FAILED', error: { message: (error as Error).message } };
    }
  }
}