// --- packages/backend/src/services/performance-monitor.service.ts --- (complete version) ---
import fs from 'fs/promises';
import path from 'path';
import type { PerformanceMetricsPayload } from '#shared/index.js';

const PERF_LOG_DIR = '/app/logs';

// Conditional log file name
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const LOG_FILE_NAME = IS_PRODUCTION ? 'performance.log' : 'performance.dev.log';
const PERF_LOG_FILE = path.join(PERF_LOG_DIR, LOG_FILE_NAME);

const MAX_LOG_SIZE_MB = 1; 
const MAX_LOG_SIZE_BYTES = MAX_LOG_SIZE_MB * 1024 * 1024;
const ROTATION_CHECK_INTERVAL_MS = 60000; // Check rotation every 1 minute

/**
 * Manages logging of performance metrics to a file with rotation policy.
 */
export class PerformanceMonitorService {
    private rotationTimer: NodeJS.Timeout | null = null;
    private isInitialized = false;

    constructor() {
        this.initialize();
    }

    private async initialize(): Promise<void> {
        try {
            await fs.mkdir(PERF_LOG_DIR, { recursive: true });
            this.rotationTimer = setInterval(() => this.checkAndRotateLog(), ROTATION_CHECK_INTERVAL_MS);
            this.isInitialized = true;
            this.logEntry('INFO', `Performance monitoring service started (Log: ${LOG_FILE_NAME}).`);
        } catch (error) {
            console.error('[PerfMonitor] Failed to initialize log directory:', error);
        }
    }

    public destroy(): void {
        if (this.rotationTimer) {
            clearInterval(this.rotationTimer);
            this.rotationTimer = null;
        }
    }

    private async checkAndRotateLog(): Promise<void> {
        try {
            const stats = await fs.stat(PERF_LOG_FILE);
            if (stats.size > MAX_LOG_SIZE_BYTES) {
                console.log(`[PerfMonitor] Log size ${(stats.size / (1024 * 1024)).toFixed(2)}MB exceeds limit of ${MAX_LOG_SIZE_MB}MB. Rotating log.`);
                // Create a backup file with a timestamp
                await fs.rename(PERF_LOG_FILE, PERF_LOG_FILE.replace('.log', `-${Date.now()}.old.log`));
                this.logEntry('INFO', 'Log rotated successfully.');
            }
        } catch (error) {
            // ENOENT is expected if the file doesn't exist yet, so we only log other errors
            if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
                console.error('[PerfMonitor] Error during log rotation:', error);
            }
        }
    }

    public async logPerformanceMetrics(payload: PerformanceMetricsPayload): Promise<void> {
        if (!this.isInitialized) {
            console.warn('[PerfMonitor] Attempted to log before initialization.');
            return;
        }

        // CHANGE: Added an unconditional console.log to verify message receipt on the backend.
        console.log(`[PerfMonitor] Received metrics from frontend for source: ${payload.source}. Attempting to write to ${LOG_FILE_NAME}...`);

        const timestamp = new Date().toISOString();
        const data: Record<string, unknown> = {
            ts: timestamp,
            src: payload.source,
            stream: payload.isStreaming ? 'ACTIVE' : 'INACTIVE',
            act_fps: payload.actualFPS,
            targ_fps: payload.targetFPS,
            proc_ms: payload.processingTimeMs,
            latency_ms: payload.latencyEstimateMs,
            mem_mb: payload.memoryUsedMB,
            heap_ratio: payload.heapUsedRatio,
        };
        
        const logLine = JSON.stringify(data) + '\n';
        
        try {
            await fs.appendFile(PERF_LOG_FILE, logLine, 'utf-8');
        } catch (error) {
            console.error('[PerfMonitor] FAILED to append to log file:', error);
        }
    }

    public async logEntry(level: 'INFO' | 'WARN' | 'ERROR', message: string): Promise<void> {
        if (!this.isInitialized) return;
        const timestamp = new Date().toISOString();
        const logLine = JSON.stringify({ ts: timestamp, level, msg: message }) + '\n';
        try {
            await fs.appendFile(PERF_LOG_FILE, logLine, 'utf-8');
        } catch (error) {
            console.error('[PerfMonitor] Failed to append info to log file:', error);
        }
    }
}