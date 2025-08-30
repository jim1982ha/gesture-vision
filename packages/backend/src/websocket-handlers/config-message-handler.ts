/* FILE: packages/backend/src/websocket-handlers/config-message-handler.ts */
import { WEBSOCKET_EVENTS } from '#shared/constants/events.js';
import type WebSocket from 'ws';

import { sendMessageToClient, sendErrorMessageToClient } from './ws-response-utils.js';
import { type HandlerDependencies } from './handler-dependencies.type.js';

import type {
  WebSocketMessage,
  ConfigPatchAckPayload,
} from '#shared/index.js';

export async function patchConfigHandler(
  ws: WebSocket,
  message: WebSocketMessage<unknown>,
  dependencies: HandlerDependencies
): Promise<void> {
  const { configService } = dependencies;
  if (!configService) {
    await sendErrorMessageToClient(ws, 'SERVER_ERROR', `ConfigService not ready.`);
    return;
  }

  const patchData = (message as WebSocketMessage<unknown>).payload;
  if (typeof patchData !== 'object' || patchData === null) {
    await sendErrorMessageToClient(
      ws,
      'INVALID_PAYLOAD',
      'PATCH_CONFIG payload must be an object.'
    );
    return;
  }
  try {
    const result = await configService.patchConfig(patchData);
    const ackPayload: ConfigPatchAckPayload = {
      success: result.success,
      message: result.message,
      validationErrors: result.validationErrors,
    };
    if (result.success && result.rtspChanged !== undefined) {
      const fullConfig = await configService.getFullConfig();
      ackPayload.updatedConfig = fullConfig;
    }
    const ackMessage: WebSocketMessage<ConfigPatchAckPayload> = {
      type: WEBSOCKET_EVENTS.CONFIG_SAVE_RESULT,
      payload: ackPayload,
      messageId: message.messageId,
    };
    await sendMessageToClient(ws, ackMessage);
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error
        ? error.message
        : 'Unknown error during global config patch.';
    console.error('[WS ConfigHandler] Error processing global PATCH_CONFIG:', error);
    const ackPayload: ConfigPatchAckPayload = {
      success: false,
      message: `Error: ${errorMessage}`,
    };
    await sendMessageToClient(ws, {
      type: WEBSOCKET_EVENTS.CONFIG_SAVE_RESULT,
      payload: ackPayload,
      messageId: message.messageId,
    });
  }
}

export async function getPluginGlobalConfigHandler(
  ws: WebSocket,
  message: WebSocketMessage<unknown>,
  dependencies: HandlerDependencies
): Promise<void> {
  const { pluginManagerService } = dependencies;
  if (!pluginManagerService) {
    await sendErrorMessageToClient(
      ws,
      'SERVER_ERROR',
      `PluginManagerService not ready.`
    );
    return;
  }

  const { pluginId } = (message as WebSocketMessage<{ pluginId: string }>).payload;
  if (!pluginId) {
    await sendErrorMessageToClient(
      ws,
      'INVALID_PAYLOAD',
      'GET_PLUGIN_GLOBAL_CONFIG requires a pluginId.'
    );
    return;
  }

  const config = await pluginManagerService.getPluginGlobalConfig(pluginId);

  await sendMessageToClient(ws, {
    type: WEBSOCKET_EVENTS.PLUGIN_GLOBAL_CONFIG_DATA,
    payload: { pluginId, config: config ?? null },
    messageId: message.messageId,
  });
}

export async function patchPluginGlobalConfigHandler(
  ws: WebSocket,
  message: WebSocketMessage<unknown>,
  dependencies: HandlerDependencies
): Promise<void> {
  const { pluginManagerService } = dependencies;
  if (!pluginManagerService) {
    await sendErrorMessageToClient(
      ws,
      'SERVER_ERROR',
      `PluginManagerService not ready.`
    );
    return;
  }

  const { pluginId, config: patchPayload } = (
    message as WebSocketMessage<{ pluginId: string; config: unknown }>
  ).payload;
  if (!pluginId || typeof patchPayload !== 'object' || patchPayload === null) {
    await sendErrorMessageToClient(
      ws,
      'INVALID_PAYLOAD',
      'PATCH_PLUGIN_GLOBAL_CONFIG requires pluginId and a config payload object.'
    );
    return;
  }
  try {
    const result = await pluginManagerService.savePluginGlobalConfig(
      pluginId,
      patchPayload
    );
    const ackPayload: {
      pluginId: string;
      success: boolean;
      message?: string;
      config?: unknown;
      validationErrors?: unknown;
    } = {
      pluginId,
      success: result.success,
      message:
        result.message ||
        (result.success
          ? 'Plugin config updated.'
          : 'Failed to update plugin config.'),
      validationErrors:
        result.validationErrors?.errors ||
        (result.validationErrors?.error
          ? [result.validationErrors.error]
          : undefined),
    };
    if (result.success) {
      ackPayload.config = await pluginManagerService.getPluginGlobalConfig(pluginId);
    }
    await sendMessageToClient(ws, {
      type: WEBSOCKET_EVENTS.PLUGIN_CONFIG_PATCH_ACK,
      payload: ackPayload,
      messageId: message.messageId,
    });
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error
        ? error.message
        : `Unknown error patching plugin '${pluginId}' config.`;
    console.error(
      `[WS ConfigHandler] Error processing PATCH_PLUGIN_GLOBAL_CONFIG for '${pluginId}':`,
      error
    );
    const ackPayload = { pluginId, success: false, message: `Error: ${errorMessage}` };
    await sendMessageToClient(ws, {
      type: WEBSOCKET_EVENTS.PLUGIN_CONFIG_PATCH_ACK,
      payload: ackPayload,
      messageId: message.messageId,
    });
  }
}