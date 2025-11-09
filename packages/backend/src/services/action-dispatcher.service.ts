/* FILE: packages/backend/src/services/action-dispatcher.service.ts */
import { createErrorResult } from '#backend/utils/index.js';
import type { ActionDetails, ActionConfig, ActionResult, GestureConfig, PoseConfig } from '#shared/index.js';
import type { BackendPluginContext } from '#backend/types/index.js';
import type { PluginManagerService } from './plugin-manager.service.js';

/**
 * Service dedicated to dispatching actions to the appropriate plugin handlers.
 */
export class ActionDispatcherService {
  #pluginManager: PluginManagerService;

  constructor(pluginManager: PluginManagerService) {
    if (!pluginManager) {
      throw new Error("ActionDispatcherService requires a PluginManagerService instance.");
    }
    this.#pluginManager = pluginManager;
  }

  public async dispatch(config: GestureConfig | PoseConfig, details: ActionDetails): Promise<ActionResult> {
    const configName = 'gesture' in config ? config.gesture : config.pose;
    const actionConfig = config.actionConfig as ActionConfig | null;

    // LOGGING: Log every dispatch request received by the backend.
    console.log(`[ActionDispatcher] Received dispatch request for gesture '${configName}' -> plugin '${actionConfig?.pluginId || 'none'}'`);

    if (!actionConfig?.pluginId || actionConfig.pluginId === 'none') {
      return createErrorResult(`No action configured for ${configName}.`, { success: true });
    }

    const { pluginId, settings } = actionConfig;
    const pluginEntry = this.#pluginManager.getPlugin(pluginId);
    if (!pluginEntry || pluginEntry.manifest.status === 'disabled') {
      return createErrorResult(`Action failed: Plugin '${pluginId}' is disabled or not found.`, { pluginId });
    }

    const handler = pluginEntry.instance.getActionHandler?.();
    if (!handler) {
      return createErrorResult(`Action handler for plugin '${pluginId}' not found.`, { pluginId });
    }

    try {
      const context: BackendPluginContext = {
        getPluginGlobalConfig: <T>() => this.#pluginManager.getPluginGlobalConfig<T>(pluginId),
      };
      return await handler.execute(settings, details, await context.getPluginGlobalConfig(), context);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      return createErrorResult(`Handler error for plugin ${pluginId}: ${message}`, { error, pluginId });
    }
  }
}