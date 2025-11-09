/* FILE: packages/frontend/src/services/websocket/ws-lifecycle.ts */
import { WEBSOCKET_EVENTS, UI_EVENTS } from "#shared/index.js";
import type { WebSocketMessage } from "#shared/index.js";
import { handleWsMessageLogic } from "./ws-message-handler.js";
import type { WebSocketService } from "../websocket-service.js";
import { appStore } from '#frontend/core/state/app-store.js';

const RECONNECT_INTERVAL_MIN = 1000, RECONNECT_INTERVAL_MAX = 30000;
const MAX_RECONNECT_ATTEMPTS = 10;
const PING_INTERVAL = 25000, PONG_TIMEOUT = 5000;

function attachWsEventListeners(this: WebSocketService): void {
  const ws = this._state.ws;
  if (!ws) { console.error("[WS] Cannot attach listeners: WS instance is null."); return; }
  ws.onopen = handleWsOpen.bind(this);
  ws.onmessage = (event: MessageEvent) => handleWsMessageLogic.call(this, event.data);
  ws.onclose = handleWsClose.bind(this);
  ws.onerror = handleWsError.bind(this);
}

function removeWsEventListeners(this: WebSocketService, wsInstance: WebSocket | null): void {
  if (wsInstance) { wsInstance.onopen = wsInstance.onmessage = wsInstance.onclose = wsInstance.onerror = null; }
}

function handleWsOpen(this: WebSocketService, event: Event): void {
  if (this._state.ws !== event.target) return;
  const state = this._state;
  state.isConnected = true; state.isConnecting = false; state.reconnectAttempts = 0;
  appStore.getState().actions.setWsConnectionStatus(true);
  this._publishEvent(WEBSOCKET_EVENTS.CONNECTED);
  startPingTimer.call(this);
  if (state.messageQueue.length > 0) {
    console.log(`[WS] Connection restored. Sending ${state.messageQueue.length} queued messages.`);
    state.messageQueue.forEach(msg => this.sendMessage(msg));
    state.messageQueue = [];
  }
}

function handleWsClose(this: WebSocketService, event: CloseEvent): void {
  if (this._state.ws !== event.target) return;
  this.disconnect(true, false);
  if (event.code !== 1000 && this._state.reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
    scheduleReconnectLogic.call(this);
  } else if (this._state.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
    this._publishEvent(UI_EVENTS.SHOW_ERROR, { messageKey: "wsMaxReconnects", type: "error" });
  }
}

function handleWsError(this: WebSocketService, errorEvent: Event): void {
  if (this._state.ws !== errorEvent.target) return;
  const message = errorEvent instanceof ErrorEvent ? errorEvent.message : `WebSocket error event type: ${errorEvent.type}`;
  this._publishError("WS_GENERIC_ERROR", `WebSocket error: ${message}`);
  if (this._state.isConnecting) this._state.isConnecting = false;
}

function startPingTimer(this: WebSocketService): void {
  stopPingTimerLogic.call(this);
  this._state.pingIntervalTimer = window.setInterval(() => {
    const { ws, lastPingId } = this._state;
    if (ws?.readyState !== WebSocket.OPEN) { stopPingTimerLogic.call(this); return; }
    if (lastPingId !== null) { handlePongTimeout.call(this); return; }
    
    const pingId = Date.now();
    this._state.lastPingId = pingId;
    try {
      ws.send(JSON.stringify({ type: "ping", payload: { id: pingId } }));
      this._state.pongTimeoutTimer = window.setTimeout(() => handlePongTimeout.call(this), PONG_TIMEOUT);
    } catch (error) {
      this._publishError("WS_SEND_ERROR", `Failed to send PING: ${(error as Error).message}`);
      this.disconnect(true);
    }
  }, PING_INTERVAL);
}

function handlePongTimeout(this: WebSocketService): void {
  console.warn(`[WS] Pong not received in time. Disconnecting.`);
  this._state.lastPingId = null;
  this.disconnect(true);
}

export function handlePongLogic(this: WebSocketService, pongMessage: WebSocketMessage<{ id?: number | string | null }>): void {
  const receivedId = pongMessage?.payload?.id ?? null;
  if (receivedId !== null && receivedId === this._state.lastPingId) {
    clearPongTimeoutLogic.call(this);
    this._state.lastPingId = null;
  }
}

function clearPongTimeoutLogic(this: WebSocketService): void {
  if (this._state.pongTimeoutTimer) clearTimeout(this._state.pongTimeoutTimer);
  this._state.pongTimeoutTimer = null;
}

export function stopPingTimerLogic(this: WebSocketService): void {
  if (this._state.pingIntervalTimer) clearInterval(this._state.pingIntervalTimer);
  this._state.pingIntervalTimer = null;
  clearPongTimeoutLogic.call(this);
  this._state.lastPingId = null;
}

export function connectLogic(this: WebSocketService): void {
  const { isConnecting, ws } = this._state;
  if (isConnecting || ws?.readyState === WebSocket.OPEN) return;
  
  this._state.isConnecting = true;
  this._publishEvent(WEBSOCKET_EVENTS.CONNECTING);
  clearReconnectTimerLogic.call(this);
  if (ws) this.disconnect(false, false);

  try {
    this._state.ws = new WebSocket(this._state.url);
    attachWsEventListeners.call(this);
  } catch (error) {
    this._state.isConnecting = false;
    this._state.ws = null;
    this._publishError("WS_INIT_FAILED", `Failed to create WebSocket: ${(error as Error).message}`);
    scheduleReconnectLogic.call(this);
  }
}

export function disconnectLogic(this: WebSocketService, allowReconnect = true, resetReconnectAttempts = false): void {
  const wsToClose = this._state.ws;
  
  stopPingTimerLogic.call(this);
  clearReconnectTimerLogic.call(this);
  
  this._state.pendingRequests.forEach(req => req.reject(new Error("WebSocket disconnected.")));
  this._state.pendingRequests.clear();
  
  this._state.isConnected = false;
  this._state.isConnecting = false;
  this._state.ws = null;
  appStore.getState().actions.setWsConnectionStatus(false);
  this._publishEvent(WEBSOCKET_EVENTS.DISCONNECTED);

  if (resetReconnectAttempts) this._state.reconnectAttempts = 0;
  if (!allowReconnect) this._state.reconnectAttempts = MAX_RECONNECT_ATTEMPTS + 1;

  if (wsToClose) {
    removeWsEventListeners.call(this, wsToClose);
    if (wsToClose.readyState < WebSocket.CLOSING) {
      try { wsToClose.close(1000, "Client initiated disconnect"); } catch { /* no-op */ }
    }
  }
}

export function scheduleReconnectLogic(this: WebSocketService): void {
  clearReconnectTimerLogic.call(this);
  if (this._state.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS || this._state.isConnecting) return;
  
  const delay = Math.min(RECONNECT_INTERVAL_MIN * 2 ** this._state.reconnectAttempts, RECONNECT_INTERVAL_MAX);
  this._state.reconnectAttempts++;
  console.log(`[WS] Scheduling reconnect attempt #${this._state.reconnectAttempts} in ${delay / 1000}s.`);
  this._state.reconnectTimer = window.setTimeout(() => {
    this._state.reconnectTimer = null;
    this.connect();
  }, delay);
}

export function clearReconnectTimerLogic(this: WebSocketService): void {
  if (this._state.reconnectTimer) {
    clearTimeout(this._state.reconnectTimer);
    this._state.reconnectTimer = null;
  }
}