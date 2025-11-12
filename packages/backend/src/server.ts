/* FILE: packages/backend/src/server.ts */
import { spawn, type ChildProcess } from 'child_process';
import http from 'http';
import path from 'path';

import cors from 'cors';
import express, { type Request, type Response, type NextFunction, type Express } from 'express';
import rateLimit from 'express-rate-limit';

import { generateMtxConfig } from './utils/mtx-config-generator.js';
import { initializeWebSocketServer, cleanupWebSocketServer } from './websocket-server.js';
import { ConfigService } from './services/config.service.js';
import { ConfigRepository } from './services/config/config.repository.js';
import { PluginManagerService } from './services/plugin-manager.service.js';
import { MtxMonitorService } from './services/mtx-monitor.service.js';
import createConfigRouter from './api/routes/config.router.js';
import createPluginsRouter from './api/routes/plugins.router.js';
import createCoreRouter from './api/routes/core.router.js';
import { ActionDispatcherService } from './services/action-dispatcher.service.js';
import { PerformanceMonitorService } from './services/performance-monitor.service.js';

const PORT = parseInt(process.env.PORT || '9001', 10);
if (isNaN(PORT)) {
  console.error(`[Server FATAL] Invalid PORT specified.`);
  process.exit(1);
}

const pluginManagementLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false,
  message: { error: 'TOO_MANY_REQUESTS', message: 'Too many plugin management requests from this IP, please try again after 15 minutes.' },
});

async function startServer() {
  let server: http.Server | null = null;
  const childProcesses: ChildProcess[] = [];
  
  const configRepository = new ConfigRepository();
  const configService = new ConfigService(configRepository);
  const pluginManager = new PluginManagerService(configRepository);
  const mtxMonitor = new MtxMonitorService();
  const actionDispatcher = new ActionDispatcherService(pluginManager);
  const performanceMonitor = new PerformanceMonitorService();

  const gracefulShutdown = () => {
    console.log(`[Server Shutdown] Graceful shutdown initiated...`);
    childProcesses.forEach((cp) => cp.kill('SIGTERM'));
    configService?.cleanup();
    pluginManager?.destroy();
    mtxMonitor?.stop();
    performanceMonitor?.destroy();
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

    await configService.initializationPromise;
    await pluginManager.waitUntilInitialized();
    await mtxMonitor.start();

    const app: Express = express();
    app.set('trust proxy', 1);
    app.use(cors({ origin: '*', methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'] }));
    app.use(express.json());
    
    if (process.env.NODE_ENV === 'development') {
      const extensionsPath = path.resolve('/app/extensions');
      app.use('/extensions/plugins', express.static(path.join(extensionsPath, 'plugins')));
    }

    server = http.createServer(app);
    server.on('error', (e: NodeJS.ErrnoException) => {
      console.error(`[Server FATAL] HTTP Server error: ${e.message}`, e.code === 'EADDRINUSE' ? `Port ${PORT} in use.` : '');
      gracefulShutdown();
    });

    initializeWebSocketServer(server, configService, pluginManager, mtxMonitor, actionDispatcher, performanceMonitor);
    
    app.use('/api', createCoreRouter(configService));
    app.use('/api/config', createConfigRouter(configService));
    const pluginsRouter = createPluginsRouter(pluginManager);
    app.use('/api/plugins/manage', pluginManagementLimiter);
    app.use('/api/plugins', pluginsRouter);
    
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