/* FILE: packages/frontend/src/services/websocket/ws-message-handler.ts */
// Handles parsing and dispatching incoming WebSocket messages.
import { UI_EVENTS, WEBSOCKET_EVENTS } from "#shared/constants/index.js";
import { handlePongLogic } from "./ws-lifecycle.js";
import { appStore } from "#frontend/core/state/app-store.js";

import type { 
    WebSocketMessage, ErrorPayload, ActionResultPayload, StreamStatusPayload, 
    InitialStatePayload, CustomGestureMetadata, FullConfiguration, PluginManifest
} from "#shared/types/index.js";
import type { WebSocketService } from "../websocket-service.js";

export function handleWsMessageLogic(this: WebSocketService, rawData: string | ArrayBuffer | Blob): void {
  let message: WebSocketMessage<unknown>;
  let rawMessageString: string;

  if (typeof rawData === 'string') rawMessageString = rawData;
  else if (rawData instanceof ArrayBuffer) rawMessageString = new TextDecoder().decode(rawData);
  else { this._publishError("WS_MSG_UNSUPPORTED_TYPE", "Unsupported message data type."); return; }

  try { message = JSON.parse(rawMessageString); }
  catch (error: unknown) { this._publishError("WS_MSG_PARSE_ERR",`Parse error: ${(error as Error).message}`); return; }

  if (message.type === "pong") { handlePongLogic.call(this, message as WebSocketMessage<{id?: number | string | null}>); return; }

  if (message.messageId && this._state.pendingRequests?.has(message.messageId)) {
    const request = this._state.pendingRequests.get(message.messageId)!;
    clearTimeout(request.timeoutId);
    this._state.pendingRequests.delete(message.messageId);

    if (
        message.type === WEBSOCKET_EVENTS.PLUGIN_GLOBAL_CONFIG_DATA || 
        message.type === WEBSOCKET_EVENTS.PLUGIN_CONFIG_PATCH_ACK || 
        message.type === WEBSOCKET_EVENTS.PLUGIN_TEST_CONNECTION_RESULT ||
        message.type === WEBSOCKET_EVENTS.CONFIG_SAVE_RESULT ||
        message.type === WEBSOCKET_EVENTS.BACKEND_UPDATE_CUSTOM_GESTURE_ACK
    ) {
        if (typeof message.payload === 'object' && message.payload !== null) { request.resolve(message.payload); }
        else { request.reject(new Error(`Unexpected payload structure for ${message.type}: payload not object or null`)); }
    } else {
      console.warn(`[WS MsgHandler] Unexpected response type ${message.type} for request ID ${message.messageId}. Rejecting promise.`);
      request.reject(new Error(`Unexpected response type ${message.type} for request ID ${message.messageId}`));
    }
    return; 
  }
  
  const { actions } = appStore.getState();

  switch (message.type) {
    case WEBSOCKET_EVENTS.INITIAL_STATE:
      actions.setInitialState(message.payload as InitialStatePayload);
      break;
    case WEBSOCKET_EVENTS.FULL_CONFIG_UPDATE:
      actions.setFullConfig(
        (message.payload as {config: FullConfiguration}).config
      );
      break;
    case WEBSOCKET_EVENTS.PLUGINS_MANIFESTS_UPDATED:
        actions.setPluginManifests(
            (message.payload as {manifests: PluginManifest[]}).manifests
        );
        break;
    case WEBSOCKET_EVENTS.BACKEND_CUSTOM_GESTURES_METADATA_LIST:
      actions.setCustomGestureMetadata((message.payload as {definitions: CustomGestureMetadata[]}).definitions);
      break;
    case WEBSOCKET_EVENTS.BACKEND_UPLOAD_CUSTOM_GESTURE_ACK:
      this._publishEvent(WEBSOCKET_EVENTS.BACKEND_UPLOAD_CUSTOM_GESTURE_ACK, message.payload);
      break;
    case WEBSOCKET_EVENTS.BACKEND_DELETE_CUSTOM_GESTURE_ACK:
      this._publishEvent(WEBSOCKET_EVENTS.BACKEND_DELETE_CUSTOM_GESTURE_ACK, message.payload);
      break;
    case WEBSOCKET_EVENTS.PLUGIN_CONFIG_UPDATED:
      const pluginUpdatedPayload = message.payload as {pluginId: string, config: unknown} | undefined;
      if (pluginUpdatedPayload?.pluginId && pluginUpdatedPayload.config !== undefined) {
          actions.setPluginGlobalConfig(
            pluginUpdatedPayload.pluginId,
            pluginUpdatedPayload.config
          );
      }
      break;
    case WEBSOCKET_EVENTS.ERROR:
      const errPayload = message.payload as ErrorPayload;
      this._publishEvent(UI_EVENTS.SHOW_ERROR, { messageKey: `Backend Error (${errPayload?.code || "UNK"}): ${errPayload?.message || "Unknown"}`, type: "error" });
      break;
    case WEBSOCKET_EVENTS.BACKEND_ACTION_RESULT:
      this._publishEvent(WEBSOCKET_EVENTS.BACKEND_ACTION_RESULT, message.payload as ActionResultPayload);
      break;
    case WEBSOCKET_EVENTS.STREAM_STATUS_UPDATE:
      const { pathName, status } = message.payload as StreamStatusPayload;
      if (pathName) actions.setStreamStatus(pathName, status);
      break;
    default:
      console.warn(`[WS MsgHandler] Received unhandled message type: ${message.type}`);
  }
}