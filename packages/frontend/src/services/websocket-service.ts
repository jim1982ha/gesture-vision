// --- packages/frontend/src/services/websocket-service.ts --- (complete version) ---
/* FILE: packages/frontend/src/services/websocket-service.ts */
import { pubsub, WEBSOCKET_EVENTS, type WebSocketMessage, type GestureConfig, type PoseConfig, type ActionDetails } from '#shared/index.js';
import { connectLogic, disconnectLogic, scheduleReconnectLogic, clearReconnectTimerLogic, stopPingTimerLogic } from './websocket/ws-lifecycle.js';
import { handleWsMessageLogic } from './websocket/ws-message-handler.js';

interface PendingRequest<T = unknown> {
  resolve: (value: T) => void;
  reject: (reason?: Error) => void;
  timeoutId: number;
}

export interface WebSocketInternalState {
  ws: WebSocket | null; url: string; reconnectAttempts: number; reconnectTimer: number | null;
  isConnected: boolean; isConnecting: boolean; pingIntervalTimer: number | null;
  pongTimeoutTimer: number | null; lastPingId: number | null;
  pendingRequests: Map<number, PendingRequest<unknown>>; messageQueue: WebSocketMessage<unknown>[];
}

const initializeWsState = (): WebSocketInternalState => ({
  ws: null, url: '', reconnectAttempts: 0, reconnectTimer: null, isConnected: false, isConnecting: false,
  pingIntervalTimer: null, pongTimeoutTimer: null, lastPingId: null, pendingRequests: new Map(), messageQueue: [],
});

class WebSocketServiceImpl {
  _state: WebSocketInternalState = initializeWsState();
  connect = connectLogic.bind(this);
  disconnect = disconnectLogic.bind(this);
  _scheduleReconnect = scheduleReconnectLogic.bind(this);
  _clearReconnectTimer = clearReconnectTimerLogic.bind(this);
  _stopPingTimer = stopPingTimerLogic.bind(this);
  _publishEvent = (eventName: string, data: unknown = null): void => pubsub.publish(eventName, data);
  _publishError = (code: string, message: string): void => {
    console.error(`[WebSocket Error] Code: ${code}, Message: ${message}`);
    pubsub.publish(WEBSOCKET_EVENTS.ERROR, { code, message });
  };
  handleMessage = handleWsMessageLogic.bind(this);

  constructor() {
    // CRITICAL for HA Add-on: Construct WS URL relative to the current Ingress path.
    // Ingress URLs look like: https://ha.domain.com/api/hassio_ingress/TOKEN/
    const { protocol, host, pathname } = window.location;
    
    // Remove 'index.html' or trailing slash from current path
    const basePath = pathname.replace(/\/index\.html$/, '').replace(/\/$/, '');
    
    // Determine WS protocol (wss if https, ws if http)
    const wsProtocol = protocol === 'https:' ? 'wss:' : 'ws:';
    
    // Construct URL: ws://host/api/hassio_ingress/TOKEN/ws/
    this._state.url = `${wsProtocol}//${host}${basePath}/ws/`;
    
    console.log(`[WS] Initialized with URL: ${this._state.url}`);
    this.connect();
  }

  isConnected = (): boolean => this._state.isConnected;
  isConnecting = (): boolean => this._state.isConnecting;
  forceReconnect = (): void => { if (!this._state.isConnecting) { this.disconnect(false, true); this.connect(); } };

  sendMessage(message: WebSocketMessage<unknown>): boolean {
    const { ws, isConnected, messageQueue } = this._state;
    if (ws?.readyState === WebSocket.OPEN && isConnected) {
      try {
        ws.send(JSON.stringify(message));
        return true;
      } catch (error) {
        console.error(`[WS Sender] Error sending ${message.type}:`, (error as Error).message);
        messageQueue.push(message);
        return false;
      }
    }
    messageQueue.push(message);
    if (!this.isConnecting()) this.connect();
    return true;
  }

  request<T>(messageType: string, payload: unknown, timeoutDuration = 5000): Promise<T> {
    const messageId = Date.now() + Math.random();
    return new Promise<T>((resolve, reject) => {
      if (!this.sendMessage({ type: messageType, payload, messageId })) {
        return reject(new Error(`Failed to send or queue ${messageType} message.`));
      }
      const timeoutId = window.setTimeout(() => {
        this._state.pendingRequests.delete(messageId);
        reject(new Error(`Timeout waiting for response to ${messageType} (ID: ${messageId})`));
      }, timeoutDuration);
      this._state.pendingRequests.set(messageId, { resolve, reject, timeoutId } as PendingRequest<unknown>);
    });
  }

  sendDispatchAction(gestureConfig: GestureConfig | PoseConfig, details: ActionDetails): boolean {
    return this.sendMessage({ type: 'DISPATCH_ACTION', payload: { gestureConfig, details } });
  }
}

export const webSocketService = new WebSocketServiceImpl();
export type { WebSocketServiceImpl as WebSocketService };