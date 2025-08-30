/* FILE: packages/backend/src/types/index.ts */
// Contains types that are exclusively used by the backend service.

import type { Router } from 'express';
import type { ZodType, ZodSchema } from 'zod';
import type {
  PluginManifest,
  ActionResult,
  ActionDetails,
} from '#shared/index.js';

export type ConnectToCompanionFn = (host: string) => Promise<unknown>;

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
  connectToCompanion: ConnectToCompanionFn;
}

export interface BackendPlugin {
  manifest: PluginManifest;
  init?(context: BackendPluginContext): Promise<void>;
  getApiRouter?(): Router | null;
  getActionHandler?(): ActionHandler | null;
  getGlobalConfigValidationSchema?(): ZodSchema | ZodType | null;
  getActionConfigValidationSchema?(): ZodSchema | ZodType | null;
  onGlobalConfigUpdate?(newConfig: unknown): Promise<void>;
  destroy?(): Promise<void>;
  testConnection?(configToTest: unknown): Promise<{
    success: boolean;
    messageKey?: string;
    error?: { code?: string; message?: string };
  }>;
}