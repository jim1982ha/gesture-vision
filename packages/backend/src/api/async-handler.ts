/* FILE: packages/backend/src/api/async-handler.ts */
import { type Request, type Response, type NextFunction, type RequestHandler } from 'express';

/**
 * Wraps an asynchronous Express route handler to catch any thrown errors
 * and pass them to the Express error handling middleware via next().
 * This prevents the server from crashing on unhandled promise rejections.
 *
 * @param fn The asynchronous route handler function.
 * @returns A standard Express RequestHandler.
 */
export const asyncHandler = (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler =>
    (req: Request, res: Response, next: NextFunction) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };