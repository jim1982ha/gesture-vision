/* FILE: packages/frontend/src/contexts/appContextFactory.ts */
import { appStore } from '#frontend/core/state/app-store.js';
import { pubsub } from '#shared/index.js';
import * as constants from '#shared/index.js';
import * as sharedUtils from '#shared/utils/index.js';
import * as uiHelpers from '#frontend/ui/helpers/ui-helpers.js';
import type { AppContextType } from '#frontend/types/index.js';

/**
 * Creates the base application context containing services that DO NOT depend on the DOM.
 * This can be safely called before React renders the application.
 */
export function createAppContext(): AppContextType {
    // Services are now instantiated in main.tsx and assigned to the context there.
    // This function now only creates the shell.
    return {
        appStore,
        services: {
            translationService: null!,
            pluginUIService: null!,
            themeManager: null!,
            webSocketService: null!,
            pubsub,
            cameraService: null,
            gestureProcessor: null,
        },
        elements: {
            videoElement: null,
            outputCanvas: null,
        },
        shared: {
            constants,
            utils: sharedUtils,
            services: {
                actionDisplayUtils: uiHelpers,
            },
        },
    };
}