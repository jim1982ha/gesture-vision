/* FILE: packages/backend/src/websocket-server.ts */
import http from 'http';
import WebSocket, { WebSocketServer, type RawData } from 'ws';
import { BACKEND_INTERNAL_EVENTS, WEBSOCKET_EVENTS, pubsub, type FullConfiguration, type StreamStatusPayload, type WebSocketMessage, type CustomGestureMetadata, type InitialStatePayload } from '#shared/index.js';
import { scanCustomGesturesDir } from './custom-gesture-manager.js';
import type { HandlerDependencies } from './websocket-handlers/handler-dependencies.type.js';
import { sendMessageToClient, sendErrorMessageToClient } from '#backend/utils/index.js';
import { WebSocketRouter } from './websocket-router.js';
import type { ConfigService } from './services/config.service.js';
import { PluginManagerService } from './services/plugin-manager.service.js';
import type { MtxMonitorService } from './services/mtx-monitor.service.js';
import type { ActionDispatcherService } from './services/action-dispatcher.service.js';
import type { PerformanceMonitorService } from './services/performance-monitor.service.js';

interface AppWebSocket extends WebSocket { isAlive?: boolean; }

let wss: WebSocketServer | null = null;
let router: WebSocketRouter | null = null;
let initialStateCache: InitialStatePayload | null = null;
const clients = new Set<AppWebSocket>();
const subscriptions: (() => void)[] = [];

const broadcastMessage = (message: WebSocketMessage<unknown>) => {
  const messageString = JSON.stringify(message);
  clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      try { client.send(messageString); } catch (err) { console.error('[WS Broadcast] Error sending:', err); }
    }
  });
};

const invalidateInitialStateCache = () => {
  initialStateCache = null;
  console.log('[WS Server] Initial state cache invalidated.');
};

const eventBroadcastMap: Record<string, (data: unknown) => void> = {
  [BACKEND_INTERNAL_EVENTS.CONFIG_RELOADED]: (data: unknown) => {
    const eventData = data as { updatedConfig?: FullConfiguration } | undefined;
    invalidateInitialStateCache();
    if (eventData?.updatedConfig) broadcastMessage({ type: WEBSOCKET_EVENTS.FULL_CONFIG_UPDATE, payload: { config: eventData.updatedConfig } });
  },
  [BACKEND_INTERNAL_EVENTS.PLUGIN_GLOBAL_CONFIG_CHANGED_ON_BACKEND]: (data: unknown) => {
    const eventData = data as { pluginId: string; newConfig: unknown } | undefined;
    invalidateInitialStateCache();
    if (eventData?.pluginId && eventData.newConfig !== undefined) broadcastMessage({ type: WEBSOCKET_EVENTS.PLUGIN_CONFIG_UPDATED, payload: { pluginId: eventData.pluginId, config: eventData.newConfig } });
  },
  [BACKEND_INTERNAL_EVENTS.REQUEST_CUSTOM_GESTURE_METADATA_UPDATE]: async () => {
    invalidateInitialStateCache();
    try {
      const metadata: CustomGestureMetadata[] = await scanCustomGesturesDir();
      broadcastMessage({ type: WEBSOCKET_EVENTS.BACKEND_CUSTOM_GESTURES_METADATA_LIST, payload: { definitions: metadata } });
    } catch (err) { console.error('[WebSocket] Failed to broadcast custom gesture metadata:', err); }
  },
  [BACKEND_INTERNAL_EVENTS.REQUEST_MANIFESTS_BROADCAST]: async (data: unknown) => {
    invalidateInitialStateCache();
    if (data instanceof PluginManagerService) {
      const manifests = await data.getAllPluginManifestsWithCapabilities();
      broadcastMessage({ type: WEBSOCKET_EVENTS.PLUGINS_MANIFESTS_UPDATED, payload: { manifests } });
    } else {
      console.error('[WS Server] Incorrect data type passed to REQUEST_MANIFESTS_BROADCAST handler.');
    }
  }
};

export function initializeWebSocketServer(server: http.Server, configService: ConfigService, pluginManagerService: PluginManagerService, mtxMonitorService: MtxMonitorService | null, actionDispatcher: ActionDispatcherService | null, performanceMonitorService: PerformanceMonitorService | null): WebSocketServer {
  const dependencies: HandlerDependencies = { configService, pluginManagerService, mtxMonitorService, actionDispatcher, performanceMonitorService };
  router = new WebSocketRouter(dependencies);
  wss = new WebSocketServer({ server });

  configService.setStreamStatusBroadcaster((payload: StreamStatusPayload) => {
    if (payload?.pathName) broadcastMessage({ type: 'STREAM_STATUS_UPDATE', payload });
  });

  subscriptions.push(pubsub.subscribe(BACKEND_INTERNAL_EVENTS.CONFIG_RELOADED, eventBroadcastMap[BACKEND_INTERNAL_EVENTS.CONFIG_RELOADED]));
  subscriptions.push(pubsub.subscribe(BACKEND_INTERNAL_EVENTS.PLUGIN_GLOBAL_CONFIG_CHANGED_ON_BACKEND, eventBroadcastMap[BACKEND_INTERNAL_EVENTS.PLUGIN_GLOBAL_CONFIG_CHANGED_ON_BACKEND]));
  subscriptions.push(pubsub.subscribe(BACKEND_INTERNAL_EVENTS.REQUEST_CUSTOM_GESTURE_METADATA_UPDATE, eventBroadcastMap[BACKEND_INTERNAL_EVENTS.REQUEST_CUSTOM_GESTURE_METADATA_UPDATE]));
  subscriptions.push(pubsub.subscribe(BACKEND_INTERNAL_EVENTS.REQUEST_MANIFESTS_BROADCAST, () => eventBroadcastMap[BACKEND_INTERNAL_EVENTS.REQUEST_MANIFESTS_BROADCAST](pluginManagerService)));

  wss.on('connection', (ws: WebSocket) => {
    const appWs = ws as AppWebSocket;
    clients.add(appWs);
    appWs.isAlive = true;
    appWs.on('pong', () => { appWs.isAlive = true; });

    sendInitialDataToClient(appWs, dependencies)
      .then(() => {
        appWs.on('message', (messageBuffer: RawData) => handleIncomingMessage(appWs, messageBuffer));
        appWs.on('close', () => clients.delete(appWs));
        appWs.on('error', (error: Error) => { console.error('[WebSocket Error]', error.message); clients.delete(appWs); appWs.terminate(); });
      }).catch(error => { console.error('[WS] Error sending initial data, terminating:', error); appWs.terminate(); clients.delete(appWs); });
  });

  const keepAliveInterval = setInterval(() => {
    clients.forEach((client) => {
      if (!client.isAlive) return client.terminate();
      client.isAlive = false;
      client.ping();
    });
  }, 30000);

  wss.on('close', () => clearInterval(keepAliveInterval));
  return wss;
}

async function getOrBuildInitialState(dependencies: HandlerDependencies): Promise<InitialStatePayload> {
    if (initialStateCache) return initialStateCache;
    const { configService, pluginManagerService } = dependencies;
    if (!configService || !pluginManagerService) throw new Error('Core services not ready for building initial state.');

    console.log('[WS Server] Building initial state payload for cache...');
    const [globalConfig, customGestureMetadata, manifests] = await Promise.all([
        configService.getFullConfig(),
        scanCustomGesturesDir(),
        pluginManagerService.getAllPluginManifestsWithCapabilities()
    ]);

    const pluginConfigs: Record<string, unknown> = {};
    for (const manifest of manifests) {
        if (manifest.capabilities.hasGlobalSettings) pluginConfigs[manifest.id] = (await pluginManagerService.getPluginGlobalConfig(manifest.id)) ?? null;
    }
    initialStateCache = { globalConfig, pluginConfigs, customGestureMetadata, manifests };
    return initialStateCache;
}

async function sendInitialDataToClient(ws: AppWebSocket, dependencies: HandlerDependencies) {
  try {
    const payload = await getOrBuildInitialState(dependencies);
    await sendMessageToClient(ws, { type: WEBSOCKET_EVENTS.INITIAL_STATE, payload });
  } catch (error) {
    console.error('[WS SendInitial] Failed:', error);
    await sendErrorMessageToClient(ws, 'SERVER_ERROR', 'Failed to send initial server state.');
    throw error;
  }
}

async function handleIncomingMessage(ws: AppWebSocket, messageBuffer: RawData) {
  let parsedMessage: WebSocketMessage<unknown>;
  try {
    parsedMessage = JSON.parse(messageBuffer.toString('utf-8'));
    ws.isAlive = true;
    if (router) await router.route(ws, parsedMessage);
  } catch (_e) { await sendErrorMessageToClient(ws, 'INVALID_MESSAGE', 'Could not parse message.'); }
}

export function cleanupWebSocketServer() {
  subscriptions.forEach(unsub => unsub());
  subscriptions.length = 0;
  wss?.close(); wss = null; router = null; clients.clear();
}