/* FILE: packages/backend/src/utils/action-helpers.ts */
// Utility functions for backend action handlers.

import type { ActionResult } from '#shared/types/index.js';

export const createErrorResult = (
  message: string,
  details?: unknown
): ActionResult => ({ success: false, message, details });
export const createSuccessResult = (
  message: string,
  details?: unknown
): ActionResult => ({ success: true, message, details });

export interface RetryableActionConfig<TResponseDetails> {
  actionFn: () => Promise<{
    response: Response;
    responseBody: TResponseDetails | string | null;
  }>;
  isRetryableError?: (error: unknown, response?: Response) => boolean;
  maxRetries: number;
  initialDelayMs: number;
  actionName: string;
}

export async function executeWithRetry<TResponseDetails = unknown>(
  config: RetryableActionConfig<TResponseDetails>
): Promise<ActionResult> {
  const { actionFn, isRetryableError, maxRetries, initialDelayMs, actionName } =
    config;
  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    try {
      const { response, responseBody } = await actionFn();
      if (!response.ok) {
        const status = response.status;
        const errorMsgContent =
          typeof responseBody === 'string'
            ? responseBody
            : responseBody
            ? JSON.stringify(responseBody)
            : response.statusText;
        const errorMessage = `${actionName} Error (${status}): ${errorMsgContent}`;
        const defaultRetryable = status >= 500 && status <= 599;
        const customRetryable = isRetryableError
          ? isRetryableError(null, response)
          : defaultRetryable;
        if (!customRetryable || attempt > maxRetries) {
          return { success: false, message: errorMessage, details: responseBody };
        }
        const delay = initialDelayMs * Math.pow(2, attempt - 1);
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }
      return {
        success: true,
        message: `${actionName} successful.`,
        details: responseBody,
      };
    } catch (error: unknown) {
      const typedError = error as Error;
      const errorMessage = `${actionName} Network/Fetch Error: ${
        typedError.message || String(error)
      }`;
      const customRetryable = isRetryableError
        ? isRetryableError(error, undefined)
        : true;
      if (!customRetryable || attempt > maxRetries) {
        return {
          success: false,
          message: errorMessage,
          details: { errorName: typedError.name, message: typedError.message },
        };
      }
      const delay = initialDelayMs * Math.pow(2, attempt - 1);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  return {
    success: false,
    message: `${actionName} failed after all retries.`,
    details: { reason: 'Max retries reached' },
  };
}