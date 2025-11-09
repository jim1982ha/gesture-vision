import { Router } from 'express';
import { pubsub, BACKEND_INTERNAL_EVENTS, normalizeNameForMtx, RoiConfigSchema, type RtspSourceConfig } from '#shared/index.js';
import type { ConfigService } from '../../services/config.service.js';
import { asyncHandler } from '../async-handler.js';

/**
 * Creates a router for core application API endpoints that are not related to plugins or general config.
 * @param configService - The application's configuration service.
 * @returns An Express router instance.
 */
export default function createCoreRouter(configService: ConfigService): Router {
    const router = Router();

    /**
     * Handles ROI updates for a specific RTSP source.
     */
    router.patch('/rtsp/:pathName/roi', asyncHandler(async (req, res) => {
        const { pathName } = req.params;
        const validation = RoiConfigSchema.safeParse(req.body);
        if (!validation.success) {
            return res.status(400).json({ error: 'INVALID_ROI_PAYLOAD', details: validation.error.flatten() });
        }

        const currentConfig = await configService.getFullConfig();
        const sourceIndex = currentConfig.rtspSources.findIndex((s: RtspSourceConfig) => normalizeNameForMtx(s.name) === pathName);

        if (sourceIndex === -1) {
            return res.status(404).json({ error: 'RTSP_SOURCE_NOT_FOUND' });
        }
        
        currentConfig.rtspSources[sourceIndex].roi = validation.data;
        await configService._writeConfig(currentConfig);

        pubsub.publish(BACKEND_INTERNAL_EVENTS.CONFIG_RELOADED, { updatedConfig: currentConfig, rtspChanged: false });
        res.status(200).json({ message: `ROI for ${pathName} updated successfully.` });
    }));

    /**
     * Handles webhook callbacks from MediaMTX for stream status changes.
     */
    router.post('/mtx-hook/:status/:pathName', (req, res) => {
        const { status, pathName } = req.params;
        const broadcastStatus: 'active' | 'inactive' = status === 'ready' ? 'active' : 'inactive';
        configService._broadcastStreamStatus({ pathName, status: broadcastStatus, message: `Webhook: ${status}` });
        res.status(200).send('OK');
    });

    return router;
}