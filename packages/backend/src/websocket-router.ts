/* FILE: packages/backend/src/websocket-router.ts */
import type WebSocket from 'ws';

import { WEBSOCKET_EVENTS } from "#shared/constants/index.js";
import type { WebSocketMessage } from "#shared/types/index.js";

import { dispatchActionHandler, rtspConnectRequestHandler, rtspDisconnectRequestHandler } from "./websocket-handlers/core-handlers.js";
import { getPluginGlobalConfigHandler, patchConfigHandler, patchPluginGlobalConfigHandler } from "./websocket-handlers/config-message-handler.js";
import { deleteCustomGestureHandler, getCustomGesturesMetadataHandler, updateCustomGestureHandler, uploadCustomGestureHandler } from "./websocket-handlers/custom-gesture-message-handler.js";
import { type HandlerDependencies } from './websocket-handlers/handler-dependencies.type.js';
import { sendMessageToClient, sendErrorMessageToClient } from "./websocket-handlers/ws-response-utils.js";

type MessageHandler = (ws: WebSocket, message: WebSocketMessage<unknown>, dependencies: HandlerDependencies) => Promise<void>;

async function pingHandler(ws: WebSocket, message: WebSocketMessage<unknown>): Promise<void> {
    const payload = message.payload as { id?: number | string | null } | null;
    const pingId = payload?.id ?? null;
    await sendMessageToClient(ws, { type: 'pong', payload: { id: pingId } });
}

export class WebSocketRouter {
    #handlers = new Map<string, MessageHandler>();
    #dependencies: HandlerDependencies;

    constructor(dependencies: HandlerDependencies) {
        this.#dependencies = dependencies;
        this.#registerHandlers();
    }

    #registerHandlers(): void {
        this.#handlers.set("ping", pingHandler);
        this.#handlers.set("GET_FULL_CONFIG", async (ws: WebSocket) => {
            if (this.#dependencies.configService) {
                const config = await this.#dependencies.configService.getFullConfig();
                await ws.send(JSON.stringify({ type: WEBSOCKET_EVENTS.FULL_CONFIG_UPDATE, payload: { config } }));
            }
        });
        this.#handlers.set("PATCH_CONFIG", patchConfigHandler);
        this.#handlers.set("GET_PLUGIN_GLOBAL_CONFIG", getPluginGlobalConfigHandler);
        this.#handlers.set("PATCH_PLUGIN_GLOBAL_CONFIG", patchPluginGlobalConfigHandler);
        this.#handlers.set("DISPATCH_ACTION", dispatchActionHandler);
        this.#handlers.set(WEBSOCKET_EVENTS.GET_CUSTOM_GESTURES_METADATA, getCustomGesturesMetadataHandler);
        this.#handlers.set(WEBSOCKET_EVENTS.UPLOAD_CUSTOM_GESTURE, uploadCustomGestureHandler);
        this.#handlers.set(WEBSOCKET_EVENTS.UPDATE_CUSTOM_GESTURE, updateCustomGestureHandler);
        this.#handlers.set(WEBSOCKET_EVENTS.DELETE_CUSTOM_GESTURE, deleteCustomGestureHandler);
        this.#handlers.set(WEBSOCKET_EVENTS.RTSP_CONNECT_REQUEST, rtspConnectRequestHandler);
        this.#handlers.set(WEBSOCKET_EVENTS.RTSP_DISCONNECT_REQUEST, rtspDisconnectRequestHandler);
    }

    public async route(ws: WebSocket, message: WebSocketMessage<unknown>): Promise<void> {
        const handler = this.#handlers.get(message.type);

        if (handler) {
            try {
                await handler(ws, message, this.#dependencies);
            } catch (error: unknown) {
                const msg = error instanceof Error ? error.message : String(error);
                console.error(`[WebSocketRouter] Error processing message type '${message.type}':`, msg, error);
                await sendErrorMessageToClient(ws, "PROCESSING_ERROR", `Error processing message: ${msg}`);
            }
        } else {
            console.warn(`[WebSocketRouter] Unhandled message type: ${message.type}`);
            await sendErrorMessageToClient(ws, "UNKNOWN_TYPE", `Unknown message type: ${message.type}`);
        }
    }
}
