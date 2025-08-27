/* FILE: packages/backend/src/websocket-handlers/core-handlers.ts */
import { sendMessageToClient, sendErrorMessageToClient } from './ws-response-utils.js';
import { type HandlerDependencies } from './handler-dependencies.type.js';
import type WebSocket from 'ws';

import { WEBSOCKET_EVENTS } from '#shared/constants/index.js';
import type {
  WebSocketMessage,
  ActionResult,
  GestureConfig,
  PoseConfig,
  ActionDetails,
} from '#shared/types/index.js';

export async function dispatchActionHandler(
  ws: WebSocket,
  message: WebSocketMessage<unknown>,
  dependencies: HandlerDependencies
): Promise<void> {
  const { pluginManagerService } = dependencies;
  if (!pluginManagerService) {
    await sendErrorMessageToClient(
      ws,
      'SERVER_ERROR',
      'PluginManagerService not ready.'
    );
    return;
  }

  const { gestureConfig, details } = (
    message as WebSocketMessage<{
      gestureConfig: GestureConfig | PoseConfig;
      details: ActionDetails;
    }>
  ).payload;
  if (!gestureConfig || !details) {
    await sendErrorMessageToClient(
      ws,
      'INVALID_PAYLOAD',
      'DISPATCH_ACTION payload requires gestureConfig and details.'
    );
    return;
  }
  const configName = 'gesture' in gestureConfig ? gestureConfig.gesture : (gestureConfig as PoseConfig).pose;
  const actionConfig = gestureConfig.actionConfig;
  try {
    const actionResult: ActionResult = await pluginManagerService.dispatch(
      gestureConfig,
      details
    );
    const resultMessage: WebSocketMessage<{
      gestureName: string;
      pluginId: string;
      success: boolean;
      message?: string;
      details?: unknown;
    }> = {
      type: WEBSOCKET_EVENTS.BACKEND_ACTION_RESULT,
      payload: {
        gestureName: configName,
        pluginId: actionConfig?.pluginId || 'none',
        success: actionResult.success,
        message: actionResult.message,
        details: actionResult.details,
      },
    };
    await sendMessageToClient(ws, resultMessage);
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error during action dispatch.';
    console.error(
      `[WS ActionHandler] Error processing DISPATCH_ACTION for ${configName} (Plugin: ${
        actionConfig?.pluginId || 'N/A'
      }):`,
      error
    );
    await sendErrorMessageToClient(
      ws,
      'PROCESSING_ERROR',
      `Error dispatching action: ${errorMessage}`
    );
  }
}

export async function rtspConnectRequestHandler(
  ws: WebSocket,
  message: WebSocketMessage<unknown>,
  dependencies: HandlerDependencies
): Promise<void> {
  const { mtxMonitorService } = dependencies;
  if (!mtxMonitorService) {
    await sendErrorMessageToClient(ws, 'SERVER_ERROR', 'MtxMonitorService not ready.');
    return;
  }

  const { pathName } = (message as WebSocketMessage<{ pathName: string }>).payload;
  if (!pathName) {
    console.warn('[RTSP Handler] Received connect request without a pathName.');
    return;
  }
  await mtxMonitorService.connectOnDemandStream(pathName);
}

export async function rtspDisconnectRequestHandler(
  ws: WebSocket,
  message: WebSocketMessage<unknown>,
  dependencies: HandlerDependencies
): Promise<void> {
  const { mtxMonitorService } = dependencies;
  if (!mtxMonitorService) {
    await sendErrorMessageToClient(ws, 'SERVER_ERROR', 'MtxMonitorService not ready.');
    return;
  }

  const { pathName } = (message as WebSocketMessage<{ pathName: string }>).payload;
  if (!pathName) {
    console.warn('[RTSP Handler] Received disconnect request without a pathName.');
    return;
  }
  await mtxMonitorService.disconnectOnDemandStream(pathName);
}