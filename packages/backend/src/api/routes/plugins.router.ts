/* FILE: packages/backend/src/api/routes/plugins.router.ts */
import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import type { PluginManagerService } from '../../services/plugin-manager.service.js';
import { asyncHandler } from '../async-handler.js';

const InstallPluginBodySchema = z.object({
    url: z.string().url({ message: "A valid Git repository URL is required." }),
});

export default function createPluginsRouter(pluginManager: PluginManagerService): Router {
    const router = Router();

    // --- Core Plugin Management API Routes ---
    router.get('/manifests', asyncHandler(async (_req, res) => {
        res.json(await pluginManager.getAllPluginManifestsWithCapabilities());
    }));

    router.post('/manage/install', asyncHandler(async (req, res) => {
        const validation = InstallPluginBodySchema.safeParse(req.body);
        if (!validation.success) {
            return res.status(400).json({ success: false, message: validation.error.issues[0].message });
        }
        const { url } = validation.data;
        const result = await pluginManager.installPlugin(url);
        res.status(result.success ? 200 : 400).json(result);
    }));

    router.post('/manage/:pluginId/uninstall', asyncHandler(async (req, res) => {
        const { pluginId } = req.params;
        const result = await pluginManager.initiatePluginUninstall(pluginId as string);
        res.status(result.success ? 200 : 400).json(result);
    }));

    router.post('/manage/:pluginId/state', asyncHandler(async (req, res) => {
        const { pluginId } = req.params;
        const { state } = req.body; // Expects "enabled" or "disabled"

        if (state !== 'enabled' && state !== 'disabled') {
            return res.status(400).json({ success: false, message: 'Invalid state provided. Must be "enabled" or "disabled".' });
        }
        
        const result = await pluginManager.setPluginState(pluginId as string, state);
        res.status(result.success ? 200 : 400).json(result);
    }));

    // --- Dynamic Middleware for Plugin-Specific API Routes ---
    // This middleware intercepts any request to /:pluginId/* and routes it to the plugin's
    // router if the plugin is currently enabled and provides one.
    router.use('/:pluginId', (req: Request, res: Response, next: NextFunction) => {
        const { pluginId } = req.params;
        const plugin = pluginManager.getPlugin(pluginId as string);

        if (plugin && plugin.manifest.status === 'enabled') {
            const pluginApiRouter = plugin.instance.getApiRouter?.();
            if (pluginApiRouter) {
                // Temporarily modify the req.url to strip the pluginId part
                // so the plugin's router can match its own routes (e.g., '/entities').
                const originalUrl = req.url;
                req.url = req.originalUrl.replace(`/api/plugins/${pluginId}`, '');
                
                pluginApiRouter(req, res, (err) => {
                    // Restore the original URL after the plugin router is done
                    req.url = originalUrl;
                    next(err);
                });
                return;
            }
        }
        // If plugin not found, disabled, or has no router, proceed to next routes.
        next();
    });

    // --- Core config and test routes that use :pluginId must come after the dynamic middleware ---
    router.get('/:pluginId/config', asyncHandler(async (req, res) => {
        const pluginId = req.params.pluginId as string;
        const config = await pluginManager.getPluginGlobalConfig(pluginId);
        const manifest = pluginManager.getPluginManifest(pluginId);

        if (!manifest) {
            return res.status(404).json({ error: "PLUGIN_NOT_FOUND" });
        }
        if (!manifest.capabilities.hasGlobalSettings) {
            return res.status(200).json(null);
        }
        if (config === null) {
            return res.status(404).json({ error: "PLUGIN_CONFIG_NOT_FOUND_OR_ERROR" });
        }

        res.json(config);
    }));

    router.patch('/:pluginId/config', asyncHandler(async (req, res) => {
        const pluginId = req.params.pluginId as string;
        if (typeof req.body !== 'object' || req.body === null) {
            return res.status(400).json({ error: "BAD_REQUEST_PAYLOAD" });
        }

        const result = await pluginManager.savePluginGlobalConfig(pluginId, req.body);

        if (result.success) {
            res.status(200).json({
                message: `Plugin '${pluginId}' config updated`,
                config: await pluginManager.getPluginGlobalConfig(pluginId)
            });
        } else {
            const validationErrors = result.validationErrors;
            const errors = validationErrors?.errors || (validationErrors?.error ? [validationErrors.error] : []);
            
            res.status(400).json({
                error: "PLUGIN_CONFIG_PATCH_FAILED",
                pluginId: pluginId,
                message: result.message,
                validationErrors: errors,
            });
        }
    }));

    // Centralized route for testing a plugin's connection with a given config.
    router.post('/:pluginId/test', asyncHandler(async (req, res) => {
        const { pluginId } = req.params;
        const configToTest = req.body;
        const pluginInstance = pluginManager.getPluginInstance(pluginId as string);

        if (!pluginInstance) {
            return res.status(404).json({ success: false, message: `Plugin '${pluginId}' not found.` });
        }

        const result = await pluginInstance.testConnection!(configToTest);
        res.json({ pluginId, ...result });
    }));

    return router;
}