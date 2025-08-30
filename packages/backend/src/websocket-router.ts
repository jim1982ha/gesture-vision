/* FILE: packages/backend/src/websocket-router.ts */
import type WebSocket from 'ws';

import { WEBSOCKET_EVENTS, type WebSocketMessage } from "#shared/index.js";

import { dispatchActionHandler, rtspConnectRequestHandler, rtspDisconnectRequestHandler } from "./websocket-handlers/core-handlers.js";
import { getPluginGlobalConfigHandler, patchConfigHandler, patchPluginGlobalConfigHandler } from "./websocket-handlers/config-message-handler.js";
import { deleteCustomGestureHandler, getCustomGesturesMetadataHandler, updateCustomGestureHandler, uploadCustomGestureHandler } from "./websocket-handlers/custom-gesture-message-handler.js";
import type { HandlerDependencies } from './websocket-handlers/handler-dependencies.type.js';
import { sendMessageToClient, sendErrorMessageToClient } from "./websocket-handlers/ws-response-utils.js";

type MessageHandler = (ws: WebSocket, message: WebSocketMessage<unknown>, dependencies: HandlerDependencies) => Promise<void>;

async function pingHandler(ws: WebSocket, message: WebSocketMessage<unknown>): Promise<void> {
    const payload = message.payload as { id?: number | string | null } | null;
    await sendMessageToClient(ws, { type: 'pong', payload: { id: payload?.id ?? null } });
}

export class WebSocketRouter {
    #handlers = new Map<string, MessageHandler>();
    #dependencies: HandlerDependencies;

    constructor(dependencies: HandlerDependencies) {
        this.#dependencies = dependencies;
        this.#registerHandlers();
    }

    #registerHandlers(): void {
        const handlers: Record<string, MessageHandler> = {
            "ping": pingHandler,
            "GET_FULL_CONFIG": async (ws) => {
                if (this.#dependencies.configService) {
                    const config = await this.#dependencies.configService.getFullConfig();
                    await sendMessageToClient(ws, { type: WEBSOCKET_EVENTS.FULL_CONFIG_UPDATE, payload: { config } });
                }
            },
            "PATCH_CONFIG": patchConfigHandler,
            "GET_PLUGIN_GLOBAL_CONFIG": getPluginGlobalConfigHandler,
            "PATCH_PLUGIN_GLOBAL_CONFIG": patchPluginGlobalConfigHandler,
            "DISPATCH_ACTION": dispatchActionHandler,
            [WEBSOCKET_EVENTS.GET_CUSTOM_GESTURES_METADATA]: getCustomGesturesMetadataHandler,
            [WEBSOCKET_EVENTS.UPLOAD_CUSTOM_GESTURE]: uploadCustomGestureHandler,
            [WEBSOCKET_EVENTS.UPDATE_CUSTOM_GESTURE]: updateCustomGestureHandler,
            [WEBSOCKET_EVENTS.DELETE_CUSTOM_GESTURE]: deleteCustomGestureHandler,
            [WEBSOCKET_EVENTS.RTSP_CONNECT_REQUEST]: rtspConnectRequestHandler,
            [WEBSOCKET_EVENTS.RTSP_DISCONNECT_REQUEST]: rtspDisconnectRequestHandler,
        };
        for (const [type, handler] of Object.entries(handlers)) {
            this.#handlers.set(type, handler);
        }
    }

    public async route(ws: WebSocket, message: WebSocketMessage<unknown>): Promise<void> {
        const handler = this.#handlers.get(message.type);
        if (handler) {
            try {
                await handler(ws, message, this.#dependencies);
            } catch (error: unknown) {
                const msg = error instanceof Error ? error.message : String(error);
                console.error(`[WebSocketRouter] Error processing '${message.type}':`, msg, error);
                await sendErrorMessageToClient(ws, "PROCESSING_ERROR", `Error processing message: ${msg}`);
            }
        } else {
            console.warn(`[WebSocketRouter] Unhandled message type: ${message.type}`);
            await sendErrorMessageToClient(ws, "UNKNOWN_TYPE", `Unknown message type: ${message.type}`);
        }
    }
}