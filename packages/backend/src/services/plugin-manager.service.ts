/* FILE: packages/backend/src/services/plugin-manager.service.ts */
import { watchFile, unwatchFile, type StatWatcher } from 'fs';
import path from 'path';
import type { Router } from 'express';
import type { ZodType } from 'zod';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';

import { BaseBackendPlugin } from '#backend/plugins/base-backend.plugin.js';
import { pubsub, BACKEND_INTERNAL_EVENTS, type PluginManifest, type SectionValidationResult, type ValidationErrorDetail } from '#shared/index.js';
import type { ConfigRepository } from './config/config-repository.js';
import { connectToCompanion } from '../utils/companion-connector.js';
import { PluginLoaderService } from './plugin-loader.service.js';

import type { BackendPlugin, BackendPluginContext } from '#backend/types/index.js';

const execAsync = promisify(exec);
const PLUGINS_DIR = '/app/extensions/plugins';

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
  #configRepository: ConfigRepository;
  #loaderService: PluginLoaderService;
  #initializationPromise: Promise<void>;

  constructor(configRepository: ConfigRepository) {
    this.#configRepository = configRepository;
    this.#loaderService = new PluginLoaderService();
    this.#initializationPromise = this._initialize();
  }

  public waitUntilInitialized(): Promise<void> { return this.#initializationPromise; }

  private async _initialize(): Promise<void> {
    this.#disabledPluginIds = await this.#loaderService.loadDisabledPluginIds();
    const manifests = await this.#loaderService.discoverPlugins();
    await Promise.all(manifests.map(m => this.#loadAndRegisterPlugin(m)));
  }

  async #loadAndRegisterPlugin(manifest: PluginManifest): Promise<void> {
    if (this.#plugins.has(manifest.id)) {
      console.warn(`[PluginManager] Duplicate plugin ID '${manifest.id}'. Skipping.`);
      return;
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
      connectToCompanion,
    };
    await instance.init?.(context);
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
    console.log(`[PluginManager] Config change detected for '${pluginId}'. Reloading...`);
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

  async getAllPluginManifestsWithCapabilities(): Promise<PluginManifest[]> {
    await this.#initializationPromise;
    const manifests = Array.from(this.#plugins.values()).map((p) => p.manifest);
    for (const manifest of manifests) {
      manifest.locales = await this.#loaderService.getPluginLocales(manifest.id);
    }
    return manifests;
  }
  
  public getPlugin = (id: string): LoadedPlugin | undefined => this.#plugins.get(id);
  public getPluginInstance = (id: string): BackendPlugin | undefined => this.#plugins.get(id)?.instance;
  public getPluginManifest = (id: string): PluginManifest | undefined => this.#plugins.get(id)?.manifest;

  public getPluginApiRouters = (): Map<string, Router> => {
    const routers = new Map<string, Router>();
    for (const [id, p] of this.#plugins.entries()) {
      if (p.manifest.status === 'enabled') {
        const r = p.instance.getApiRouter?.();
        if (r) routers.set(id, r);
      }
    }
    return routers;
  };
  
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
      const manifest: PluginManifest = JSON.parse(await fs.readFile(path.join(targetDir, 'plugin.json'), 'utf-8'));
      await this.#loadAndRegisterPlugin(manifest);
      pubsub.publish(BACKEND_INTERNAL_EVENTS.REQUEST_MANIFESTS_BROADCAST);
      return { success: true, message: `Plugin '${pluginId}' installed successfully.` };
    } catch (e) {
      console.error(`[PluginManager] Failed to install plugin from ${repoUrl}:`, e);
      await fs.rm(targetDir, { recursive: true, force: true }).catch(() => { /* No-op */ });
      return { success: false, message: `Failed to install plugin: ${(e as Error).message}` };
    }
  }

  public async uninstallPlugin(pluginId: string): Promise<{success:boolean; message:string}> {
    const pluginDir = path.join(PLUGINS_DIR, pluginId);
    try {
      await fs.access(pluginDir);
      await this.#unloadAndDeregisterPlugin(pluginId);
      await fs.rm(pluginDir, { recursive: true, force: true });
      this.#disabledPluginIds.delete(pluginId);
      await this.#loaderService.saveDisabledPluginIds(this.#disabledPluginIds);
      pubsub.publish(BACKEND_INTERNAL_EVENTS.REQUEST_MANIFESTS_BROADCAST);
      return { success: true, message: `Plugin '${pluginId}' uninstalled successfully.` };
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return { success: false, message: `Plugin '${pluginId}' not found.` };
      return { success: false, message: `Failed to uninstall plugin: ${(e as Error).message}` };
    }
  }

  public async setPluginState(pluginId: string, state: 'enabled' | 'disabled'): Promise<{success:boolean; message:string}> {
    if (!this.#plugins.has(pluginId)) return { success: false, message: `Plugin '${pluginId}' not found.` };
    if (state === 'enabled') this.#disabledPluginIds.delete(pluginId);
    else this.#disabledPluginIds.add(pluginId);
    await this.#loaderService.saveDisabledPluginIds(this.#disabledPluginIds);
    await this.#unloadAndDeregisterPlugin(pluginId);
    const manifestPath = path.join(PLUGINS_DIR, pluginId, 'plugin.json');
    try {
      const manifest: PluginManifest = JSON.parse(await fs.readFile(manifestPath, 'utf-8'));
      await this.#loadAndRegisterPlugin(manifest);
      pubsub.publish(BACKEND_INTERNAL_EVENTS.REQUEST_MANIFESTS_BROADCAST);
      return { success: true, message: `Plugin '${pluginId}' has been ${state}.` };
    } catch (e) { return { success: false, message: `Failed to reload plugin after state change: ${(e as Error).message}` }; }
  }

  public async destroy(): Promise<void> {
    await Promise.all(Array.from(this.#plugins.keys()).map(id => this.#unloadAndDeregisterPlugin(id)));
  }
}