/* FILE: packages/frontend/src/contexts/appContextFactory.ts */
import { appStore } from '#frontend/core/state/app-store.js';
import { TranslationService } from '#frontend/services/translation.service.js';
import { PluginUIService } from '#frontend/services/plugin-ui.service.js';
import ThemeManager from '#frontend/services/theme-manager.js';
import { webSocketService } from '#frontend/services/websocket-service.js';
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
    const translationService = new TranslationService(appStore);
    const pluginUIService = new PluginUIService(appStore, translationService);
    const themeManager = new ThemeManager(appStore);

    return {
        appStore,
        services: {
            translationService,
            pluginUIService,
            themeManager,
            webSocketService,
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