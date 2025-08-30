/* FILE: packages/frontend/src/services/websocket-service.ts */
// Main service for WebSocket communication with the backend.
import { pubsub } from '#shared/core/pubsub.js';
import { WEBSOCKET_EVENTS } from '#shared/index.js';
import {
  connectLogic,
  disconnectLogic,
  scheduleReconnectLogic,
  clearReconnectTimerLogic,
  stopPingTimerLogic,
} from './websocket/ws-lifecycle.js';
import { handleWsMessageLogic } from './websocket/ws-message-handler.js';
import type {
  WebSocketMessage,
  GestureConfig,
  PoseConfig,
  ActionDetails,
} from '#shared/index.js';

// --- State & Pending Request Types ---
interface PendingRequest<T = unknown> {
  resolve: (value: T) => void;
  reject: (reason?: Error) => void;
  timeoutId: number;
}
export interface WebSocketInternalState {
  ws: WebSocket | null;
  url: string;
  apiBaseUrl: string;
  reconnectAttempts: number;
  reconnectTimer: number | null;
  isConnected: boolean;
  isConnecting: boolean;
  pingIntervalTimer: number | null;
  pongTimeoutTimer: number | null;
  lastPingId: number | null;
  pendingRequests: Map<number, PendingRequest<unknown>>;
}
function initializeWsState(): WebSocketInternalState {
  return {
    ws: null,
    url: '',
    apiBaseUrl: '',
    reconnectAttempts: 0,
    reconnectTimer: null,
    isConnected: false,
    isConnecting: false,
    pingIntervalTimer: null,
    pongTimeoutTimer: null,
    lastPingId: null,
    pendingRequests: new Map(),
  };
}
function initializeUrlLogic(this: { _state: WebSocketInternalState }): void {
  const { protocol, host } = window.location;
  const wsProtocol = protocol === 'https:' ? 'wss:' : 'ws:';
  this._state.url = `${wsProtocol}//${host}/ws/`;
  this._state.apiBaseUrl = window.location.origin;
}
function publishEventLogic(eventName: string, data: unknown = null): void {
  pubsub.publish(eventName, data);
}
function publishErrorLogic(code: string, message: string): void {
  console.error(`[WebSocket Error] Code: ${code}, Message: ${message}`);
  pubsub.publish(WEBSOCKET_EVENTS.ERROR, { code, message });
}

// --- WebSocket Service Implementation ---
class WebSocketServiceImpl {
  _state: WebSocketInternalState = initializeWsState();

  _initializeUrl = initializeUrlLogic.bind(this);
  connect = connectLogic.bind(this);
  disconnect = disconnectLogic.bind(this);
  _scheduleReconnect = scheduleReconnectLogic.bind(this);
  _clearReconnectTimer = clearReconnectTimerLogic.bind(this);
  _stopPingTimer = stopPingTimerLogic.bind(this);
  _publishEvent = publishEventLogic;
  _publishError = publishErrorLogic;

  constructor() {
    this._initializeUrl();
    this.connect();
    (this as unknown as { handleMessage: unknown }).handleMessage =
      handleWsMessageLogic.bind(this);
  }

  isConnected = (): boolean => this._state.isConnected;
  isConnecting = (): boolean => this._state.isConnecting;
  forceReconnect = (): void => {
    if (!this._state.isConnecting) {
      this.disconnect(false, true);
      this.connect();
    }
  };

  sendMessage(message: WebSocketMessage<unknown>): boolean {
    const { ws, isConnected } = this._state;
    if (ws && ws.readyState === WebSocket.OPEN && isConnected) {
      try {
        ws.send(JSON.stringify(message));
        return true;
      } catch (error: unknown) {
        console.error(
          `[WS Sender] Error sending ${message.type}:`,
          (error as Error).message
        );
        return false;
      }
    } else {
      console.warn(
        `[WS Sender] Cannot send ${message?.type}, WS not open/ready.`
      );
      return false;
    }
  }

  request<T>(
    messageType: string,
    payload: unknown,
    timeoutDuration = 5000
  ): Promise<T> {
    const messageId = Date.now() + Math.random();
    return new Promise<T>((resolve, reject) => {
      if (!this.sendMessage({ type: messageType, payload, messageId })) {
        return reject(new Error(`Failed to send ${messageType} message.`));
      }
      const timeoutId = window.setTimeout(() => {
        this._state.pendingRequests.delete(messageId);
        reject(
          new Error(
            `Timeout waiting for response to ${messageType} (ID: ${messageId})`
          )
        );
      }, timeoutDuration);
      const pendingRequest: PendingRequest<T> = { resolve, reject, timeoutId };
      this._state.pendingRequests.set(
        messageId,
        pendingRequest as PendingRequest<unknown>
      );
    });
  }

  sendDispatchAction(
    gestureConfig: GestureConfig | PoseConfig,
    details: ActionDetails
  ): boolean {
    return this.sendMessage({
      type: 'DISPATCH_ACTION',
      payload: { gestureConfig, details },
    });
  }
}

export const webSocketService = new WebSocketServiceImpl();
export type { WebSocketServiceImpl as WebSocketService };