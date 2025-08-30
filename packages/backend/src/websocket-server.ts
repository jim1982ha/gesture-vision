/* FILE: packages/backend/src/websocket-server.ts */
import http from 'http';
import WebSocket, { WebSocketServer, type RawData } from 'ws';

import { BACKEND_INTERNAL_EVENTS, WEBSOCKET_EVENTS, pubsub, type FullConfiguration, type StreamStatusPayload, type WebSocketMessage, type CustomGestureMetadata, type InitialStatePayload, type PluginManifest } from '#shared/index.js';
import { scanCustomGesturesDir } from './custom-gesture-manager.js';
import type { HandlerDependencies } from './websocket-handlers/handler-dependencies.type.js';
import { sendMessageToClient, sendErrorMessageToClient } from './websocket-handlers/ws-response-utils.js';
import { WebSocketRouter } from './websocket-router.js';

import type { ConfigService } from './services/config.service.js';
import type { PluginManagerService } from './services/plugin-manager.service.js';
import type { MtxMonitorService } from './services/mtx-monitor.service.js';

const clients = new Set<AppWebSocket>();
let wss: WebSocketServer | null = null;
let router: WebSocketRouter | null = null;

let broadcastManifestsUpdateHandler: () => void;
interface AppWebSocket extends WebSocket { isAlive?: boolean; }
type BackendConfigChangeEventData = { updatedConfig?: FullConfiguration; rtspChanged?: boolean; };
type BackendPluginConfigChangeEventData = { pluginId: string; newConfig: unknown; };

const broadcastMessage = (message: WebSocketMessage<unknown>) => {
  clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      try { client.send(JSON.stringify(message)); } catch (err) { console.error('[WS Broadcast] Error sending:', err); }
    }
  });
};

const _handleBackendConfigReloadedEvent = (data?: unknown) => {
  const eventData = data as BackendConfigChangeEventData | undefined;
  if (eventData?.updatedConfig) {
    broadcastMessage({ type: WEBSOCKET_EVENTS.FULL_CONFIG_UPDATE, payload: { config: eventData.updatedConfig } });
  }
};
const _handleBackendPluginConfigChangeEvent = (data?: unknown) => {
  const eventData = data as BackendPluginConfigChangeEventData | undefined;
  if (eventData?.pluginId && eventData.newConfig !== undefined) {
    broadcastMessage({ type: WEBSOCKET_EVENTS.PLUGIN_CONFIG_UPDATED, payload: { pluginId: eventData.pluginId, config: eventData.newConfig } });
  }
};
const _broadcastCustomGestureMetadataUpdate = async () => {
  try {
    const metadata: CustomGestureMetadata[] = await scanCustomGesturesDir();
    broadcastMessage({ type: WEBSOCKET_EVENTS.BACKEND_CUSTOM_GESTURES_METADATA_LIST, payload: { definitions: metadata } });
  } catch (err) { console.error('[WebSocket] Failed to broadcast custom gesture metadata:', err); }
};
const broadcastStreamStatusUpdate = (payload: StreamStatusPayload) => {
  if (payload?.pathName) broadcastMessage({ type: 'STREAM_STATUS_UPDATE', payload });
};

export function initializeWebSocketServer(
  server: http.Server,
  configService: ConfigService,
  pluginManagerService: PluginManagerService,
  mtxMonitorService: MtxMonitorService | null
): WebSocketServer {
  const dependencies: HandlerDependencies = { configService, pluginManagerService, mtxMonitorService };
  router = new WebSocketRouter(dependencies);
  
  if (configService) configService.setStreamStatusBroadcaster(broadcastStreamStatusUpdate);

  wss = new WebSocketServer({ server });

  broadcastManifestsUpdateHandler = async () => {
    const manifests = await pluginManagerService.getAllPluginManifestsWithCapabilities();
    broadcastMessage({ type: WEBSOCKET_EVENTS.PLUGINS_MANIFESTS_UPDATED, payload: { manifests } });
  };
  pubsub.subscribe(BACKEND_INTERNAL_EVENTS.CONFIG_RELOADED, _handleBackendConfigReloadedEvent as (...args: unknown[]) => void);
  pubsub.subscribe(BACKEND_INTERNAL_EVENTS.PLUGIN_GLOBAL_CONFIG_CHANGED_ON_BACKEND, _handleBackendPluginConfigChangeEvent as (...args: unknown[]) => void);
  pubsub.subscribe(BACKEND_INTERNAL_EVENTS.REQUEST_CUSTOM_GESTURE_METADATA_UPDATE, _broadcastCustomGestureMetadataUpdate);
  pubsub.subscribe(BACKEND_INTERNAL_EVENTS.REQUEST_MANIFESTS_BROADCAST, broadcastManifestsUpdateHandler);

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
      if (client.isAlive === false) return client.terminate();
      client.isAlive = false;
      client.ping();
    });
  }, 30000);

  wss.on('close', () => clearInterval(keepAliveInterval));
  return wss;
}

async function sendInitialDataToClient(ws: AppWebSocket, dependencies: HandlerDependencies) {
  const { configService, pluginManagerService } = dependencies;
  if (!configService || !pluginManagerService) {
    await sendErrorMessageToClient(ws, 'SERVER_UNAVAILABLE', 'Core services initializing.');
    throw new Error('Core services not ready for sendInitialDataToClient');
  }
  try {
    const globalConfig = await configService.getFullConfig();
    const customGestureMetadata = await scanCustomGesturesDir();
    const manifests: PluginManifest[] = await pluginManagerService.getAllPluginManifestsWithCapabilities();
    const pluginConfigs: Record<string, unknown> = {};
    for (const manifest of manifests) {
      if (manifest.capabilities.hasGlobalSettings) {
        pluginConfigs[manifest.id] = (await pluginManagerService.getPluginGlobalConfig(manifest.id)) ?? null;
      }
    }
    await sendMessageToClient(ws, { type: WEBSOCKET_EVENTS.INITIAL_STATE, payload: { globalConfig, pluginConfigs, customGestureMetadata, manifests } as InitialStatePayload });
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
  } catch (_e) { await sendErrorMessageToClient(ws, 'INVALID_MESSAGE', 'Could not parse message.'); return; }
  ws.isAlive = true;
  if (router) await router.route(ws, parsedMessage);
}

export function cleanupWebSocketServer() {
  pubsub.unsubscribe(BACKEND_INTERNAL_EVENTS.CONFIG_RELOADED, _handleBackendConfigReloadedEvent as (...args: unknown[]) => void);
  pubsub.unsubscribe(BACKEND_INTERNAL_EVENTS.PLUGIN_GLOBAL_CONFIG_CHANGED_ON_BACKEND, _handleBackendPluginConfigChangeEvent as (...args: unknown[]) => void);
  pubsub.unsubscribe(BACKEND_INTERNAL_EVENTS.REQUEST_CUSTOM_GESTURE_METADATA_UPDATE, _broadcastCustomGestureMetadataUpdate);
  if (broadcastManifestsUpdateHandler) pubsub.unsubscribe(BACKEND_INTERNAL_EVENTS.REQUEST_MANIFESTS_BROADCAST, broadcastManifestsUpdateHandler);
  wss?.close(); wss = null; router = null; clients.clear();
}