/* FILE: packages/shared/services/connection-manager.ts */
import WebSocket from 'ws';

const CONNECTION_TIMEOUT_MS = 5000;
const RECONNECT_DELAY_BASE_MS = 1000;
const MAX_RECONNECT_DELAY_MS = 30000;
const MAX_RECONNECT_ATTEMPTS = 3;

interface ConnectionState {
  ws?: WebSocket;
  isConnecting: boolean;
  reconnectAttempts: number;
  connectionPromise?: Promise<WebSocket>;
}

/**
 * Manages a persistent WebSocket connection to a specific URL.
 * Handles automatic reconnection with exponential backoff up to a defined limit.
 * This class is designed to be instantiated by plugins for their specific needs.
 */
export class WebSocketConnectionManager {
  private connections = new Map<string, ConnectionState>();

  /**
   * The single, robust entry point for getting a connection to a specific URL.
   * Manages state to prevent duplicate connection attempts and handles all errors gracefully.
   * @param url The full WebSocket URL to connect to (e.g., 'ws://host:port/path').
   * @param isInternalReconnect A flag to prevent the reconnect counter from resetting during the retry loop.
   */
  public getConnection(url: string, isInternalReconnect = false): Promise<WebSocket> {
    let state = this.connections.get(url);

    if (state?.ws?.readyState === WebSocket.OPEN) {
      return Promise.resolve(state.ws);
    }

    if (state?.connectionPromise) {
      return state.connectionPromise;
    }

    if (!state) {
      state = { isConnecting: false, reconnectAttempts: 0 };
      this.connections.set(url, state);
    }

    if (!isInternalReconnect) {
      state.reconnectAttempts = 0;
    }
    
    state.isConnecting = true;

    const promise = this.attemptConnection(url);
    state.connectionPromise = promise;

    promise
      .then(ws => {
        const currentState = this.connections.get(url);
        if (!currentState) {
          ws.terminate();
          return;
        }

        console.log(`[WS Connection Manager] Connected to ${url}`);
        currentState.ws = ws;
        currentState.isConnecting = false;
        currentState.reconnectAttempts = 0;
        currentState.connectionPromise = undefined;

        ws.on('error', (err) => {
          console.error(`[WS Connection Manager] Persistent connection error for ${url}: ${err.message}`);
          ws.close();
        });

        ws.on('close', () => {
          console.log(`[WS Connection Manager] Persistent connection closed for ${url}`);
          if (currentState.ws === ws) {
            currentState.ws = undefined;
          }
          this.handleDisconnection(url, currentState);
        });
      })
      .catch(err => {
        const currentState = this.connections.get(url);
        if (!currentState) return;

        console.error(`[WS Connection Manager] Connection attempt to ${url} failed:`, (err as Error).message);
        currentState.isConnecting = false;
        currentState.connectionPromise = undefined;

        this.handleDisconnection(url, currentState);
      });

    return promise;
  }

  private attemptConnection(url: string): Promise<WebSocket> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url);
      let isSettled = false;

      const timeout = setTimeout(() => {
        if (!isSettled) {
          cleanupAndReject(new Error(`Connection timed out to ${url}`));
        }
      }, CONNECTION_TIMEOUT_MS);

      const cleanupAndReject = (err: Error) => {
        isSettled = true;
        clearTimeout(timeout);
        ws.removeAllListeners();
        ws.terminate();
        reject(err);
      };

      ws.on('error', (err) => {
        if (!isSettled) {
          cleanupAndReject(err);
        }
      });
      
      ws.on('open', () => {
        if (!isSettled) {
          isSettled = true;
          clearTimeout(timeout);
          ws.removeListener('error', cleanupAndReject);
          ws.removeListener('close', cleanupAndReject);
          resolve(ws);
        }
      });

      ws.on('close', () => {
        if (!isSettled) {
          cleanupAndReject(new Error(`Connection to ${url} closed before opening.`));
        }
      });
    });
  }

  private handleDisconnection(url: string, state: ConnectionState): void {
    if (state.isConnecting || state.connectionPromise) return;

    if (state.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
        console.warn(`[WS Connection Manager] Max reconnect attempts (${MAX_RECONNECT_ATTEMPTS}) reached for ${url}. Giving up.`);
        return;
    }
    
    state.reconnectAttempts++;
    const delay = Math.min(
      RECONNECT_DELAY_BASE_MS * 2 ** (state.reconnectAttempts - 1),
      MAX_RECONNECT_DELAY_MS
    );

    console.log(`[WS Connection Manager] Scheduling reconnect for ${url} in ${delay / 1000}s (attempt ${state.reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS}).`);
    setTimeout(() => this.#backgroundReconnect(url), delay);
  }

  #backgroundReconnect(url: string): void {
    this.getConnection(url, true);
  }
  
  public destroy(): void {
    this.connections.forEach(state => {
      state.ws?.terminate();
    });
    this.connections.clear();
    console.log('[WS Connection Manager] All connections terminated.');
  }
}