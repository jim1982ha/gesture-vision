/* FILE: packages/backend/src/plugins/base-backend.plugin.ts */
import { type ZodType } from 'zod';

import type { PluginManifest } from '#shared/types/index.js';
import type {
  BackendPlugin,
  ActionHandler,
  BackendPluginContext,
} from '#backend/types/index.js';

/**
 * A generic base class for backend plugins to reduce boilerplate.
 * Provides default implementations for all optional methods of the BackendPlugin interface.
 * Specific plugins should extend this class and override methods as needed.
 */
export class BaseBackendPlugin implements BackendPlugin {
  public manifest: PluginManifest;
  public context: BackendPluginContext | null = null;
  private actionHandlerInstance: ActionHandler | null = null;
  private actionConfigSchema: ZodType | null = null;
  private globalConfigSchema: ZodType | null = null;

  constructor(manifest: PluginManifest, actionHandler?: ActionHandler) {
    this.manifest = manifest;
    if (actionHandler) {
      this.actionHandlerInstance = actionHandler;
    }
  }

  public setActionHandler(handler: ActionHandler): void {
    this.actionHandlerInstance = handler;
  }
  public setActionConfigSchema(schema: ZodType): void {
    this.actionConfigSchema = schema;
  }
  public setGlobalConfigSchema(schema: ZodType): void {
    this.globalConfigSchema = schema;
  }

  async init(context: BackendPluginContext): Promise<void> {
    this.context = context;
  }

  getActionHandler(): ActionHandler | null {
    return this.actionHandlerInstance;
  }
  getGlobalConfigValidationSchema(): ZodType | null {
    return this.globalConfigSchema;
  }
  getActionConfigValidationSchema(): ZodType | null {
    return this.actionConfigSchema;
  }

  async onGlobalConfigUpdate(_newConfig: unknown): Promise<void> {}
  async testConnection(
    _configToTest: unknown
  ): Promise<{
    success: boolean;
    messageKey?: string;
    error?: { code?: string; message?: string };
  }> {
    return {
      success: false,
      messageKey: 'testNotSupported',
      error: { code: 'NOT_SUPPORTED' },
    };
  }
  async destroy(): Promise<void> {}
}