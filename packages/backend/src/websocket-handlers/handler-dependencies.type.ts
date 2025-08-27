/* FILE: packages/backend/src/websocket-handlers/handler-dependencies.type.ts */
import type { ConfigService } from '../services/config.service.js';
import type { PluginManagerService } from '../services/plugin-manager.service.js';
import type { MtxMonitorService } from '../services/mtx-monitor.service.js';

/**
 * Centralized interface for the services available to WebSocket message handlers.
 */
export interface HandlerDependencies {
    configService: ConfigService | null;
    pluginManagerService: PluginManagerService | null;
    mtxMonitorService: MtxMonitorService | null;
}