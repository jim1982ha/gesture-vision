/* FILE: packages/backend/src/services/config.service.ts */
import { watchFile, unwatchFile, type StatsListener, type StatWatcher } from 'fs';
import {
  BACKEND_INTERNAL_EVENTS, pubsub, type FullConfiguration, type GestureConfig,
  type PoseConfig, type StreamStatusPayload, type RtspSourceConfig,
  normalizeNameForMtx, FullConfigurationSchema
} from '#shared/index.js';
import { ConfigRepository } from './config/config.repository.js';
import { ConfigValidator } from './config/config.validator.js';

const FILE_WATCH_INTERVAL_MS = 1000;
const DEBOUNCE_DELAY_MS = 300;

export class ConfigService {
  public currentConfig: FullConfiguration = FullConfigurationSchema.parse({});
  public isInitialized = false;
  public initializationPromise: Promise<void>;
  public writeLock = false;
  private fileWatcher: StatWatcher | null = null;
  private fileWatchTimeout: NodeJS.Timeout | null = null;
  #streamStatusBroadcaster: ((payload: StreamStatusPayload) => void) | null = null;

  private repository: ConfigRepository;
  private validator: ConfigValidator;

  constructor(repository: ConfigRepository) {
    this.repository = repository;
    this.validator = new ConfigValidator();
    this.initializationPromise = this.loadInitialConfig();
  }

  public async loadInitialConfig(): Promise<void> {
    if (this.isInitialized) return;
    try {
      await this._readAndValidateConfig();
      this.startFileWatcher();
      this.isInitialized = true;
    } catch (error) {
      console.error('[ConfigService] Critical error during initial config load.', error);
      this.currentConfig = FullConfigurationSchema.parse({});
      this.isInitialized = true;
    }
  }

  public async getFullConfig(): Promise<FullConfiguration> {
    await this.initializationPromise;
    return structuredClone(this.currentConfig);
  }

  public getGestureConfigByName = (name: string): GestureConfig | PoseConfig | null => {
    if (!name) return null;
    const normName = normalizeNameForMtx(name).toUpperCase();
    const config = this.currentConfig.gestureConfigs.find((c) => {
      const cfgName = 'gesture' in c ? c.gesture : c.pose;
      return normalizeNameForMtx(cfgName)?.toUpperCase() === normName;
    });
    return config ? structuredClone(config) : null;
  };

  public async patchConfig(patchData: Partial<FullConfiguration>) {
    await this.initializationPromise;
    if (typeof patchData !== 'object' || patchData === null) {
      return { success: false, message: 'Invalid patch data.' };
    }

    const originalRtspConfig = JSON.stringify(this.currentConfig.rtspSources);
    const proposedConfig = { ...structuredClone(this.currentConfig), ...patchData };
    const validationResult = this.validator.validateFullConfig(proposedConfig);

    if (!validationResult.success) {
      return { success: false, message: 'Global config validation failed.', validationErrors: validationResult.errors };
    }

    if (JSON.stringify(this.currentConfig) === JSON.stringify(validationResult.data)) {
      return { success: true, message: 'No changes detected in global config.' };
    }

    const rtspChanged = originalRtspConfig !== JSON.stringify(validationResult.data.rtspSources);
    await this._writeConfig(validationResult.data);
    pubsub.publish(BACKEND_INTERNAL_EVENTS.CONFIG_RELOADED, { updatedConfig: validationResult.data, rtspChanged });
    pubsub.publish(BACKEND_INTERNAL_EVENTS.CONFIG_PATCHED, { updatedConfig: validationResult.data, rtspChanged });
    return { success: true, message: 'Global config updated successfully.', rtspChanged };
  }

  public async _readAndValidateConfig(): Promise<FullConfiguration> {
    let jsonData: unknown = await this.repository.readConfigFile();
    let needsWriteBack = false;

    if (jsonData === null) {
      console.warn(`[ConfigService] Config file not found. Creating with defaults.`);
      jsonData = {}; // Let Zod schema apply all defaults
      needsWriteBack = true;
    }

    const validationResult = this.validator.validateFullConfig(jsonData);
    if (validationResult.success) {
      this.currentConfig = validationResult.data;
    } else {
      console.warn(`[ConfigService] Config validation failed, falling back to defaults. Errors:`, JSON.stringify(validationResult.errors, null, 2));
      this.currentConfig = FullConfigurationSchema.parse({});
      needsWriteBack = true;
    }

    if (needsWriteBack) await this._writeConfig(this.currentConfig, true);
    return this.currentConfig;
  }

  public async _writeConfig(config: FullConfiguration, isInternalWrite = false): Promise<void> {
    if (this.writeLock) throw new Error('Configuration save already in progress.');
    this.writeLock = true;
    if (!isInternalWrite) this.stopFileWatcher();
    try {
      await this.repository.writeConfigFile(config);
      this.currentConfig = { ...config };
    } finally {
      this.writeLock = false;
      if (!isInternalWrite) this.startFileWatcher();
    }
  }

  public startFileWatcher(): void {
    if (this.fileWatcher) return;
    const listener: StatsListener = (curr, prev) => {
      if (curr.mtimeMs !== prev.mtimeMs) {
        if (this.fileWatchTimeout) clearTimeout(this.fileWatchTimeout);
        this.fileWatchTimeout = setTimeout(() => { this.reloadConfig(); this.fileWatchTimeout = null; }, DEBOUNCE_DELAY_MS);
      }
    };
    try {
      this.fileWatcher = watchFile('/app/config.json', { interval: FILE_WATCH_INTERVAL_MS }, listener);
    } catch (e) { console.error('[ConfigService Watcher] Error starting watcher:', e); }
  }

  public stopFileWatcher(): void {
    if (this.fileWatcher) { unwatchFile('/app/config.json'); this.fileWatcher = null; }
    if (this.fileWatchTimeout) clearTimeout(this.fileWatchTimeout);
  }

  public async reloadConfig() {
    if (this.writeLock) return { changed: false, rtspChanged: false };
    const oldConfigStr = JSON.stringify(this.currentConfig);
    const oldRtspStr = JSON.stringify(this.currentConfig.rtspSources);
    try {
      await this._readAndValidateConfig();
      if (JSON.stringify(this.currentConfig) !== oldConfigStr) {
        const rtspChanged = oldRtspStr !== JSON.stringify(this.currentConfig.rtspSources);
        pubsub.publish(BACKEND_INTERNAL_EVENTS.CONFIG_RELOADED, { updatedConfig: this.currentConfig, rtspChanged });
        return { changed: true, rtspChanged };
      }
    } catch (error) { console.error('[ConfigService] Failed to reload config:', (error as Error).message); }
    return { changed: false, rtspChanged: false };
  }

  public getRtspSources = (): RtspSourceConfig[] => structuredClone(this.currentConfig.rtspSources);
  public setStreamStatusBroadcaster(fn: (payload: StreamStatusPayload) => void) { this.#streamStatusBroadcaster = fn; }
  public _broadcastStreamStatus = (payload: StreamStatusPayload): void => { this.#streamStatusBroadcaster?.(payload); };
  public cleanup(): void { this.stopFileWatcher(); }
}