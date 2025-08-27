/* FILE: packages/frontend/src/services/websocket/ws-lifecycle.ts */
// Manages the WebSocket lifecycle: connection, events, ping/pong, and reconnection.
import { WEBSOCKET_EVENTS, UI_EVENTS } from "#shared/constants/index.js";
import type { WebSocketMessage } from "#shared/types/index.js"; 
import { handleWsMessageLogic } from "./ws-message-handler.js";
import type { WebSocketService } from "../websocket-service.js";

const RECONNECT_INTERVAL_MIN = 1000;
const RECONNECT_INTERVAL_MAX = 30000;
const MAX_RECONNECT_ATTEMPTS = 10;
const PING_INTERVAL = 30 * 1000;
const PONG_TIMEOUT = 10000;

// --- Connection Management ---
export function connectLogic(this: WebSocketService): void {
  const state = this._state;
  if (state.isConnecting || (state.ws && state.ws.readyState === WebSocket.OPEN)) return;

  state.isConnecting = true;
  this._publishEvent(WEBSOCKET_EVENTS.CONNECTING);
  clearReconnectTimerLogic.call(this);

  if (state.ws) this.disconnect(false, false);

  try {
    state.ws = new WebSocket(state.url);
    attachWsEventListenersLogic.call(this);
  } catch (error: unknown) {
    console.error("[WS Connect] Failed to create WebSocket:", error);
    state.isConnecting = false; state.ws = null;
    this._publishError("WS_INIT_FAILED", `Failed to create WebSocket: ${(error as Error).message}`);
    scheduleReconnectLogic.call(this);
  }
}

export function disconnectLogic(this: WebSocketService, allowReconnect = true, resetGlobalReconnectAttempts = false): void {
  const wsToClose = this._state.ws;
  const wasConnected = this._state.isConnected;

  stopPingTimerLogic.call(this); clearReconnectTimerLogic.call(this);
  this._state.isConnected = false; this._state.isConnecting = false;
  this._state.ws = null;

  if (resetGlobalReconnectAttempts) this._state.reconnectAttempts = 0;
  if (!allowReconnect) this._state.reconnectAttempts = MAX_RECONNECT_ATTEMPTS + 1;

  if (wsToClose) {
    removeWsEventListenersLogic.call(this, wsToClose);
    if (wsToClose.readyState === WebSocket.OPEN || wsToClose.readyState === WebSocket.CONNECTING) {
      try { wsToClose.close(1000, "Client initiated disconnect"); } catch (_e) { /* Ignored */ }
    }
  }
  if (wasConnected) this._publishEvent(WEBSOCKET_EVENTS.DISCONNECTED);
}

// --- Event Handlers ---
function attachWsEventListenersLogic(this: WebSocketService): void {
  if (!this._state.ws) { console.error("[WS Events] Cannot attach listeners: WS instance is null."); return; }
  this._state.ws.onopen = handleWsOpenLogic.bind(this);
  this._state.ws.onmessage = (event: MessageEvent) => handleWsMessageLogic.call(this, event.data);
  this._state.ws.onclose = handleWsCloseLogic.bind(this);
  this._state.ws.onerror = handleWsErrorLogic.bind(this);
}

function removeWsEventListenersLogic(this: WebSocketService, wsInstance: WebSocket | null): void {
  if (wsInstance) { wsInstance.onopen = wsInstance.onmessage = wsInstance.onclose = wsInstance.onerror = null; }
}

function handleWsOpenLogic(this: WebSocketService, event: Event): void {
  if (!this._state.ws || this._state.ws !== event.target) return;
  this._state.isConnected = true; this._state.isConnecting = false; this._state.reconnectAttempts = 0;
  this._publishEvent(WEBSOCKET_EVENTS.CONNECTED);
  startPingTimerLogic.call(this);
}

function handleWsCloseLogic(this: WebSocketService, event: CloseEvent): void {
  const wasConnected = this._state.isConnected;
  if (this._state.ws === event.target) {
    this.disconnect(true, false);
  }
  if (wasConnected) this._publishEvent(WEBSOCKET_EVENTS.DISCONNECTED);
  if (event.code !== 1000 && this._state.reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
    scheduleReconnectLogic.call(this);
  } else if (this._state.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
    this._publishEvent(UI_EVENTS.SHOW_ERROR, { messageKey: "wsMaxReconnects", type: "error" });
  }
}

function handleWsErrorLogic(this: WebSocketService, errorEvent: Event): void {
  if (!this._state.ws || this._state.ws !== errorEvent.target) return;
  const message = errorEvent instanceof ErrorEvent ? errorEvent.message : `WebSocket error event type: ${errorEvent.type}`;
  this._publishError("WS_GENERIC_ERROR", `WebSocket error: ${message}`);
  if (this._state.isConnecting) this._state.isConnecting = false;
}

// --- Ping/Pong Keepalive ---
function startPingTimerLogic(this: WebSocketService): void {
  stopPingTimerLogic.call(this); 
  this._state.pingIntervalTimer = window.setInterval(() => {
    const state = this._state;
    if (state.ws && state.ws.readyState === WebSocket.OPEN) {
      const pingId = Date.now(); 
      state.lastPingId = pingId;
      try {
        state.ws.send(JSON.stringify({ type: "ping", payload: { id: pingId } }));
        startPongTimeoutLogic.call(this); 
      } catch (error: unknown) {
        this._publishError("WS_SEND_ERROR", `Failed to send PING: ${(error as Error).message}`);
        state.lastPingId = null; this.disconnect(true); 
      }
    } else { stopPingTimerLogic.call(this); }
  }, PING_INTERVAL);
}

export function stopPingTimerLogic(this: WebSocketService): void {
  if (this._state.pingIntervalTimer) clearInterval(this._state.pingIntervalTimer);
  this._state.pingIntervalTimer = null;
  clearPongTimeoutLogic.call(this); this._state.lastPingId = null; 
}

function startPongTimeoutLogic(this: WebSocketService): void {
  clearPongTimeoutLogic.call(this); 
  this._state.pongTimeoutTimer = window.setTimeout(() => handlePongTimeoutLogic.call(this), PONG_TIMEOUT);
}

function clearPongTimeoutLogic(this: WebSocketService): void {
  if (this._state.pongTimeoutTimer) clearTimeout(this._state.pongTimeoutTimer);
  this._state.pongTimeoutTimer = null;
}

export function handlePongLogic(this: WebSocketService, pongMessage: WebSocketMessage<{id?: number | string | null}>): void {
  const receivedId = pongMessage?.payload?.id ?? null; 
  if (receivedId !== null && receivedId === this._state.lastPingId) {
    clearPongTimeoutLogic.call(this); this._state.lastPingId = null; 
  }
}

function handlePongTimeoutLogic(this: WebSocketService): void {
  this._state.lastPingId = null; this.disconnect(true); 
}

// --- Reconnection Logic ---
export function scheduleReconnectLogic(this: WebSocketService): void {
  clearReconnectTimerLogic.call(this); 

  if (this._state.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
    console.error(`[WebSocket Reconnect] Max reconnect attempts (${MAX_RECONNECT_ATTEMPTS}) reached. Giving up.`);
    return; 
  }

  if (this._state.isConnecting) { return; }

  const delay = Math.min( RECONNECT_INTERVAL_MIN * 2 ** this._state.reconnectAttempts, RECONNECT_INTERVAL_MAX );
  this._state.reconnectAttempts++; 
  console.log(`[WebSocket Reconnect] Scheduling attempt #${this._state.reconnectAttempts} in ${delay / 1000}s.`);
  this._state.reconnectTimer = window.setTimeout(() => { this._state.reconnectTimer = null; this.connect(); }, delay);
}

export function clearReconnectTimerLogic(this: WebSocketService): void {
  if (this._state.reconnectTimer) {
    clearTimeout(this._state.reconnectTimer);
    this._state.reconnectTimer = null;
  }
}
