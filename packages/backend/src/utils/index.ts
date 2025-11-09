/* FILE: packages/backend/src/utils/index.ts */
import WebSocket from 'ws';
import type { Response } from 'node-fetch';
import type { WebSocketMessage, ErrorMessage, ActionResult } from '#shared/index.js';

// --- WebSocket Response Utilities ---

export async function sendMessageToClient(ws: WebSocket, message: WebSocketMessage<unknown>): Promise<void> {
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
      console.warn(`[WS ResponseUtils] WebSocket not open. Cannot send message type ${message.type}`);
      resolve();
    }
  });
}

export async function sendErrorMessageToClient(ws: WebSocket, code: string, messageText: string, details?: unknown): Promise<void> {
  const errorMessage: ErrorMessage = { type: 'ERROR', payload: { code, message: messageText, details } };
  try {
    await sendMessageToClient(ws, errorMessage);
  } catch (error) {
    console.error(`[WS ResponseUtils] CRITICAL: Failed to send error message (Code: ${code}) to client:`, error);
  }
}

// --- Action Handler Utilities ---

export const createErrorResult = (message: string, details?: unknown): ActionResult => ({ success: false, message, details });
export const createSuccessResult = (message: string, details?: unknown): ActionResult => ({ success: true, message, details });

export interface RetryableActionConfig<TResponseDetails> {
  actionFn: () => Promise<{ response: Response; responseBody: TResponseDetails | string | null; }>;
  isRetryableError?: (error: unknown, response?: Response) => boolean;
  maxRetries: number;
  initialDelayMs: number;
  actionName: string;
}

export async function executeWithRetry<TResponseDetails = unknown>(config: RetryableActionConfig<TResponseDetails>): Promise<ActionResult> {
  const { actionFn, isRetryableError, maxRetries, initialDelayMs, actionName } = config;
  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    try {
      const { response, responseBody } = await actionFn();
      if (!response.ok) {
        const errorMsgContent = typeof responseBody === 'string' ? responseBody : responseBody ? JSON.stringify(responseBody) : response.statusText;
        const errorMessage = `${actionName} Error (${response.status}): ${errorMsgContent}`;
        const defaultRetryable = response.status >= 500 && response.status <= 599;
        const customRetryable = isRetryableError ? isRetryableError(null, response) : defaultRetryable;
        if (!customRetryable || attempt > maxRetries) {
          return { success: false, message: errorMessage, details: responseBody };
        }
        await new Promise((resolve) => setTimeout(resolve, initialDelayMs * Math.pow(2, attempt - 1)));
        continue;
      }
      return { success: true, message: `${actionName} successful.`, details: responseBody };
    } catch (error: unknown) {
      const typedError = error as Error;
      const errorMessage = `${actionName} Network/Fetch Error: ${typedError.message || String(error)}`;
      const customRetryable = isRetryableError ? isRetryableError(error, undefined) : true;
      if (!customRetryable || attempt > maxRetries) {
        return { success: false, message: errorMessage, details: { errorName: typedError.name, message: typedError.message } };
      }
      await new Promise((resolve) => setTimeout(resolve, initialDelayMs * Math.pow(2, attempt - 1)));
    }
  }
  return { success: false, message: `${actionName} failed after all retries.`, details: { errorName: 'MaxRetriesExceeded', reason: 'Max retries reached' } };
}