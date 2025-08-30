/* FILE: packages/backend/src/websocket-handlers/core-handlers.ts */
import { sendMessageToClient, sendErrorMessageToClient } from './ws-response-utils.js';
import type { HandlerDependencies } from './handler-dependencies.type.js';
import type WebSocket from 'ws';

import { WEBSOCKET_EVENTS, type WebSocketMessage, type ActionResult, type GestureConfig, type PoseConfig, type ActionDetails } from '#shared/index.js';
import { ActionDispatcherService } from '#backend/services/action-dispatcher.service.js';

export async function dispatchActionHandler(
  ws: WebSocket,
  message: WebSocketMessage<unknown>,
  dependencies: HandlerDependencies
): Promise<void> {
  const { pluginManagerService } = dependencies;
  if (!pluginManagerService) {
    await sendErrorMessageToClient(ws, 'SERVER_ERROR', 'Core services not ready.');
    return;
  }
  const actionDispatcher = new ActionDispatcherService(pluginManagerService);

  const { gestureConfig, details } = (message as WebSocketMessage<{ gestureConfig: GestureConfig | PoseConfig; details: ActionDetails; }>).payload;
  if (!gestureConfig || !details) {
    await sendErrorMessageToClient(ws, 'INVALID_PAYLOAD', 'DISPATCH_ACTION payload requires gestureConfig and details.');
    return;
  }

  const configName = 'gesture' in gestureConfig ? gestureConfig.gesture : (gestureConfig as PoseConfig).pose;
  try {
    const actionResult: ActionResult = await actionDispatcher.dispatch(gestureConfig, details);
    const resultMessage: WebSocketMessage<unknown> = {
      type: WEBSOCKET_EVENTS.BACKEND_ACTION_RESULT,
      payload: {
        gestureName: configName,
        pluginId: gestureConfig.actionConfig?.pluginId || 'none',
        success: actionResult.success,
        message: actionResult.message,
        details: actionResult.details,
      },
    };
    await sendMessageToClient(ws, resultMessage);
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error during action dispatch.';
    console.error(`[WS ActionHandler] Error processing DISPATCH_ACTION for ${configName}:`, error);
    await sendErrorMessageToClient(ws, 'PROCESSING_ERROR', `Error dispatching action: ${errorMessage}`);
  }
}

export async function rtspConnectRequestHandler(
  _ws: WebSocket,
  message: WebSocketMessage<unknown>,
  dependencies: HandlerDependencies
): Promise<void> {
  const { mtxMonitorService } = dependencies;
  if (!mtxMonitorService) return; // No error message needed for this transient request
  const { pathName } = (message as WebSocketMessage<{ pathName: string }>).payload;
  if (pathName) await mtxMonitorService.connectOnDemandStream(pathName);
}

export async function rtspDisconnectRequestHandler(
  _ws: WebSocket,
  message: WebSocketMessage<unknown>,
  dependencies: HandlerDependencies
): Promise<void> {
  const { mtxMonitorService } = dependencies;
  if (!mtxMonitorService) return;
  const { pathName } = (message as WebSocketMessage<{ pathName: string }>).payload;
  if (pathName) await mtxMonitorService.disconnectOnDemandStream(pathName);
}