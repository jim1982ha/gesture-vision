/* FILE: packages/backend/src/websocket-handlers/ws-response-utils.ts */
import WebSocket from 'ws';

import type { WebSocketMessage, ErrorMessage } from '#shared/types/index.js';

export async function sendMessageToClient(
  ws: WebSocket,
  message: WebSocketMessage<unknown>
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (ws.readyState === WebSocket.OPEN) {
      const messageString = JSON.stringify(message);
      ws.send(messageString, (err) => {
        if (err) {
          console.error('[WS ResponseUtils] Error sending message:', err, message.type);
          reject(err);
        } else {
          resolve();
        }
      });
    } else {
      console.warn(
        `[WS ResponseUtils] WebSocket not open. Cannot send message type ${message.type}`
      );
      resolve();
    }
  });
}

export async function sendErrorMessageToClient(
  ws: WebSocket,
  code: string,
  messageText: string,
  details?: unknown
): Promise<void> {
  const errorMessage: ErrorMessage = {
    type: 'ERROR',
    payload: { code, message: messageText, details },
  };
  try {
    await sendMessageToClient(ws, errorMessage);
  } catch (error) {
    console.error(
      `[WS ResponseUtils] CRITICAL: Failed to send error message (Code: ${code}) to client:`,
      error
    );
  }
}