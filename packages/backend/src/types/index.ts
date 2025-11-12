/* FILE: packages/backend/src/types/index.ts */
// Contains types that are exclusively used by the backend service.
import type { Router } from 'express';
import type { ZodType } from 'zod';
import type {
  PluginManifest,
  ActionResult,
  ActionDetails,
} from '#shared/index.js';
import type { PerformanceMonitorService } from '#backend/services/performance-monitor.service.js';

export interface ActionHandler {
  execute(
    instanceSettings: unknown,
    actionDetails: ActionDetails,
    pluginGlobalConfig?: unknown,
    context?: BackendPluginContext
  ): Promise<ActionResult>;
}

export interface BackendPluginContext {
  getPluginGlobalConfig: <T>() => Promise<T | null>;
}

export interface BackendPlugin {
  manifest: PluginManifest;
  init?(context: BackendPluginContext): Promise<void>;
  getApiRouter?(): Router | null;
  getActionHandler?(): ActionHandler | null;
  getGlobalConfigValidationSchema?(): ZodType | null;
  getActionConfigValidationSchema?(): ZodType | null;
  onGlobalConfigUpdate?(newConfig: unknown): Promise<void>;
  destroy?(): Promise<void>;
  testConnection?(configToTest: unknown): Promise<{
    success: boolean;
    messageKey?: string;
    error?: { code?: string; message?: string };
  }>;
}

/**
 * Centralized interface for the services available to WebSocket message handlers.
 */
export interface HandlerDependencies {
    configService: unknown; // Actual type is ConfigService, avoiding circular dependency
    pluginManagerService: unknown; // Actual type is PluginManagerService
    mtxMonitorService: unknown; // Actual type is MtxMonitorService
    actionDispatcher: unknown; // Actual type is ActionDispatcherService
    performanceMonitorService: PerformanceMonitorService | null; 
}