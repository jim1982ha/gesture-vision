/* FILE: packages/frontend/src/services/websocket/ws-message-handler.ts */
import { UI_EVENTS, WEBSOCKET_EVENTS } from "#shared/index.js";
import { handlePongLogic } from "./ws-lifecycle.js";
import { appStore, type AppStoreActionsWithHydration } from '#frontend/core/state/app-store.js';

import type { WebSocketMessage, ErrorPayload, ActionResultPayload, StreamStatusPayload, InitialStatePayload, CustomGestureMetadata, FullConfiguration, PluginManifest, ConfigPatchAckPayload, UploadCustomGestureAckPayload, UpdateCustomGestureAckPayload, DeleteCustomGestureAckPayload, PluginTestConnectionResultPayload } from "#shared/index.js";
import type { WebSocketService } from "../websocket-service.js";
import { pubsub } from "#shared/core/pubsub.js";

type PendingRequestPayload = ConfigPatchAckPayload | { pluginId: string, config: unknown } | PluginTestConnectionResultPayload | UpdateCustomGestureAckPayload | UploadCustomGestureAckPayload | { pathName: string };

const PENDING_REQUEST_RESPONSE_TYPES: string[] = [
    WEBSOCKET_EVENTS.PLUGIN_GLOBAL_CONFIG_DATA,
    WEBSOCKET_EVENTS.PLUGIN_CONFIG_PATCH_ACK,
    WEBSOCKET_EVENTS.PLUGIN_TEST_CONNECTION_RESULT,
    WEBSOCKET_EVENTS.CONFIG_SAVE_RESULT,
    WEBSOCKET_EVENTS.BACKEND_UPDATE_CUSTOM_GESTURE_ACK,
    WEBSOCKET_EVENTS.BACKEND_UPLOAD_CUSTOM_GESTURE_ACK,
    WEBSOCKET_EVENTS.RTSP_CONNECT_READY,
];

export function handleWsMessageLogic(this: WebSocketService, rawData: string | ArrayBuffer | Blob): void {
  let message: WebSocketMessage<unknown>;
  try {
    message = JSON.parse(typeof rawData === 'string' ? rawData : new TextDecoder().decode(rawData as ArrayBuffer));
  } catch (error) {
    this._publishError("WS_MSG_PARSE_ERR", `Parse error: ${(error as Error).message}`);
    return;
  }

  if (message.type === "pong") {
    handlePongLogic.call(this, message as WebSocketMessage<{ id?: number | string | null }>);
    return;
  }

  if (message.messageId && this._state.pendingRequests.has(message.messageId)) {
    const request = this._state.pendingRequests.get(message.messageId)!;
    clearTimeout(request.timeoutId);
    this._state.pendingRequests.delete(message.messageId);

    if (PENDING_REQUEST_RESPONSE_TYPES.includes(message.type)) {
        request.resolve(message.payload as PendingRequestPayload);
    } else {
        const errorMsg = `Unexpected response type ${message.type} for request ID ${message.messageId}`;
        console.warn(`[WS MsgHandler] ${errorMsg}. Rejecting promise.`);
        request.reject(new Error(errorMsg));
    }
    return;
  }
  
  const { actions } = appStore.getState();

  switch (message.type) {
    case WEBSOCKET_EVENTS.INITIAL_STATE:
      (actions as AppStoreActionsWithHydration).setInitialState(message.payload as InitialStatePayload);
      // --- MODIFICATION: Signal that the initial state has been loaded ---
      pubsub.publish(UI_EVENTS.INITIAL_STATE_LOADED);
      break;
    case WEBSOCKET_EVENTS.FULL_CONFIG_UPDATE: actions.setFullConfig((message.payload as { config: FullConfiguration }).config); break;
    case WEBSOCKET_EVENTS.PLUGINS_MANIFESTS_UPDATED: actions.setPluginManifests((message.payload as { manifests: PluginManifest[] }).manifests); break;
    case WEBSOCKET_EVENTS.BACKEND_CUSTOM_GESTURES_METADATA_LIST: actions.setCustomGestureMetadata((message.payload as { definitions: CustomGestureMetadata[] }).definitions); break;
    case WEBSOCKET_EVENTS.BACKEND_UPLOAD_CUSTOM_GESTURE_ACK: this._publishEvent(message.type, message.payload as UploadCustomGestureAckPayload); break;
    case WEBSOCKET_EVENTS.BACKEND_DELETE_CUSTOM_GESTURE_ACK: this._publishEvent(message.type, message.payload as DeleteCustomGestureAckPayload); break;
    case WEBSOCKET_EVENTS.PLUGIN_CONFIG_UPDATED: {
      const { pluginId, config } = message.payload as { pluginId: string; config: unknown };
      if (pluginId && config !== undefined) actions.setPluginGlobalConfig(pluginId, config);
      break;
    }
    case WEBSOCKET_EVENTS.ERROR: {
      const { code, message: msgText } = message.payload as ErrorPayload;
      this._publishEvent(UI_EVENTS.SHOW_ERROR, { messageKey: `Backend Error (${code || "UNK"}): ${msgText || "Unknown"}`, type: "error" });
      break;
    }
    case WEBSOCKET_EVENTS.BACKEND_ACTION_RESULT: actions.handleBackendActionResult(message.payload as ActionResultPayload); break;
    case WEBSOCKET_EVENTS.STREAM_STATUS_UPDATE: {
      const { pathName, status } = message.payload as StreamStatusPayload;
      if (pathName) actions.setStreamStatus(pathName, status);
      break;
    }
    default: console.warn(`[WS MsgHandler] Received unhandled broadcast message type: ${message.type}`);
  }
}