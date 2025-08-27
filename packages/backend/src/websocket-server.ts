/* FILE: packages/backend/src/websocket-server.ts */
import http from 'http';

import WebSocket, { WebSocketServer, type RawData } from 'ws';

import {
  BACKEND_INTERNAL_EVENTS,
  WEBSOCKET_EVENTS,
} from '#shared/constants/index.js';
import { pubsub } from '#shared/core/pubsub.js';

import { scanCustomGesturesDir } from './custom-gesture-manager.js';
import { type HandlerDependencies } from './websocket-handlers/handler-dependencies.type.js';
import {
  sendMessageToClient,
  sendErrorMessageToClient,
} from './websocket-handlers/ws-response-utils.js';
import { WebSocketRouter } from './websocket-router.js';

import type {
  FullConfiguration,
  StreamStatusPayload,
  WebSocketMessage,
  CustomGestureMetadata,
  InitialStatePayload,
  PluginManifest,
} from '#shared/types/index.js';
import type { ConfigService } from './services/config.service.js';
import type { PluginManagerService } from './services/plugin-manager.service.js';
import type { MtxMonitorService } from './services/mtx-monitor.service.js';

const clients = new Set<AppWebSocket>();
let wss: WebSocketServer | null = null;
let router: WebSocketRouter | null = null;

// --- Handler References for Sub/Unsub ---
let broadcastManifestsUpdateHandler: () => void;

interface AppWebSocket extends WebSocket {
  isAlive?: boolean;
  keepAliveIntervalId?: NodeJS.Timeout;
}

type BackendConfigChangeEventData = {
  updatedConfig?: FullConfiguration;
  rtspChanged?: boolean;
};

type BackendPluginConfigChangeEventData = {
  pluginId: string;
  newConfig: unknown;
};

const _handleBackendGlobalConfigChangeEvent = (data?: unknown) => {
  const eventData = data as BackendConfigChangeEventData | undefined;
  if (eventData?.updatedConfig) {
    // This event is from a PATCH. The client initiating the patch gets an ACK.
    // No general broadcast needed here unless backend initiates a patch.
  }
};

const _handleBackendConfigReloadedEvent = (data?: unknown) => {
  const eventData = data as BackendConfigChangeEventData | undefined;
  const updatedConfig = eventData?.updatedConfig;
  if (updatedConfig) {
    console.log(
      `%c[WebSocketServer] Broadcasting FULL_CONFIG_UPDATE to all clients due to config reload.`,
      'color: #87ceeb;'
    );
    broadcastMessage({
      type: WEBSOCKET_EVENTS.FULL_CONFIG_UPDATE,
      payload: { config: updatedConfig },
    });
  }
};

const _handleBackendPluginConfigChangeEvent = (data?: unknown) => {
  const eventData = data as BackendPluginConfigChangeEventData | undefined;
  if (eventData?.pluginId && eventData.newConfig !== undefined) {
    const payload = {
      pluginId: eventData.pluginId,
      config: eventData.newConfig,
    };
    broadcastMessage({ type: WEBSOCKET_EVENTS.PLUGIN_CONFIG_UPDATED, payload });
  }
};

const _broadcastCustomGestureMetadataUpdate = async () => {
  try {
    const metadata: CustomGestureMetadata[] = await scanCustomGesturesDir();
    broadcastMessage({
      type: WEBSOCKET_EVENTS.BACKEND_CUSTOM_GESTURES_METADATA_LIST,
      payload: { definitions: metadata },
    });
  } catch (err) {
    console.error(
      '[WebSocket] Failed to broadcast custom gesture metadata:',
      err
    );
  }
};

export function initializeWebSocketServer(
  server: http.Server,
  configService: ConfigService,
  pluginManagerService: PluginManagerService,
  monitorInstance: MtxMonitorService | null
): WebSocketServer {
  const dependencies: HandlerDependencies = {
    configService,
    pluginManagerService,
    mtxMonitorService: monitorInstance,
  };
  router = new WebSocketRouter(dependencies);

  if (configService) {
    configService.setStreamStatusBroadcaster(broadcastStreamStatusUpdate);
  } else {
    console.error(
      '[WebSocketServer] Global ConfigService instance missing for broadcaster setup!'
    );
  }

  try {
    wss = new WebSocketServer({ server });

    // Define the handler with access to the pluginManagerService
    broadcastManifestsUpdateHandler = async () => {
      try {
        const manifests =
          await pluginManagerService.getAllPluginManifestsWithCapabilities();
        broadcastMessage({
          type: WEBSOCKET_EVENTS.PLUGINS_MANIFESTS_UPDATED,
          payload: { manifests },
        });
      } catch (err) {
        console.error('[WebSocket] Failed to broadcast plugin manifests:', err);
      }
    };

    pubsub.subscribe(
      BACKEND_INTERNAL_EVENTS.CONFIG_PATCHED,
      _handleBackendGlobalConfigChangeEvent as (...args: unknown[]) => void
    );
    pubsub.subscribe(
      BACKEND_INTERNAL_EVENTS.CONFIG_RELOADED,
      _handleBackendConfigReloadedEvent as (...args: unknown[]) => void
    );
    pubsub.subscribe(
      BACKEND_INTERNAL_EVENTS.PLUGIN_GLOBAL_CONFIG_CHANGED_ON_BACKEND,
      _handleBackendPluginConfigChangeEvent as (...args: unknown[]) => void
    );
    pubsub.subscribe(
      BACKEND_INTERNAL_EVENTS.REQUEST_CUSTOM_GESTURE_METADATA_UPDATE,
      _broadcastCustomGestureMetadataUpdate
    );
    pubsub.subscribe(
      BACKEND_INTERNAL_EVENTS.REQUEST_MANIFESTS_BROADCAST,
      broadcastManifestsUpdateHandler
    );

    wss.on('connection', (ws: WebSocket, req: http.IncomingMessage) => {
      const appWs = ws as AppWebSocket;
      const clientIp =
        req.socket.remoteAddress ||
        req.headers['x-forwarded-for']?.toString().split(',')[0].trim();
      clients.add(appWs);
      appWs.isAlive = true;
      appWs.on('pong', () => {
        appWs.isAlive = true;
      });

      sendInitialDataToClient(appWs, dependencies)
        .then(() => {
          appWs.on('message', (messageBuffer: RawData) => {
            handleIncomingMessage(appWs, messageBuffer, clientIp);
          });
          appWs.on('close', (_code: number, _reason: Buffer) => {
            clients.delete(appWs);
            if (appWs.keepAliveIntervalId) clearInterval(appWs.keepAliveIntervalId);
          });
          appWs.on('error', (error: Error) => {
            console.error(
              `[WebSocket Error ${clientIp}] SOCKET ERROR EVENT:`,
              error.message
            );
            clients.delete(appWs);
            if (appWs.keepAliveIntervalId) clearInterval(appWs.keepAliveIntervalId);
            appWs.terminate();
          });

          appWs.keepAliveIntervalId = setInterval(() => {
            if (appWs.readyState === WebSocket.OPEN) {
              if (appWs.isAlive === false) {
                if (appWs.keepAliveIntervalId)
                  clearInterval(appWs.keepAliveIntervalId);
                appWs.terminate();
                return;
              }
              appWs.isAlive = false;
              appWs.ping();
            } else {
              if (appWs.keepAliveIntervalId) clearInterval(appWs.keepAliveIntervalId);
            }
          }, 30000);
        })
        .catch((error) => {
          console.error(
            '[WebSocketServer] Error sending initial data to client, terminating connection:',
            error
          );
          if (appWs.keepAliveIntervalId) clearInterval(appWs.keepAliveIntervalId);
          appWs.terminate();
          clients.delete(appWs);
        });
    });

    wss.on('error', (error: Error) =>
      console.error('[WebSocket Server Error]', error)
    );
    wss.on('listening', () => {
      const address = wss?.address();
      const port =
        typeof address === 'object' && address !== null ? address.port : address;
      console.log(
        `[WebSocket Server] Successfully listening on port ${port || 'unknown'}.`
      );
    });
    return wss;
  } catch (error: unknown) {
    const messageText = error instanceof Error ? error.message : String(error);
    console.error(
      '[WebSocket Init] FATAL: Failed to create WebSocketServer:',
      messageText
    );
    throw error;
  }
}

async function sendInitialDataToClient(
  ws: AppWebSocket,
  dependencies: HandlerDependencies
) {
  const { configService, pluginManagerService } = dependencies;
  if (!configService || !pluginManagerService) {
    await sendErrorMessageToClient(
      ws,
      'SERVER_UNAVAILABLE',
      'Core services initializing, please try again shortly.'
    );
    throw new Error('Core services not ready for sendInitialDataToClient');
  }
  try {
    const globalConfig = await configService.getFullConfig();
    const customGestureMetadata = await scanCustomGesturesDir();
    const manifests: PluginManifest[] =
      await pluginManagerService.getAllPluginManifestsWithCapabilities();
    const pluginConfigs: Record<string, unknown> = {};

    for (const manifest of manifests) {
      if (manifest.capabilities.hasGlobalSettings) {
        pluginConfigs[manifest.id] =
          (await pluginManagerService.getPluginGlobalConfig(manifest.id)) ?? null;
      }
    }

    const initialStatePayload: InitialStatePayload = {
      globalConfig,
      pluginConfigs,
      customGestureMetadata,
      manifests,
    };

    await sendMessageToClient(ws, {
      type: WEBSOCKET_EVENTS.INITIAL_STATE,
      payload: initialStatePayload,
    });
  } catch (error) {
    console.error('[WebSocket SendInitial] Failed to send initial state to client:', error);
    await sendErrorMessageToClient(
      ws,
      'SERVER_ERROR',
      'Failed to send initial server state.'
    );
    throw error;
  }
}

async function handleIncomingMessage(
  ws: AppWebSocket,
  messageBuffer: RawData,
  _clientIp?: string
) {
  let parsedMessage: WebSocketMessage<unknown>;
  try {
    parsedMessage = JSON.parse(messageBuffer.toString('utf-8'));
  } catch (_error) {
    await sendErrorMessageToClient(ws, 'INVALID_MESSAGE', 'Could not parse message.');
    return;
  }

  ws.isAlive = true;
  if (router) {
    await router.route(ws, parsedMessage);
  } else {
    console.error('[WebSocketServer] Router not initialized, cannot handle message.');
  }
}

export function broadcastMessage(message: WebSocketMessage<unknown>) {
  clients.forEach((client: AppWebSocket) => {
    if (client.readyState === WebSocket.OPEN) {
      try {
        client.send(JSON.stringify(message));
      } catch (err) {
        console.error('[WebSocket Broadcast] Error sending to a client:', err);
      }
    }
  });
}

export function broadcastStreamStatusUpdate(payload: StreamStatusPayload) {
  if (!payload || !payload.pathName) return;
  broadcastMessage({ type: 'STREAM_STATUS_UPDATE', payload });
}

export function cleanupWebSocketServer() {
  pubsub.unsubscribe(
    BACKEND_INTERNAL_EVENTS.CONFIG_PATCHED,
    _handleBackendGlobalConfigChangeEvent as (...args: unknown[]) => void
  );
  pubsub.unsubscribe(
    BACKEND_INTERNAL_EVENTS.CONFIG_RELOADED,
    _handleBackendConfigReloadedEvent as (...args: unknown[]) => void
  );
  pubsub.unsubscribe(
    BACKEND_INTERNAL_EVENTS.PLUGIN_GLOBAL_CONFIG_CHANGED_ON_BACKEND,
    _handleBackendPluginConfigChangeEvent as (...args: unknown[]) => void
  );
  pubsub.unsubscribe(
    BACKEND_INTERNAL_EVENTS.REQUEST_CUSTOM_GESTURE_METADATA_UPDATE,
    _broadcastCustomGestureMetadataUpdate
  );
  if (broadcastManifestsUpdateHandler) {
    pubsub.unsubscribe(
      BACKEND_INTERNAL_EVENTS.REQUEST_MANIFESTS_BROADCAST,
      broadcastManifestsUpdateHandler
    );
  }

  if (wss) {
    clients.forEach((client: AppWebSocket) => {
      if (client.keepAliveIntervalId) clearInterval(client.keepAliveIntervalId);
      if (client.readyState === WebSocket.OPEN)
        client.close(1001, 'Server shutting down');
      client.terminate();
    });
    clients.clear();
    wss.close((err) => {
      if (err) console.error('[WebSocket Cleanup] Error closing server:', err);
    });
    wss = null;
  }
  router = null;
}