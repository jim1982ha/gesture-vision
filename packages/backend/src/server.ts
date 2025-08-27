/* FILE: packages/backend/src/server.ts */
import { spawn, type ChildProcess } from 'child_process';
import http from 'http';
import path from 'path';

import cors from 'cors';
import express, { type Request, type Response, type NextFunction, type Express } from 'express';
import rateLimit from 'express-rate-limit';

import { BACKEND_INTERNAL_EVENTS } from '#shared/constants/index.js';
import { pubsub } from '#shared/core/pubsub.js';
import { normalizeNameForMtx } from '#shared/utils/index.js';
import { RoiConfigSchema } from '#shared/validation/schemas.js';

import createConfigRouter from './api/routes/config.router.js';
import createPluginsRouter from './api/routes/plugins.router.js';
import { ConfigRepository } from './services/config/config-repository.js';
import { ConfigService } from './services/config.service.js';
import { PluginManagerService } from './services/plugin-manager.service.js';
import { MtxMonitorService } from './services/mtx-monitor.service.js';
import { generateMtxConfig } from './utils/mtx-config-generator.js';
import { initializeWebSocketServer, cleanupWebSocketServer } from './websocket-server.js';

const PORT = parseInt(process.env.PORT || '9001', 10);
if (isNaN(PORT)) {
  console.error(`[Server FATAL] Invalid PORT specified.`);
  process.exit(1);
}

const asyncHandler =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };

// --- Rate Limiter for Plugin Management ---
const pluginManagementLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // Limit each IP to 20 management requests per window
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'TOO_MANY_REQUESTS',
    message:
      'Too many plugin management requests from this IP, please try again after 15 minutes.',
  },
});

async function startServer() {
  let mtxMonitor: MtxMonitorService | null = null;
  let server: http.Server | null = null;
  let configService: ConfigService | null = null;
  let pluginManager: PluginManagerService | null = null;
  const childProcesses: ChildProcess[] = [];

  const gracefulShutdown = () => {
    console.log(`[Server Shutdown] Graceful shutdown initiated...`);
    childProcesses.forEach((cp) => cp.kill('SIGTERM'));
    configService?.cleanup();
    pluginManager?.destroy();
    mtxMonitor?.stop();
    cleanupWebSocketServer();
    server?.close(() => {
      console.log(`[Server] HTTP server closed.`);
      process.exit(0);
    });
    setTimeout(() => {
      console.error('[Server] Graceful shutdown timed out. Forcing exit.');
      process.exit(1);
    }, 5000).unref();
  };

  try {
    if (process.env.NODE_ENV !== 'development') {
      const runProdService = (
        command: string,
        args: string[],
        _serviceName: string
      ) => {
        const proc = spawn(command, args, { stdio: 'inherit' });
        childProcesses.push(proc);
        proc.on('exit', () => process.exit(1));
      };
      runProdService('nginx', ['-g', 'daemon off;'], 'Nginx');
      await generateMtxConfig();
      runProdService(
        '/usr/local/bin/mediamtx',
        ['/tmp/generated_mediamtx.yml'],
        'MediaMTX'
      );
    }

    const app: Express = express();
    app.use(cors({ origin: '*', methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'] }));
    app.use(express.json());

    // FIX: Restore static asset serving for plugins. This is required for the Vite dev server proxy.
    // In production, Nginx intercepts these requests before they reach Node.js.
    const pluginsAssetPath = path.resolve(
      process.cwd(),
      'extensions',
      'plugins'
    );
    app.use('/api/plugins/assets', express.static(pluginsAssetPath));

    configService = new ConfigService();
    await configService.initializationPromise;

    const configRepository = new ConfigRepository();
    pluginManager = new PluginManagerService(configService, configRepository);
    await pluginManager.waitUntilInitialized();

    mtxMonitor = new MtxMonitorService(configService);
    configService.setMtxMonitorInstance(mtxMonitor);
    await mtxMonitor.start();

    server = http.createServer(app);
    server.on('error', (e: NodeJS.ErrnoException) => {
      console.error(
        `[Server FATAL] HTTP Server error: ${e.message}`,
        e.code === 'EADDRINUSE' ? `Port ${PORT} in use.` : ''
      );
      gracefulShutdown();
    });

    initializeWebSocketServer(server, configService, pluginManager, mtxMonitor);

    app.use('/api/config', createConfigRouter(configService));

    const pluginsRouter = createPluginsRouter(pluginManager);
    app.use('/api/plugins/manage', pluginManagementLimiter); // Apply rate limiter to management routes
    app.use('/api/plugins', pluginsRouter);

    app.patch(
      '/api/rtsp/:pathName/roi',
      asyncHandler(async (req, res) => {
        if (!configService)
          return res.status(503).json({ error: 'SERVICE_UNAVAILABLE' });

        const { pathName } = req.params;
        const validation = RoiConfigSchema.safeParse(req.body);

        if (!validation.success) {
          return res
            .status(400)
            .json({
              error: 'INVALID_ROI_PAYLOAD',
              details: validation.error.flatten(),
            });
        }

        const newRoi = validation.data;
        const currentConfig = await configService.getFullConfig();

        const sourceIndex = currentConfig.rtspSources.findIndex(
          (s) => normalizeNameForMtx(s.name) === pathName
        );

        if (sourceIndex === -1) {
          return res.status(404).json({ error: 'RTSP_SOURCE_NOT_FOUND' });
        }

        currentConfig.rtspSources[sourceIndex].roi = newRoi;

        await configService._writeConfig(currentConfig);

        pubsub.publish(BACKEND_INTERNAL_EVENTS.CONFIG_RELOADED, {
          updatedConfig: currentConfig,
          rtspChanged: false,
        });

        res
          .status(200)
          .json({ message: `ROI for ${pathName} updated successfully.` });
      })
    );

    app.post('/api/mtx-hook/:status/:pathName', (req, res) => {
      if (!configService) {
        res.status(503).send('Service Unavailable');
        return;
      }
      const { status, pathName } = req.params;
      let broadcastStatus: 'active' | 'inactive' | 'error' | 'unknown' =
        'unknown';
      if (status === 'ready') broadcastStatus = 'active';
      else if (status === 'notReady') broadcastStatus = 'inactive';
      if (broadcastStatus !== 'unknown')
        configService._broadcastStreamStatus({
          pathName,
          status: broadcastStatus,
          message: `Webhook: ${status}`,
        });
      res.status(200).send('OK');
    });

    app.get('/', (_req: Request, res: Response) => {
      res.status(200).send('GestureVision Backend API Running');
    });

    app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
      console.error('[Server Error Handler Middleware]:', err);
      res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
    });

    server.listen(PORT, '0.0.0.0', () =>
      console.log(`[Server Startup SUCCESS] Backend listening on 0.0.0.0:${PORT}`)
    );

    process.once('SIGUSR2', () => {
      gracefulShutdown();
    });
    process.on('SIGTERM', () => gracefulShutdown());
    process.on('SIGINT', () => gracefulShutdown());
  } catch (error: unknown) {
    console.error('[Server Startup FATAL] Uncaught exception:', error);
    gracefulShutdown();
  }
}

startServer();