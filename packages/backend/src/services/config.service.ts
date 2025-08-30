/* FILE: packages/backend/src/services/config.service.ts */
import { watchFile, unwatchFile, type StatsListener, type StatWatcher } from 'fs';

import {
  BACKEND_INTERNAL_EVENTS,
  pubsub,
  normalizeNameForMtx,
  type FullConfiguration,
  type GestureConfig,
  type PoseConfig,
  type StreamStatusPayload,
  type ValidationErrorDetail,
  type RtspSourceConfig,
} from '#shared/index.js';

import { ConfigRepository } from './config/config-repository.js';
import { ConfigValidator } from './config/config-validator.js';
import type { MtxMonitorService } from './mtx-monitor.service.js';

const FILE_WATCH_INTERVAL_MS = 1000;
const DEBOUNCE_DELAY_MS = 300;

const DEFAULT_CONFIG: FullConfiguration = {
  globalCooldown: 2.0,
  rtspSources: [],
  gestureConfigs: [],
  targetFpsPreference: 15,
  telemetryEnabled: false,
  enableCustomHandGestures: false,
  enablePoseProcessing: false,
  enableBuiltInHandGestures: true,
  lowLightBrightness: 100,
  lowLightContrast: 100,
  handDetectionConfidence: 0.5,
  handPresenceConfidence: 0.5,
  handTrackingConfidence: 0.4,
  poseDetectionConfidence: 0.5,
  posePresenceConfidence: 0.5,
  poseTrackingConfidence: 0.4,
};

export class ConfigService {
  public currentConfig: FullConfiguration = structuredClone(DEFAULT_CONFIG);
  public isInitialized = false;
  public initializationPromise: Promise<void>;
  public writeLock = false;
  private fileWatcher: StatWatcher | null = null;
  private fileWatchTimeout: NodeJS.Timeout | null = null;
  public mtxMonitorInstance: MtxMonitorService | null = null;
  #streamStatusBroadcaster:
    | ((payload: StreamStatusPayload) => void)
    | null = null;

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
      console.error(
        '[ConfigService] Critical error during initial config load.',
        error
      );
      this.currentConfig = structuredClone(DEFAULT_CONFIG);
      this.isInitialized = true;
    }
  }

  public async getFullConfig(): Promise<FullConfiguration> {
    await this.initializationPromise;
    return structuredClone(this.currentConfig);
  }

  public getGestureConfigByName = (
    name: string
  ): GestureConfig | PoseConfig | null => {
    if (!name) return null;
    const normName = normalizeNameForMtx(name).toUpperCase();
    const config = (this.currentConfig.gestureConfigs || []).find((c: GestureConfig | PoseConfig) => {
      const cfgName = 'gesture' in c ? c.gesture : c.pose;
      return normalizeNameForMtx(cfgName)?.toUpperCase() === normName;
    });
    return config ? structuredClone(config) : null;
  };

  public async patchConfig(
    patchData: Partial<FullConfiguration>
  ): Promise<{
    success: boolean;
    message?: string;
    validationErrors?: ValidationErrorDetail[];
    rtspChanged?: boolean;
  }> {
    await this.initializationPromise;
    if (typeof patchData !== 'object' || patchData === null)
      return { success: false, message: 'Invalid patch data.' };

    const originalRtspConfig = JSON.stringify(this.currentConfig.rtspSources);
    const proposedConfig = { ...structuredClone(this.currentConfig), ...patchData };
    const validationResult = this.validator.validateFullConfig(proposedConfig);

    if (!validationResult.success) {
      return {
        success: false,
        message: 'Global config validation failed.',
        validationErrors: validationResult.errors,
      };
    }

    const wasChanged =
      JSON.stringify(this.currentConfig) !== JSON.stringify(validationResult.data);
    if (!wasChanged)
      return { success: true, message: 'No changes detected in global config.' };

    try {
      const rtspChangedInPatch =
        originalRtspConfig !== JSON.stringify(validationResult.data.rtspSources);
      await this._writeConfig(validationResult.data);
      pubsub.publish(BACKEND_INTERNAL_EVENTS.CONFIG_RELOADED, {
        updatedConfig: validationResult.data,
        rtspChanged: rtspChangedInPatch,
      });
      pubsub.publish(BACKEND_INTERNAL_EVENTS.CONFIG_PATCHED, {
        updatedConfig: validationResult.data,
        rtspChanged: rtspChangedInPatch,
      });
      return {
        success: true,
        message: 'Global config updated successfully.',
        rtspChanged: rtspChangedInPatch,
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        message: `Config write operation failed: ${message}`,
      };
    }
  }

  public async _readAndValidateConfig(): Promise<FullConfiguration> {
    let jsonData: unknown = await this.repository.readConfigFile();
    let needsWriteBack = false;

    if (jsonData === null) {
      console.warn(`[ConfigService] Config file not found. Creating with defaults.`);
      jsonData = structuredClone(DEFAULT_CONFIG);
      needsWriteBack = true;
    }

    const validationResult = this.validator.validateFullConfig(jsonData);
    if (validationResult.success) this.currentConfig = validationResult.data;
    else {
      console.warn(
        `[ConfigService] Config validation failed, falling back to defaults. Errors:`,
        JSON.stringify(validationResult.errors, null, 2)
      );
      this.currentConfig = structuredClone(DEFAULT_CONFIG);
      needsWriteBack = true;
    }

    if (needsWriteBack) await this._writeConfig(this.currentConfig, true);
    return this.currentConfig;
  }

  public async _writeConfig(
    config: FullConfiguration,
    isInternalWrite = false
  ): Promise<void> {
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
        this.fileWatchTimeout = setTimeout(() => {
          this.reloadConfig();
          this.fileWatchTimeout = null;
        }, DEBOUNCE_DELAY_MS);
      }
    };
    try {
      this.fileWatcher = watchFile(
        '/app/config.json',
        { interval: FILE_WATCH_INTERVAL_MS },
        listener
      );
    } catch (e) {
      console.error('[ConfigService Watcher] Error starting watcher:', e);
    }
  }

  public stopFileWatcher(): void {
    if (this.fileWatcher) {
      unwatchFile('/app/config.json');
      this.fileWatcher = null;
    }
    if (this.fileWatchTimeout) clearTimeout(this.fileWatchTimeout);
  }

  public async reloadConfig(): Promise<{ changed: boolean; rtspChanged: boolean }> {
    if (this.writeLock) return { changed: false, rtspChanged: false };
    const oldConfigStr = JSON.stringify(this.currentConfig);
    const oldRtspStr = JSON.stringify(this.currentConfig.rtspSources);
    try {
      await this._readAndValidateConfig();
      if (JSON.stringify(this.currentConfig) !== oldConfigStr) {
        const rtspChanged =
          oldRtspStr !== JSON.stringify(this.currentConfig.rtspSources);
        pubsub.publish(BACKEND_INTERNAL_EVENTS.CONFIG_RELOADED, {
          updatedConfig: this.currentConfig,
          rtspChanged,
        });
        return { changed: true, rtspChanged };
      }
    } catch (error) {
      console.error(
        '[ConfigService] Failed to reload config:',
        (error as Error).message
      );
    }
    return { changed: false, rtspChanged: false };
  }

  public isConfigLoaded = (): boolean => this.isInitialized;
  public getGlobalCooldown = (): number => this.currentConfig.globalCooldown;
  public getRtspSources = (): RtspSourceConfig[] =>
    structuredClone(this.currentConfig.rtspSources);
  public getGestureConfigs = (): (GestureConfig | PoseConfig)[] =>
    structuredClone(this.currentConfig.gestureConfigs);
  public getTargetFpsPreference = (): number =>
    this.currentConfig.targetFpsPreference;
  public getTelemetryPreference = (): boolean =>
    this.currentConfig.telemetryEnabled ?? false;
  public getEnableCustomHandGestures = (): boolean =>
    this.currentConfig.enableCustomHandGestures;
  public isBuiltInHandGesturesEnabled = (): boolean =>
    this.currentConfig.enableBuiltInHandGestures;
  public getEnablePoseProcessing = (): boolean =>
    this.currentConfig.enablePoseProcessing;
  public getLowLightBrightness = (): number =>
    this.currentConfig.lowLightBrightness ?? 100;
  public getLowLightContrast = (): number =>
    this.currentConfig.lowLightContrast ?? 100;

  public setStreamStatusBroadcaster(
    fn: (payload: StreamStatusPayload) => void
  ) {
    this.#streamStatusBroadcaster = fn;
  }
  public _broadcastStreamStatus = (payload: StreamStatusPayload): void => {
    this.#streamStatusBroadcaster?.(payload);
  };
  public setMtxMonitorInstance(monitorInstance: MtxMonitorService): void {
    this.mtxMonitorInstance = monitorInstance;
    this.mtxMonitorInstance.setStreamStatusBroadcaster?.(
      this._broadcastStreamStatus
    );
  }
  public cleanup(): void {
    this.stopFileWatcher();
  }
}