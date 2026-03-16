/* FILE: packages/backend/src/services/plugin-manager.service.ts */
import { watchFile, unwatchFile, watch, type FSWatcher, type StatWatcher } from 'fs';
import path from 'path';
import type { ZodType } from 'zod';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import { BaseBackendPlugin } from '#backend/plugins/base-backend.plugin.js';
import { pubsub, BACKEND_INTERNAL_EVENTS, type PluginManifest, type SectionValidationResult, type ValidationErrorDetail } from '#shared/index.js';
import { type ConfigRepository } from './config/config.repository.js';
import { PluginLoaderService } from './plugin-loader.service.js';
import type { BackendPlugin, BackendPluginContext } from '#backend/types/index.js';

const execAsync = promisify(exec);
const PLUGINS_DIR = '/app/extensions/plugins';
const NGINX_PLUGIN_WEBROOT = '/usr/share/nginx/html/plugins';
const HA_PLUGIN_ID = 'gesture-vision-plugin-home-assistant';

interface LoadedPlugin {
  manifest: PluginManifest;
  instance: BackendPlugin;
  globalConfig: unknown | null;
  configPath: string | null;
  _configWatcher?: StatWatcher | null;
}

/**
 * Manages the lifecycle, state, and configuration of all plugins.
 * Delegates discovery/loading to PluginLoaderService.
 */
export class PluginManagerService {
  #plugins = new Map<string, LoadedPlugin>();
  #disabledPluginIds = new Set<string>();
  #pluginsPendingDeletion = new Set<string>();
  #configRepository: ConfigRepository;
  #loaderService: PluginLoaderService;
  #initializationPromise: Promise<void>;
  #pluginsDirWatcher: FSWatcher | null = null;
  #resyncDebounceTimer: NodeJS.Timeout | null = null;
  #isHaAddonEnvironment = false;

  constructor(configRepository: ConfigRepository) {
    this.#configRepository = configRepository;
    this.#loaderService = new PluginLoaderService();
    this.#isHaAddonEnvironment = !!process.env.SUPERVISOR_TOKEN;
    this.#initializationPromise = this._initialize();
  }

  public waitUntilInitialized(): Promise<void> { return this.#initializationPromise; }

  private async _initialize(): Promise<void> {
    this.#disabledPluginIds = await this.#loaderService.loadDisabledPluginIds();
    const manifests = await this.#loaderService.discoverPlugins();
    await Promise.all(manifests.map(m => this.#loadAndRegisterPlugin(m)));
    this.#initializePluginsDirWatcher();
  }

  #triggerResync(): void {
    if (this.#resyncDebounceTimer) clearTimeout(this.#resyncDebounceTimer);
    this.#resyncDebounceTimer = setTimeout(() => {
      console.log(`[PluginManager Watcher] Filesystem change detected. Resyncing...`);
      this.#resyncPlugins().catch(err => console.error("[PluginManager] Error during plugin resync:", err));
    }, 500);
  }

  #initializePluginsDirWatcher(): void {
    try {
      this.#pluginsDirWatcher = watch(PLUGINS_DIR, { recursive: true, persistent: false }, (eventType, filename) => {
        if (!filename) return;
        this.#triggerResync();
      });
      this.#pluginsDirWatcher.on('error', (err) => console.error("[PluginManager] Directory watcher error:", err));
    } catch (error) {
      console.error("[PluginManager] Failed to initialize plugins directory watcher:", error);
    }
  }

  async #resyncPlugins(): Promise<void> {
    const previousPluginIds = new Set(this.#plugins.keys());
    this.#disabledPluginIds = await this.#loaderService.loadDisabledPluginIds();
    
    const manifestsOnDisk = await this.#loaderService.discoverPlugins();
    const currentPluginIdsOnDisk = new Set(manifestsOnDisk.map(m => m.id));

    for (const pluginId of previousPluginIds) {
      if (!currentPluginIdsOnDisk.has(pluginId)) {
        await this.#unloadAndDeregisterPlugin(pluginId);
      }
    }

    await Promise.all(manifestsOnDisk.map(async manifest => {
      const existingPlugin = this.#plugins.get(manifest.id);
      const newStatus = this.#disabledPluginIds.has(manifest.id) ? 'disabled' : 'enabled';
      
      if (!existingPlugin || existingPlugin.manifest.status !== newStatus) {
        await this.#unloadAndDeregisterPlugin(manifest.id);
        await this.#loadAndRegisterPlugin(manifest);
      }
    }));
    
    console.log('[PluginManager Watcher] Resync complete.');
    pubsub.publish(BACKEND_INTERNAL_EVENTS.REQUEST_MANIFESTS_BROADCAST);
  }

  async #copyPluginAssetsToWebroot(pluginId: string): Promise<void> {
    const sourceDir = path.join(PLUGINS_DIR, pluginId);
    const destDir = path.join(NGINX_PLUGIN_WEBROOT, pluginId);

    try {
      // FIX: Check parent directories instead of exact target to avoid ENOENT errors on non-existent targets
      const realSourceParent = await fs.realpath(PLUGINS_DIR).catch(() => PLUGINS_DIR);
      const realDestParent = await fs.realpath(NGINX_PLUGIN_WEBROOT).catch(() => NGINX_PLUGIN_WEBROOT);

      if (realSourceParent === realDestParent) {
        // Source and destination point to the same persistence volume (symlinked)
        return;
      }
      await fs.cp(sourceDir, destDir, { recursive: true });
    } catch (error) {
      console.error(`[PluginManager] Failed to copy assets for plugin '${pluginId}':`, error);
    }
  }

  async #removePluginAssetsFromWebroot(pluginId: string): Promise<void> {
    const destDir = path.join(NGINX_PLUGIN_WEBROOT, pluginId);
    
    try {
      const realSourceParent = await fs.realpath(PLUGINS_DIR).catch(() => PLUGINS_DIR);
      const realDestParent = await fs.realpath(NGINX_PLUGIN_WEBROOT).catch(() => NGINX_PLUGIN_WEBROOT);

      if (realSourceParent === realDestParent) {
        return;
      }
      await fs.rm(destDir, { recursive: true, force: true });
    } catch (error) {
      console.warn(`[PluginManager] Could not remove assets for plugin '${pluginId}' (this is often normal):`, error);
    }
  }

  async #loadAndRegisterPlugin(manifest: PluginManifest): Promise<void> {
    if (this.#plugins.has(manifest.id)) {
      return;
    }

    if (this.#isHaAddonEnvironment && manifest.id === HA_PLUGIN_ID) {
        if (this.#disabledPluginIds.has(manifest.id)) {
            console.log(`[PluginManager] Forcing enabling of ${HA_PLUGIN_ID} in HA environment.`);
            this.#disabledPluginIds.delete(manifest.id);
            await this.#loaderService.saveDisabledPluginIds(this.#disabledPluginIds);
        }
    }

    manifest.status = this.#disabledPluginIds.has(manifest.id) ? 'disabled' : 'enabled';
    
    if (manifest.status === 'disabled') {
      this.#plugins.set(manifest.id, { manifest, instance: new BaseBackendPlugin(manifest), globalConfig: null, configPath: null });
      return;
    }

    let instance: BackendPlugin;
    try {
      const backendEntryPath = manifest.backendEntry ? path.resolve(PLUGINS_DIR, manifest.id, manifest.backendEntry.replace('.js', '.ts')) : null;
      if (backendEntryPath) {
        const module = await import(`file://${backendEntryPath}?v=${Date.now()}`);
        instance = new module.default();
        instance.manifest = manifest;
      } else {
        instance = new BaseBackendPlugin(manifest);
      }
    } catch (e) {
      console.error(`[PluginManager] Could not load backend module for ${manifest.id}:`, e);
      return;
    }

    const configPath = manifest.capabilities.hasGlobalSettings && manifest.globalConfigFileName ? path.join(PLUGINS_DIR, manifest.id, manifest.globalConfigFileName) : null;
    let globalConfig: unknown = null;
    if (configPath) {
      globalConfig = await this.#configRepository.readPluginConfigFile(configPath, instance.getGlobalConfigValidationSchema?.() as ZodType | undefined);
    }

    this.#plugins.set(manifest.id, { manifest, instance, globalConfig, configPath });

    if (configPath) this.#startWatchingPluginConfig(manifest.id, configPath);
    
    const context: BackendPluginContext = {
      getPluginGlobalConfig: <T>() => this.getPluginGlobalConfig<T>(manifest.id),
    };

    await instance.init?.(context);
    console.log(`[PluginManager] Loaded plugin: ${manifest.id}`);
  }

  #startWatchingPluginConfig(pluginId: string, configPath: string): void {
    const plugin = this.#plugins.get(pluginId);
    if (!plugin) return;
    const listener = () => this.#reloadPluginConfig(pluginId, configPath);
    plugin._configWatcher = watchFile(configPath, { interval: 2000 }, listener);
  }

  async #reloadPluginConfig(pluginId: string, configPath: string) {
    const plugin = this.#plugins.get(pluginId);
    if (!plugin) return;

    try {
      const schema = plugin.instance.getGlobalConfigValidationSchema?.();
      const newConfig = await this.#configRepository.readPluginConfigFile(configPath, schema as ZodType | undefined);
      
      if (JSON.stringify(plugin.globalConfig) !== JSON.stringify(newConfig)) {
        plugin.globalConfig = newConfig;
        await plugin.instance.onGlobalConfigUpdate?.(newConfig);
        pubsub.publish(BACKEND_INTERNAL_EVENTS.PLUGIN_GLOBAL_CONFIG_CHANGED_ON_BACKEND, { pluginId, newConfig });
      }
    } catch (e) { console.error(`[PluginManager] Error reloading config for '${pluginId}':`, e); }
  }

  async #unloadAndDeregisterPlugin(pluginId: string): Promise<void> {
    const plugin = this.#plugins.get(pluginId);
    if (!plugin) return;
    if (plugin._configWatcher && plugin.configPath) unwatchFile(plugin.configPath);
    await plugin.instance.destroy?.();
    this.#plugins.delete(pluginId);
  }

  public async getAllPluginManifestsWithCapabilities(): Promise<PluginManifest[]> {
    await this.#initializationPromise;
    const manifests = Array.from(this.#plugins.values())
      .filter(p => !this.#pluginsPendingDeletion.has(p.manifest.id))
      .map((p) => {
          const manifest = { ...p.manifest };
          if (this.#isHaAddonEnvironment && manifest.id === HA_PLUGIN_ID) {
              manifest.locked = true;
          }
          return manifest;
      });
    
    for (const manifest of manifests) {
      manifest.locales = await this.#loaderService.getPluginLocales(manifest.id);
    }
    return manifests;
  }

  public getAllPluginManifestsSync(): PluginManifest[] {
    return Array.from(this.#plugins.values()).map((p) => p.manifest);
  }

  public getPlugin = (id: string): LoadedPlugin | undefined => this.#plugins.get(id);
  public getPluginInstance = (id: string): BackendPlugin | undefined => this.#plugins.get(id)?.instance;
  public getPluginManifest = (id: string): PluginManifest | undefined => this.#plugins.get(id)?.manifest;

  public async getPluginGlobalConfig<T>(pluginId: string): Promise<T | null> {
    const plugin = this.#plugins.get(pluginId);
    return plugin?.globalConfig as T | null;
  }

  public async savePluginGlobalConfig(pluginId: string, newConfig: unknown): Promise<{ success: boolean; message?: string; validationErrors?: SectionValidationResult; }> {
    const plugin = this.#plugins.get(pluginId);
    if (!plugin || !plugin.configPath || !plugin.manifest.capabilities.hasGlobalSettings) {
      return { success: false, message: `Plugin '${pluginId}' not found or does not support global settings.` };
    }

    const schema = plugin.instance.getGlobalConfigValidationSchema?.();
    if (schema) {
      const result = schema.safeParse(newConfig);
      if (!result.success) {
        const errors: ValidationErrorDetail[] = result.error.issues.map(e => ({ field: e.path.join('.'), messageKey: e.message, details: { code: e.code } }));
        return { success: false, message: 'Validation failed.', validationErrors: { isValid: false, errors } };
      }
    }

    const success = await this.#configRepository.writePluginConfigFile(plugin.configPath, newConfig, schema as ZodType | undefined);
    if (success) {
      plugin.globalConfig = newConfig;
      return { success: true, message: `Plugin '${pluginId}' config saved.` };
    }
    return { success: false, message: `Failed to write config for '${pluginId}'.` };
  }

  public async installPlugin(repoUrl: string): Promise<{success:boolean; message:string}> {
    const pluginId = path.basename(repoUrl, '.git');
    const targetDir = path.join(PLUGINS_DIR, pluginId);

    try { await fs.access(targetDir); return { success: false, message: `Plugin '${pluginId}' already exists.` }; } catch { /* Continue */ }

    try {
      await execAsync(`git clone --depth 1 ${repoUrl} ${targetDir}`);
      
      await this.#copyPluginAssetsToWebroot(pluginId);

      const manifestPath = path.join(targetDir, 'plugin.json');
      const manifestContent = await fs.readFile(manifestPath, 'utf-8');
      const manifest: PluginManifest = JSON.parse(manifestContent);
      
      manifest.id = pluginId;
      
      await this.#loadAndRegisterPlugin(manifest);
      pubsub.publish(BACKEND_INTERNAL_EVENTS.REQUEST_MANIFESTS_BROADCAST);
      
      return { success: true, message: `Plugin '${pluginId}' installed successfully.` };
    } catch (e) {
      console.error(`[PluginManager] Failed to install plugin from ${repoUrl}:`, e);
      await fs.rm(targetDir, { recursive: true, force: true }).catch(() => { /* No-op */ });
      return { success: false, message: `Failed to install plugin: ${(e as Error).message}` };
    }
  }

  public async initiatePluginUninstall(pluginId: string): Promise<{success: boolean, message: string}> {
    if (this.#isHaAddonEnvironment && pluginId === HA_PLUGIN_ID) {
        return { success: false, message: `Uninstalling '${pluginId}' is restricted in Home Assistant Add-on mode.` };
    }
    if (!this.#plugins.has(pluginId)) {
        return { success: false, message: `Plugin '${pluginId}' not found.` };
    }

    this.#pluginsPendingDeletion.add(pluginId);
    pubsub.publish(BACKEND_INTERNAL_EVENTS.REQUEST_MANIFESTS_BROADCAST);

    setTimeout(() => {
        if (this.#pluginsPendingDeletion.has(pluginId)) {
            console.warn(`[PluginManager] Finalize uninstall for '${pluginId}' not triggered by frontend within 5s. Forcing cleanup.`);
            this.finalizePluginUninstall(pluginId);
        }
    }, 5000).unref();

    return { success: true, message: `Uninstall initiated for '${pluginId}'.` };
  }

  public async finalizePluginUninstall(pluginId: string): Promise<{success: boolean, message: string}> {
      if (this.#isHaAddonEnvironment && pluginId === HA_PLUGIN_ID) {
          return { success: false, message: "Cannot uninstall system-managed plugin." };
      }
      
      // Unload first
      await this.#unloadAndDeregisterPlugin(pluginId);
      const result = await this._performPluginDeletion(pluginId);
      
      this.#pluginsPendingDeletion.delete(pluginId);
      pubsub.publish(BACKEND_INTERNAL_EVENTS.REQUEST_MANIFESTS_BROADCAST);
      return result;
  }

  private async _performPluginDeletion(pluginId: string): Promise<{success:boolean; message:string}> {
    const pluginDir = path.join(PLUGINS_DIR, pluginId);

    try {
      await fs.access(pluginDir);
      await this.#removePluginAssetsFromWebroot(pluginId);
      await fs.rm(pluginDir, { recursive: true, force: true });
      
      if (this.#disabledPluginIds.has(pluginId)) {
        this.#disabledPluginIds.delete(pluginId);
        await this.#loaderService.saveDisabledPluginIds(this.#disabledPluginIds);
      }
      return { success: true, message: `Plugin '${pluginId}' uninstalled successfully.` };
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') {
        return { success: true, message: `Plugin '${pluginId}' already removed.` };
      }
      return { success: false, message: `Failed to perform plugin deletion: ${(e as Error).message}` };
    }
  }

  public async setPluginState(pluginId: string, state: 'enabled' | 'disabled'): Promise<{success:boolean; message:string}> {
    if (this.#isHaAddonEnvironment && pluginId === HA_PLUGIN_ID && state === 'disabled') {
        return { success: false, message: `Disabling '${pluginId}' is restricted in Home Assistant Add-on mode.` };
    }

    if (!this.#plugins.has(pluginId)) return { success: false, message: `Plugin '${pluginId}' not found.` };

    if (state === 'enabled') {
      this.#disabledPluginIds.delete(pluginId);
      await this.#copyPluginAssetsToWebroot(pluginId);
    } else {
      this.#disabledPluginIds.add(pluginId);
      await this.#removePluginAssetsFromWebroot(pluginId);
    }

    await this.#loaderService.saveDisabledPluginIds(this.#disabledPluginIds);
    
    // FIX: Fully reload the plugin to swap the base dummy instance for the real script instance
    await this.#unloadAndDeregisterPlugin(pluginId);
    
    const manifestsOnDisk = await this.#loaderService.discoverPlugins();
    const manifestToLoad = manifestsOnDisk.find(m => m.id === pluginId);
    if (manifestToLoad) {
        await this.#loadAndRegisterPlugin(manifestToLoad);
    }

    pubsub.publish(BACKEND_INTERNAL_EVENTS.REQUEST_MANIFESTS_BROADCAST);
    return { success: true, message: `Plugin '${pluginId}' has been ${state}.` };
  }

  public async destroy(): Promise<void> {
    if (this.#pluginsDirWatcher) {
      this.#pluginsDirWatcher.close();
      this.#pluginsDirWatcher = null;
    }
    if (this.#resyncDebounceTimer) {
        clearTimeout(this.#resyncDebounceTimer);
    }
    await Promise.all(Array.from(this.#plugins.keys()).map(id => this.#unloadAndDeregisterPlugin(id)));
  }
}