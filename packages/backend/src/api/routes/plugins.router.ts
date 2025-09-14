/* FILE: packages/backend/src/api/routes/plugins.router.ts */
import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';

import type { PluginManagerService } from '../../services/plugin-manager.service.js';

const asyncHandler = (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) =>
    (req: Request, res: Response, next: NextFunction) => { Promise.resolve(fn(req, res, next)).catch(next); };

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
        const result = await pluginManager.initiatePluginUninstall(pluginId);
        res.status(result.success ? 200 : 400).json(result);
    }));

    router.post('/manage/:pluginId/state', asyncHandler(async (req, res) => {
        const { pluginId } = req.params;
        const { state } = req.body; // Expects "enabled" or "disabled"
        if (state !== 'enabled' && state !== 'disabled') {
            return res.status(400).json({ success: false, message: 'Invalid state provided. Must be "enabled" or "disabled".' });
        }
        const result = await pluginManager.setPluginState(pluginId, state);
        res.status(result.success ? 200 : 400).json(result);
    }));

    // --- Dynamic API Routes for each enabled plugin ---
    const allManifests = pluginManager.getAllPluginManifestsSync();
    allManifests.forEach(manifest => {
        if (manifest.status === 'enabled') {
            const pluginInstance = pluginManager.getPluginInstance(manifest.id);
            const pluginApiRouter = pluginInstance?.getApiRouter?.();
            if (pluginApiRouter) {
                router.use(`/${manifest.id}`, pluginApiRouter);
            }
        }
    });

    // --- Core config and test routes that use :pluginId must come after the dynamic mounts ---
    router.get('/:pluginId/config', asyncHandler(async (req, res) => {
        const config = await pluginManager.getPluginGlobalConfig(req.params.pluginId);
        const manifest = pluginManager.getPluginManifest(req.params.pluginId);
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
        if (typeof req.body !== 'object' || req.body === null) {
            return res.status(400).json({ error: "BAD_REQUEST_PAYLOAD" });
        }
        const result = await pluginManager.savePluginGlobalConfig(req.params.pluginId, req.body);
        if (result.success) {
            res.status(200).json({
                message: `Plugin '${req.params.pluginId}' config updated`,
                config: await pluginManager.getPluginGlobalConfig(req.params.pluginId)
            });
        } else {
            const validationErrors = result.validationErrors;
            const errors = validationErrors?.errors || (validationErrors?.error ? [validationErrors.error] : []);
            res.status(400).json({
                error: "PLUGIN_CONFIG_PATCH_FAILED",
                pluginId: req.params.pluginId,
                message: result.message,
                validationErrors: errors,
            });
        }
    }));
    
    // Centralized route for testing a plugin's connection with a given config.
    router.post('/:pluginId/test', asyncHandler(async (req, res) => {
        const { pluginId } = req.params;
        const configToTest = req.body;

        const pluginInstance = pluginManager.getPluginInstance(pluginId);
        if (!pluginInstance) {
            return res.status(404).json({ success: false, message: `Plugin '${pluginId}' not found.` });
        }
        
        // The base plugin provides a default testConnection, so this should always exist.
        const result = await pluginInstance.testConnection!(configToTest);
        
        // The result from testConnection already has { success, messageKey, error }.
        // We add the pluginId for context on the frontend.
        res.json({ pluginId, ...result });
    }));

    return router;
}