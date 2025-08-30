/* FILE: packages/backend/src/server.ts */
import { spawn, type ChildProcess } from 'child_process';
import http from 'http';
import path from 'path';

import cors from 'cors';
import express, { type Request, type Response, type NextFunction, type Express } from 'express';
import rateLimit from 'express-rate-limit';

import { generateMtxConfig } from './utils/mtx-config-generator.js';
import { initializeWebSocketServer, cleanupWebSocketServer } from './websocket-server.js';
import { ConfigRepository } from './services/config/config-repository.js';
import { ConfigService } from './services/config.service.js';
import { PluginManagerService } from './services/plugin-manager.service.js';
import { MtxMonitorService } from './services/mtx-monitor.service.js';
import createConfigRouter from './api/routes/config.router.js';
import createPluginsRouter from './api/routes/plugins.router.js';
import { RoiConfigSchema, pubsub, BACKEND_INTERNAL_EVENTS, normalizeNameForMtx, type RtspSourceConfig } from '#shared/index.js';

const PORT = parseInt(process.env.PORT || '9001', 10);
if (isNaN(PORT)) {
  console.error(`[Server FATAL] Invalid PORT specified.`);
  process.exit(1);
}

const asyncHandler = (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) =>
    (req: Request, res: Response, next: NextFunction) => { Promise.resolve(fn(req, res, next)).catch(next); };

const pluginManagementLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false,
  message: { error: 'TOO_MANY_REQUESTS', message: 'Too many plugin management requests from this IP, please try again after 15 minutes.' },
});

async function startServer() {
  let server: http.Server | null = null;
  const childProcesses: ChildProcess[] = [];
  const services = {
    configRepository: new ConfigRepository(),
    configService: null as ConfigService | null,
    pluginManager: null as PluginManagerService | null,
    mtxMonitor: null as MtxMonitorService | null,
  };

  const gracefulShutdown = () => {
    console.log(`[Server Shutdown] Graceful shutdown initiated...`);
    childProcesses.forEach((cp) => cp.kill('SIGTERM'));
    services.configService?.cleanup();
    services.pluginManager?.destroy();
    services.mtxMonitor?.stop();
    cleanupWebSocketServer();
    server?.close(() => { console.log(`[Server] HTTP server closed.`); process.exit(0); });
    setTimeout(() => { console.error('[Server] Graceful shutdown timed out. Forcing exit.'); process.exit(1); }, 5000).unref();
  };

  try {
    if (process.env.NODE_ENV !== 'development') {
      const runProdService = (command: string, args: string[]) => {
        const proc = spawn(command, args, { stdio: 'inherit' });
        childProcesses.push(proc);
        proc.on('exit', () => process.exit(1));
      };
      runProdService('nginx', ['-g', 'daemon off;']);
      await generateMtxConfig();
      runProdService('/usr/local/bin/mediamtx', ['/tmp/generated_mediamtx.yml']);
    }

    services.configRepository = new ConfigRepository();
    services.configService = new ConfigService(services.configRepository);
    await services.configService.initializationPromise;
    services.pluginManager = new PluginManagerService(services.configRepository);
    await services.pluginManager.waitUntilInitialized();
    services.mtxMonitor = new MtxMonitorService(services.configService);
    services.configService.setMtxMonitorInstance(services.mtxMonitor);
    await services.mtxMonitor.start();

    const app: Express = express();
    app.use(cors({ origin: '*', methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'] }));
    app.use(express.json());
    app.use('/api/plugins/assets', express.static(path.resolve(process.cwd(), 'extensions', 'plugins')));

    server = http.createServer(app);
    server.on('error', (e: NodeJS.ErrnoException) => {
      console.error(`[Server FATAL] HTTP Server error: ${e.message}`, e.code === 'EADDRINUSE' ? `Port ${PORT} in use.` : '');
      gracefulShutdown();
    });

    initializeWebSocketServer(server, services.configService, services.pluginManager, services.mtxMonitor);
    
    app.use('/api/config', createConfigRouter(services.configService));
    const pluginsRouter = createPluginsRouter(services.pluginManager);
    app.use('/api/plugins/manage', pluginManagementLimiter);
    app.use('/api/plugins', pluginsRouter);

    app.patch('/api/rtsp/:pathName/roi', asyncHandler(async (req, res) => {
        const { pathName } = req.params;
        const validation = RoiConfigSchema.safeParse(req.body);
        if (!validation.success) return res.status(400).json({ error: 'INVALID_ROI_PAYLOAD', details: validation.error.flatten() });
        const currentConfig = await services.configService!.getFullConfig();
        const sourceIndex = currentConfig.rtspSources.findIndex((s: RtspSourceConfig) => normalizeNameForMtx(s.name) === pathName);
        if (sourceIndex === -1) return res.status(404).json({ error: 'RTSP_SOURCE_NOT_FOUND' });
        currentConfig.rtspSources[sourceIndex].roi = validation.data;
        await services.configService!._writeConfig(currentConfig);
        pubsub.publish(BACKEND_INTERNAL_EVENTS.CONFIG_RELOADED, { updatedConfig: currentConfig, rtspChanged: false });
        res.status(200).json({ message: `ROI for ${pathName} updated successfully.` });
    }));

    app.post('/api/mtx-hook/:status/:pathName', (req, res) => {
      const { status, pathName } = req.params;
      const broadcastStatus: 'active' | 'inactive' = status === 'ready' ? 'active' : 'inactive';
      services.configService!._broadcastStreamStatus({ pathName, status: broadcastStatus, message: `Webhook: ${status}` });
      res.status(200).send('OK');
    });

    app.get('/', (_req, res) => res.status(200).send('GestureVision Backend API Running'));
    app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
      console.error('[Server Error Handler]:', err);
      res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
    });

    server.listen(PORT, '0.0.0.0', () => console.log(`[Server Startup SUCCESS] Backend listening on 0.0.0.0:${PORT}`));
    process.on('SIGTERM', gracefulShutdown);
    process.on('SIGINT', gracefulShutdown);
  } catch (error) {
    console.error('[Server Startup FATAL] Uncaught exception:', error);
    gracefulShutdown();
  }
}

startServer();