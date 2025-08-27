/* FILE: packages/backend/src/api/routes/config.router.ts */
import { Router, type Request, type Response, type NextFunction } from 'express';
import type { ConfigService } from '../../services/config.service.js';

const asyncHandler = (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) =>
    (req: Request, res: Response, next: NextFunction) => { Promise.resolve(fn(req, res, next)).catch(next); };

export default function createConfigRouter(configService: ConfigService): Router {
    const router = Router();

    router.get('/', asyncHandler(async (_req, res) => {
        res.json(await configService.getFullConfig());
    }));

    router.patch('/', asyncHandler(async (req, res) => {
        if (typeof req.body !== 'object' || req.body === null) {
            return res.status(400).json({ error: "BAD_REQUEST" });
        }
        const result = await configService.patchConfig(req.body);
        if (result.success) {
            res.status(200).json({ message: "Global config updated", config: await configService.getFullConfig(), validationErrors: result.validationErrors });
        } else {
            res.status(400).json({ error: "GLOBAL_CONFIG_PATCH_FAILED", message: result.message, validationErrors: result.validationErrors });
        }
    }));

    return router;
}
