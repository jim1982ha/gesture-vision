/* FILE: packages/backend/src/server.ts */
import { spawn, execSync, type ChildProcess } from 'child_process';
import http from 'http';
import https from 'https';
import fs from 'fs';
import path from 'path';

function commandExists(cmd: string): boolean {
  try {
    execSync(`command -v ${cmd} >/dev/null 2>&1`);
    return true;
  } catch {
    return false;
  }
}

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
  const IS_AI_STUDIO = PORT === 3000 || process.env.PORT === '3000' || process.env.AISTUDIO === 'true' || process.env.AI_STUDIO === 'true' || process.env.AIS_ENV === 'true';
  let server: http.Server | https.Server | null = null;
  let isHttps = false;
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
    // 1. Generate MediaMTX configuration
    try {
      await generateMtxConfig();
      console.log('[Server] MediaMTX config generated.');
    } catch (err) {
      console.error('[Server] Failed to generate MediaMTX config:', err);
    }

    // 2. Conditionally spawn subprocesses (Skip in AI Studio or when environment commands are missing)
    
    // In our customized Docker images / HA Addons, isDocker will be true or PORT isn't 3000
    if (process.env.PORT !== '3000') {
      try {
        const hasMediaMtx = commandExists('mediamtx');
        if (hasMediaMtx) {
          console.log('[Server] Spawning MediaMTX process...');
          const mtxProcess = spawn('mediamtx', ['/tmp/generated_mediamtx.yml'], { stdio: 'inherit' });
          childProcesses.push(mtxProcess);
          mtxProcess.on('error', (err) => {
            console.error('[Server] MediaMTX process failed:', err);
          });
        } else {
          console.log('[Server] mediamtx binary not found in PATH. Skipping MediaMTX spawn.');
        }
      } catch (err) {
        console.error('[Server] Exception while trying to spawn MediaMTX:', err);
      }

      if (process.env.NODE_ENV === 'production') {
        try {
          const hasNginx = commandExists('nginx');
          if (hasNginx) {
            console.log('[Server] Spawning Nginx frontend daemon...');
            const nginxProcess = spawn('nginx', ['-g', 'daemon off;'], { stdio: 'inherit' });
            childProcesses.push(nginxProcess);
            nginxProcess.on('error', (err) => {
              console.error('[Server] Nginx process failed:', err);
            });
          } else {
            console.log('[Server] nginx command not found. Skipping Nginx spawn.');
          }
        } catch (err) {
          console.error('[Server] Exception while trying to spawn Nginx:', err);
        }
      }
    } else {
      console.log('[Server] Running inside AI Studio browser workspace. Skipping subprocess spawning (MediaMTX / Nginx).');
    }

    await configService.initializationPromise;
    await pluginManager.waitUntilInitialized();
    await mtxMonitor.start();

    const app: Express = express();
    app.set('trust proxy', 1);
    app.use(cors({ origin: '*', methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'] }));
    app.use(express.json());
    
    const extensionsPath = path.resolve(process.cwd(), 'extensions');
    app.use('/extensions/plugins', express.static(path.join(extensionsPath, 'plugins')));
    app.use('/plugins', express.static(path.join(extensionsPath, 'plugins')));

    if (process.env.NODE_ENV !== 'production' && !IS_AI_STUDIO) {
      const keyPath = '/tmp/dev_server.key';
      const certPath = '/tmp/dev_server.crt';
      
      if (!fs.existsSync(keyPath) || !fs.existsSync(certPath)) {
        console.log('[Server] Generating self-signed SSL certificate for HTTPS dev server...');
        try {
          execSync(`openssl req -x509 -newkey rsa:2048 -keyout ${keyPath} -out ${certPath} -sha256 -days 365 -nodes -subj "/CN=localhost"`, { stdio: 'ignore' });
          console.log('[Server] SSL certificate generated successfully.');
        } catch (err) {
          console.error('[Server] Failed to generate SSL certificate using openssl. Falling back to HTTP.', err);
        }
      }
      
      if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
        const options = {
          key: fs.readFileSync(keyPath),
          cert: fs.readFileSync(certPath),
        };
        server = https.createServer(options, app);
        isHttps = true;
        console.log('[Server] Running in DEVELOPMENT with HTTPS protocol.');
      } else {
        server = http.createServer(app);
        console.log('[Server] Running in DEVELOPMENT with HTTP protocol (SSL fallback).');
      }
    } else {
      server = http.createServer(app);
    }
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
    
    if (process.env.NODE_ENV !== 'production') {
      const { createServer: createViteServer } = await import('vite');
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: "spa",
        root: path.resolve(process.cwd(), "packages/frontend"),
      });
      app.use(vite.middlewares);
    } else {
      const distPath = path.join(process.cwd(), "packages/frontend/dist");
      app.use(express.static(distPath));
      app.get("*all", (req, res) => {
        res.sendFile(path.join(distPath, "index.html"));
      });
    }

    app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
      console.error('[Server Error Handler]:', err);
      res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
    });

    server.listen(PORT, '0.0.0.0', () => console.log(`[Server Startup SUCCESS] Backend listening on ${isHttps ? 'https' : 'http'}://0.0.0.0:${PORT}`));
    process.on('SIGTERM', gracefulShutdown);
    process.on('SIGINT', gracefulShutdown);
  } catch (error) {
    console.error('[Server Startup FATAL] Uncaught exception:', error);
    gracefulShutdown();
  }
}

startServer();