/* FILE: packages/backend/src/services/plugin-manager.service.ts */
import { exec } from 'child_process';
import { unwatchFile, watchFile, type StatWatcher } from 'fs';
import fs from 'fs/promises';
import path from 'path';
import { promisify } from 'util';

import { type Router } from 'express';
import { type ZodType, type z } from 'zod';

import { BaseBackendPlugin } from '#backend/plugins/base-backend.plugin.js';
import { BACKEND_INTERNAL_EVENTS } from '#shared/constants/index.js';
import { pubsub } from '#shared/core/pubsub.js';
import { type ConfigRepository } from './config/config-repository.js';
import { connectToCompanion } from '../utils/companion-connector.js';
import { createErrorResult } from '#backend/utils/action-helpers.js';

import type {
  PluginManifest,
  ActionConfig,
  ActionDetails,
  ActionResult,
  GestureConfig,
  PoseConfig,
  SectionValidationResult,
  ValidationErrorDetail,
} from '#shared/types/index.js';
import type {
  BackendPlugin,
  ActionHandler,
  BackendPluginContext,
} from '#backend/types/index.js';
import type { ConfigService } from './config.service.js';

const execAsync = promisify(exec);

interface LoadedPlugin {
  manifest: PluginManifest;
  instance: BackendPlugin;
  globalConfig: unknown | null;
  configPath: string | null;
  _configWatcher?: StatWatcher | null;
}

const PLUGINS_DIR = '/app/extensions/plugins';
const DISABLED_PLUGINS_FILE = path.join(PLUGINS_DIR, 'disabled-plugins.json');

export class PluginManagerService {
  private plugins = new Map<string, LoadedPlugin>();
  private disabledPluginIds = new Set<string>();
  private configService: ConfigService;
  private configRepository: ConfigRepository;
  private isInitialized = false;
  private initializationPromise: Promise<void> | null = null;
  private configWatchDebounceTimers = new Map<string, NodeJS.Timeout>();
  #pluginConfigUpdateUnsubscribers = new Map<string, () => void>();

  constructor(
    configService: ConfigService,
    configRepository: ConfigRepository
  ) {
    this.configService = configService;
    this.configRepository = configRepository;
    this.initializationPromise = this._initialize();
  }

  public async waitUntilInitialized(): Promise<void> {
    return this.initializationPromise!;
  }

  private async _initialize(): Promise<void> {
    if (this.isInitialized) return;
    try {
      await this.loadDisabledPlugins();
      await this.discoverAndLoadPlugins();
      this.isInitialized = true;
    } catch (error) {
      console.error(
        '[PluginManagerService] CRITICAL ERROR during plugin initialization:',
        error
      );
      this.isInitialized = false;
      throw error;
    }
  }

  private async loadDisabledPlugins(): Promise<void> {
    try {
      const data = await fs.readFile(DISABLED_PLUGINS_FILE, 'utf-8');
      const disabled = JSON.parse(data);
      if (Array.isArray(disabled)) {
        this.disabledPluginIds = new Set(disabled);
      }
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') {
        this.disabledPluginIds = new Set();
      } else {
        console.error('[PluginManager] Error reading disabled-plugins.json:', e);
      }
    }
  }

  private async saveDisabledPlugins(): Promise<void> {
    try {
      await fs.writeFile(
        DISABLED_PLUGINS_FILE,
        JSON.stringify(Array.from(this.disabledPluginIds), null, 2)
      );
    } catch (e) {
      console.error('[PluginManager] Error saving disabled-plugins.json:', e);
    }
  }

  private async _loadPluginFromManifest(
    manifest: PluginManifest,
    pluginDirName: string
  ): Promise<void> {
    if (manifest.id !== pluginDirName) {
      console.warn(
        `[PluginManager] Manifest ID ('${manifest.id}') != dir name ('${pluginDirName}'). Using dir name.`
      );
      manifest.id = pluginDirName;
    }
    if (this.plugins.has(pluginDirName)) {
      console.warn(`[PluginManager] Duplicate plugin ID '${pluginDirName}'. Skipping.`);
      return;
    }
    manifest.status = this.disabledPluginIds.has(pluginDirName)
      ? 'disabled'
      : 'enabled';
    if (manifest.status === 'disabled') {
      console.log(
        `[PluginManager] Skipping load of disabled plugin: ${pluginDirName}`
      );
      this.plugins.set(pluginDirName, {
        manifest,
        instance: new BaseBackendPlugin(manifest),
        globalConfig: null,
        configPath: null,
      });
      return;
    }

    let pluginInstance: BackendPlugin;
    const backendEntryPath = manifest.backendEntry
      ? path.resolve(
          PLUGINS_DIR,
          pluginDirName,
          manifest.backendEntry.replace('.js', '.ts')
        )
      : null;

    try {
      if (!backendEntryPath) {
        pluginInstance = new BaseBackendPlugin(manifest);
      } else {
        const pluginModule = await import(`file://${backendEntryPath}?v=${Date.now()}`);
        const PluginClass = pluginModule.default;
        if (typeof PluginClass !== 'function' || !PluginClass.prototype)
          throw new Error('Does not export a default class constructor.');
        pluginInstance = new PluginClass();
        pluginInstance.manifest = manifest;
      }
    } catch (moduleError) {
      console.error(
        `[PluginManager] Could not load backend module for ${pluginDirName}:`,
        moduleError
      );
      return;
    }

    const configPath =
      manifest.capabilities.hasGlobalSettings && manifest.globalConfigFileName
        ? path.join(PLUGINS_DIR, pluginDirName, manifest.globalConfigFileName)
        : null;

    let globalConfig: unknown = null;
    if (configPath) {
      const schema = pluginInstance.getGlobalConfigValidationSchema?.();
      globalConfig = await this.configRepository.readPluginConfigFile(
        configPath,
        schema as ZodType | undefined
      );
    }

    const loadedPluginData: LoadedPlugin = {
      manifest,
      instance: pluginInstance,
      globalConfig,
      configPath,
    };
    this.plugins.set(pluginDirName, loadedPluginData);
    if (configPath) this.#startWatchingPluginConfig(pluginDirName, configPath);

    if (typeof pluginInstance.init === 'function') {
      const context: BackendPluginContext = {
        pluginManager: this,
        configService: this.configService,
        getPluginGlobalConfig: () => this.getPluginGlobalConfig(pluginDirName),
        connectToCompanion: connectToCompanion,
      };
      await pluginInstance.init(context);
    }
  }

  #startWatchingPluginConfig(pluginId: string, configPath: string): void {
    const pluginEntry = this.plugins.get(pluginId);
    if (!pluginEntry || pluginEntry._configWatcher) return;

    const debounceListener = () => {
      if (this.configWatchDebounceTimers.has(pluginId))
        clearTimeout(this.configWatchDebounceTimers.get(pluginId)!);
      this.configWatchDebounceTimers.set(
        pluginId,
        setTimeout(async () => {
          console.log(`[PluginManager] Config change for '${pluginId}'. Reloading...`);
          try {
            const schema = pluginEntry.instance.getGlobalConfigValidationSchema?.();
            const newConfig = await this.configRepository.readPluginConfigFile(
              configPath,
              schema as ZodType | undefined
            );
            if (JSON.stringify(pluginEntry.globalConfig) !== JSON.stringify(newConfig)) {
              pluginEntry.globalConfig = newConfig;
              await pluginEntry.instance.onGlobalConfigUpdate?.(newConfig);
              pubsub.publish(
                BACKEND_INTERNAL_EVENTS.PLUGIN_GLOBAL_CONFIG_CHANGED_ON_BACKEND,
                { pluginId, newConfig }
              );
              console.log(
                `[PluginManager] Successfully reloaded config for plugin '${pluginId}'.`
              );
            }
          } catch (error) {
            console.error(
              `[PluginManager] Error reloading config for plugin '${pluginId}':`,
              error
            );
          }
        }, 300)
      );
    };

    try {
      pluginEntry._configWatcher = watchFile(configPath, { interval: 2000 }, debounceListener);
    } catch (e) {
      console.error(`[PluginManager] Error starting config watcher for ${pluginId}:`, e);
    }
  }

  #stopWatchingPluginConfig(pluginId: string): void {
    const pluginEntry = this.plugins.get(pluginId);
    if (pluginEntry?._configWatcher && pluginEntry.configPath)
      unwatchFile(pluginEntry.configPath);
    if (this.configWatchDebounceTimers.has(pluginId))
      clearTimeout(this.configWatchDebounceTimers.get(pluginId)!);
    this.#pluginConfigUpdateUnsubscribers.delete(pluginId);
  }

  public async destroy(): Promise<void> {
    for (const pluginId of this.plugins.keys()) {
      this.#stopWatchingPluginConfig(pluginId);
      await this.plugins.get(pluginId)?.instance.destroy?.();
    }
    this.plugins.clear();
  }

  private async discoverAndLoadPlugins(): Promise<void> {
    this.plugins.clear();
    try {
      const pluginDirs = await fs.readdir(PLUGINS_DIR, { withFileTypes: true });
      for (const dirent of pluginDirs) {
        if (
          !dirent.isDirectory() ||
          dirent.name.startsWith('_') ||
          dirent.name === 'common' ||
          dirent.name === 'plugin-template'
        )
          continue;
        const manifestPath = path.join(PLUGINS_DIR, dirent.name, 'plugin.json');
        try {
          const manifest: PluginManifest = JSON.parse(
            await fs.readFile(manifestPath, 'utf-8')
          );
          await this._loadPluginFromManifest(manifest, dirent.name);
        } catch (error) {
          console.error(
            `[PluginManagerService] Failed to load plugin from '${dirent.name}':`,
            error
          );
        }
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
        console.error('[PluginManagerService] Error discovering plugins:', error);
    }
  }

  public async installPlugin(repoUrl: string): Promise<ActionResult> {
    if (!/^(https?|git):\/\/[^\s$.?#].[^\s]*$/.test(repoUrl)) {
      return { success: false, message: 'Invalid Git repository URL provided.' };
    }
    const pluginId = path.basename(repoUrl, '.git');
    const targetDir = path.join(PLUGINS_DIR, pluginId);

    try {
      await fs.access(targetDir);
      return { success: false, message: `Plugin '${pluginId}' already exists.` };
    } catch (_e) {
      /* Directory does not exist, proceed */
    }

    try {
      await execAsync(`git clone --depth 1 ${repoUrl} ${targetDir}`);
      const manifestPath = path.join(targetDir, 'plugin.json');
      const manifest: PluginManifest = JSON.parse(
        await fs.readFile(manifestPath, 'utf-8')
      );

      await this._loadPluginFromManifest(manifest, pluginId);

      pubsub.publish(BACKEND_INTERNAL_EVENTS.REQUEST_MANIFESTS_BROADCAST);
      return {
        success: true,
        message: `Plugin '${pluginId}' installed successfully.`,
      };
    } catch (error) {
      console.error(
        `[PluginManager] Failed to install plugin from ${repoUrl}:`,
        error
      );
      await fs.rm(targetDir, { recursive: true, force: true }).catch(() => {});
      return {
        success: false,
        message: `Failed to install plugin: ${(error as Error).message}`,
      };
    }
  }

  public async uninstallPlugin(pluginId: string): Promise<ActionResult> {
    const pluginDir = path.join(PLUGINS_DIR, pluginId);
    try {
      await fs.access(pluginDir);

      const plugin = this.plugins.get(pluginId);
      if (plugin) {
        await plugin.instance.destroy?.();
        this.#stopWatchingPluginConfig(pluginId);
        this.plugins.delete(pluginId);
      }

      await fs.rm(pluginDir, { recursive: true, force: true });

      this.disabledPluginIds.delete(pluginId);
      await this.saveDisabledPlugins();

      pubsub.publish(BACKEND_INTERNAL_EVENTS.REQUEST_MANIFESTS_BROADCAST);
      return {
        success: true,
        message: `Plugin '${pluginId}' uninstalled successfully.`,
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return { success: false, message: `Plugin '${pluginId}' not found.` };
      }
      console.error(
        `[PluginManager] Failed to uninstall plugin ${pluginId}:`,
        error
      );
      return {
        success: false,
        message: `Failed to uninstall plugin: ${(error as Error).message}`,
      };
    }
  }

  public async setPluginState(
    pluginId: string,
    state: 'enabled' | 'disabled'
  ): Promise<ActionResult> {
    if (!this.plugins.has(pluginId)) {
      return { success: false, message: `Plugin '${pluginId}' not found.` };
    }

    if (state === 'enabled') {
      this.disabledPluginIds.delete(pluginId);
    } else {
      this.disabledPluginIds.add(pluginId);
    }
    await this.saveDisabledPlugins();

    const existingPlugin = this.plugins.get(pluginId);
    if (existingPlugin) {
      await existingPlugin.instance.destroy?.();
      this.#stopWatchingPluginConfig(pluginId);
      this.plugins.delete(pluginId);
    }

    const manifestPath = path.join(PLUGINS_DIR, pluginId, 'plugin.json');
    try {
      const manifest: PluginManifest = JSON.parse(
        await fs.readFile(manifestPath, 'utf-8')
      );
      await this._loadPluginFromManifest(manifest, pluginId);
    } catch (error) {
      console.error(
        `[PluginManager] Failed to reload plugin '${pluginId}' after state change:`,
        error
      );
      return {
        success: false,
        message: `Failed to reload plugin after state change: ${
          (error as Error).message
        }`,
      };
    }

    pubsub.publish(BACKEND_INTERNAL_EVENTS.REQUEST_MANIFESTS_BROADCAST);

    return { success: true, message: `Plugin '${pluginId}' has been ${state}.` };
  }

  public getActionHandler = (pluginId: string): ActionHandler | null =>
    this.plugins.get(pluginId)?.instance.getActionHandler?.() ?? null;
  public getPluginApiRouters = (): Map<string, Router> => {
    const routers = new Map<string, Router>();
    for (const [id, p] of this.plugins.entries()) {
      if (p.manifest.status !== 'disabled') {
        const r = p.instance.getApiRouter?.();
        if (r) routers.set(id, r);
      }
    }
    return routers;
  };

  private async getPluginLocales(
    pluginDirName: string
  ): Promise<Record<string, Record<string, string>> | undefined> {
    const localesDir = path.join(PLUGINS_DIR, pluginDirName, 'locales');
    try {
      const files = await fs.readdir(localesDir);
      const localeData: Record<string, Record<string, string>> = {};
      for (const file of files) {
        if (file.endsWith('.json')) {
          const lang = path.basename(file, '.json');
          const content = await fs.readFile(path.join(localesDir, file), 'utf-8');
          localeData[lang] = JSON.parse(content);
        }
      }
      return Object.keys(localeData).length > 0 ? localeData : undefined;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') {
        console.error(
          `[PluginManager] Error reading locales for plugin ${pluginDirName}:`,
          e
        );
      }
      return undefined;
    }
  }

  public async getAllPluginManifestsWithCapabilities(): Promise<PluginManifest[]> {
    await this.initializationPromise;
    const manifests = Array.from(this.plugins.values()).map((p) => p.manifest);
    for (const manifest of manifests) {
      manifest.locales = await this.getPluginLocales(manifest.id);
    }
    return manifests;
  }

  public getPluginInstance = (pluginId: string): BackendPlugin | undefined =>
    this.plugins.get(pluginId)?.instance;
  public getPluginManifest = (pluginId: string): PluginManifest | undefined =>
    this.plugins.get(pluginId)?.manifest;

  public async dispatch(
    config: GestureConfig | PoseConfig,
    details: ActionDetails
  ): Promise<ActionResult> {
    const configName = 'gesture' in config ? config.gesture : config.pose;
    const actionConfig = config.actionConfig as ActionConfig | null;
    if (!actionConfig?.pluginId || actionConfig.pluginId === 'none')
      return createErrorResult(`No action configured for ${configName}.`, {
        configName,
        success: true,
      });

    const pluginId = actionConfig.pluginId;
    const pluginEntry = this.plugins.get(pluginId);
    if (pluginEntry?.manifest.status === 'disabled') {
      return createErrorResult(
        `Action failed: Plugin '${pluginId}' is disabled.`,
        { pluginId }
      );
    }

    const handler = this.getActionHandler(pluginId);
    if (!handler) {
      const message = `Action handler for plugin '${pluginId}' not found or plugin does not provide actions.`;
      return createErrorResult(message, { pluginId });
    }
    try {
      const context: BackendPluginContext = {
        pluginManager: this,
        configService: this.configService,
        getPluginGlobalConfig: <T>() => this.getPluginGlobalConfig<T>(pluginId),
        connectToCompanion,
      };
      return await handler.execute(
        actionConfig.settings,
        details,
        await this.getPluginGlobalConfig(pluginId),
        context
      );
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      return createErrorResult(
        `Handler error for plugin ${pluginId}: ${
          message || 'Unknown handler error'
        }`,
        { error, pluginId }
      );
    }
  }

  public async getPluginGlobalConfig<T>(pluginId: string): Promise<T | null> {
    const pluginEntry = this.plugins.get(pluginId);
    if (!pluginEntry || pluginEntry.manifest.status === 'disabled') return null;
    if (pluginEntry.globalConfig === null && pluginEntry.configPath) {
      const schema = pluginEntry.instance.getGlobalConfigValidationSchema?.();
      pluginEntry.globalConfig =
        await this.configRepository.readPluginConfigFile(
          pluginEntry.configPath,
          schema as ZodType | undefined
        );
    }
    return pluginEntry.globalConfig as T | null;
  }

  public async savePluginGlobalConfig(
    pluginId: string,
    newConfigData: unknown
  ): Promise<{
    success: boolean;
    message?: string;
    validationErrors?: SectionValidationResult;
  }> {
    const pluginEntry = this.plugins.get(pluginId);
    if (
      !pluginEntry ||
      !pluginEntry.configPath ||
      !pluginEntry.manifest.capabilities.hasGlobalSettings
    ) {
      return {
        success: false,
        message: `Plugin '${pluginId}' does not exist or support global settings.`,
      };
    }
    const schema = pluginEntry.instance.getGlobalConfigValidationSchema?.();
    let validatedData = newConfigData;
    if (schema) {
      const result = schema.safeParse(newConfigData);
      if (!result.success) {
        const errors: ValidationErrorDetail[] = result.error.issues.map(
          (e: z.ZodIssue) => ({
            field: e.path.join('.'),
            messageKey: e.message,
            details: { code: e.code },
          })
        );
        return {
          success: false,
          message: 'Plugin configuration validation failed.',
          validationErrors: { isValid: false, errors },
        };
      }
      validatedData = result.data;
    }
    if (
      await this.configRepository.writePluginConfigFile(
        pluginEntry.configPath,
        validatedData
      )
    ) {
      pluginEntry.globalConfig = validatedData;
      console.log(
        `[PluginManagerService] In-memory config for '${pluginId}' updated immediately after save.`
      );
      return { success: true, message: `Plugin '${pluginId}' config saved.` };
    }
    return {
      success: false,
      message: `Failed to write config for plugin '${pluginId}'.`,
    };
  }

  public validatePluginActionSettings(
    pluginId: string,
    settings: unknown
  ): SectionValidationResult {
    const schema = this.plugins.get(pluginId)?.instance.getActionConfigValidationSchema?.();
    if (!schema) return { isValid: true };
    const result = schema.safeParse(settings);
    if (result.success) return { isValid: true };
    return {
      isValid: false,
      errors: result.error.issues.map((e) => ({
        field: e.path.join('.'),
        messageKey: e.message,
        details: { code: e.code },
      })),
    };
  }
}