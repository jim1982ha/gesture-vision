/* FILE: packages/backend/src/websocket-handlers/core-handlers.ts */
import { sendMessageToClient, sendErrorMessageToClient } from '#backend/utils/index.js';
import type { HandlerDependencies } from './handler-dependencies.type.js';
import type WebSocket from 'ws';

import { WEBSOCKET_EVENTS, type WebSocketMessage, type ActionResult, type GestureConfig, type PoseConfig, type ActionDetails } from '#shared/index.js';

export async function dispatchActionHandler(ws: WebSocket, message: WebSocketMessage<unknown>, { actionDispatcher }: HandlerDependencies): Promise<void> {
  const { gestureConfig, details } = (message as WebSocketMessage<{ gestureConfig: GestureConfig | PoseConfig; details: ActionDetails; }>).payload;
  if (!gestureConfig || !details) {
    await sendErrorMessageToClient(ws, 'INVALID_PAYLOAD', 'DISPATCH_ACTION payload requires gestureConfig and details.');
    return;
  }

  const configName = 'gesture' in gestureConfig ? gestureConfig.gesture : (gestureConfig as PoseConfig).pose;
  try {
    const actionResult: ActionResult = await actionDispatcher!.dispatch(gestureConfig, details);
    const resultMessage: WebSocketMessage<unknown> = {
      type: WEBSOCKET_EVENTS.BACKEND_ACTION_RESULT,
      payload: { gestureName: configName, pluginId: gestureConfig.actionConfig?.pluginId || 'none', ...actionResult },
    };
    await sendMessageToClient(ws, resultMessage);
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error during action dispatch.';
    console.error(`[WS ActionHandler] Error processing DISPATCH_ACTION for ${configName}:`, error);
    await sendErrorMessageToClient(ws, 'PROCESSING_ERROR', `Error dispatching action: ${errorMessage}`);
  }
}

export async function rtspConnectRequestHandler(ws: WebSocket, message: WebSocketMessage<unknown>, { mtxMonitorService, configService }: HandlerDependencies): Promise<void> {
  const { pathName } = (message as WebSocketMessage<{ pathName: string }>).payload;
  if (!pathName) {
    await sendErrorMessageToClient(ws, 'INVALID_PAYLOAD', 'RTSP_CONNECT_REQUEST requires a pathName.', { messageId: message.messageId });
    return;
  }

  try {
    const sources = await configService!.getRtspSources();
    await mtxMonitorService!.connectOnDemandStream(pathName, sources);
    await sendMessageToClient(ws, { type: WEBSOCKET_EVENTS.RTSP_CONNECT_READY, payload: { pathName }, messageId: message.messageId });
  } catch (_error) {
    await sendErrorMessageToClient(ws, 'RTSP_SETUP_FAILED', `Failed to set up RTSP path '${pathName}' on backend.`, { messageId: message.messageId });
  }
}

export async function rtspDisconnectRequestHandler(_ws: WebSocket, message: WebSocketMessage<unknown>, { mtxMonitorService }: HandlerDependencies): Promise<void> {
  const { pathName } = (message as WebSocketMessage<{ pathName: string }>).payload;
  if (pathName) await mtxMonitorService!.disconnectOnDemandStream(pathName);
}

export async function finalizePluginUninstallHandler(ws: WebSocket, message: WebSocketMessage<unknown>, { pluginManagerService }: HandlerDependencies): Promise<void> {
  const { pluginId } = (message as WebSocketMessage<{ pluginId: string }>).payload;
  if (!pluginId) {
    await sendErrorMessageToClient(ws, 'INVALID_PAYLOAD', 'FINALIZE_UNINSTALL requires a pluginId.');
    return;
  }
  await pluginManagerService!.finalizePluginUninstall(pluginId);
}