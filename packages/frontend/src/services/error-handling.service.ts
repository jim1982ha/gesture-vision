/* FILE: packages/frontend/src/services/error-handling.service.ts */
import { pubsub, UI_EVENTS } from '#shared/index.js';
import type { TranslationService } from './translation.service.js';

type ErrorContext = string | 'generic' | 'websocket' | 'plugin' | 'api';

/**
 * Centralized service for handling and reporting errors to the user.
 */
class ErrorHandlingService {
    #translationService: TranslationService;

    constructor(translationService: TranslationService) {
        this.#translationService = translationService;
    }

    /**
     * Central point for processing errors from anywhere in the frontend.
     * It interprets the error and shows a user-friendly notification.
     * @param error The error object or string.
     * @param context A string providing context about where the error occurred.
     */
    public handleError(error: unknown, context: ErrorContext = 'generic'): void {
        console.error(`[ErrorService Context: ${context}]`, error);

        let messageKey = 'errorGeneric';
        const substitutions: Record<string, string> = { 
            message: error instanceof Error ? error.message : String(error) 
        };

        if (error instanceof Error) {
            switch (error.name) {
                case 'AbortError':
                    messageKey = 'errorRequestTimeout';
                    break;
            }
        }
        
        const translatedMessage = this.#translationService.translate(messageKey, substitutions);
        
        pubsub.publish(UI_EVENTS.SHOW_NOTIFICATION, {
            message: translatedMessage,
            type: 'error',
            duration: 8000
        });
    }
}

// Singleton instance
let errorHandlingServiceInstance: ErrorHandlingService | null = null;

export const initializeErrorHandlingService = (translationService: TranslationService): ErrorHandlingService => {
    if (!errorHandlingServiceInstance) {
        errorHandlingServiceInstance = new ErrorHandlingService(translationService);
    }
    return errorHandlingServiceInstance;
};

export { errorHandlingServiceInstance as errorHandlingService };