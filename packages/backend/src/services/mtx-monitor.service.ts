/* FILE: packages/backend/src/services/mtx-monitor.service.ts */
import { BACKEND_INTERNAL_EVENTS, pubsub, normalizeNameForMtx, type FullConfiguration, type RtspSourceConfig, type StreamStatusPayload } from '#shared/index.js';
import { callMtxApi } from '../mtx-api-helpers.js';

interface MtxPathConf {
    name?: string; source?: string; sourceOnDemand?: boolean; runOnReady?: string; runOnNotReady?: string;
}

interface MtxPathConfList { items?: MtxPathConf[] }

interface MtxPathConfPayload {
    source?: string; sourceOnDemand?: boolean; sourceOnDemandStartTimeout?: string;
    sourceOnDemandCloseAfter?: string; runOnReady?: string; runOnNotReady?: string;
}

type BroadcastStreamStatusFn = (payload: StreamStatusPayload) => void;

// FIX: Internal callbacks always use 127.0.0.1 since MediaMTX and Node run in the same container.
// This avoids relying on Docker DNS which can fail depending on the orchestrator.
const BACKEND_SERVICE_NAME = process.env.NODE_ENV === 'development' ? 'localhost' : '127.0.0.1';
const BACKEND_SERVICE_PORT = process.env.BACKEND_API_PORT_INTERNAL || process.env.DEV_BACKEND_API_PORT_INTERNAL || '9001';

export class MtxMonitorService {
    private isRunning = false;
    private streamStatusBroadcaster: BroadcastStreamStatusFn | null = null;
    private _configUpdateHandler: (data?: unknown) => void;

    constructor() {
        this._configUpdateHandler = (data?: unknown) => this.#handleConfigChange(data as { updatedConfig: FullConfiguration; rtspChanged?: boolean } | undefined);
        pubsub.subscribe(BACKEND_INTERNAL_EVENTS.CONFIG_PATCHED, this._configUpdateHandler);
        pubsub.subscribe(BACKEND_INTERNAL_EVENTS.CONFIG_RELOADED, this._configUpdateHandler);
    }

    #handleConfigChange = (eventData?: { updatedConfig: FullConfiguration; rtspChanged?: boolean }): void => {
      // Sync only if RTSP sources have actually changed or it's a full reload.
      if (eventData?.updatedConfig && (eventData.rtspChanged || eventData.rtspChanged === undefined)) {
        this.syncMtxPathsWithConfig(eventData.updatedConfig.rtspSources); 
      }
    }

    async start() {
        if (this.isRunning) return;
        console.log("[MtxMonitorService] Starting...");
        this.isRunning = true;
        // Initial sync on startup will be triggered by the first CONFIG_RELOADED event from ConfigService.
        console.log(`[MtxMonitorService] Started. Awaiting initial config to sync paths.`);
    }

    stop() {
        if (!this.isRunning) return;
        console.log("[MtxMonitorService] Stopping...");
        pubsub.unsubscribe(BACKEND_INTERNAL_EVENTS.CONFIG_PATCHED, this._configUpdateHandler);
        pubsub.unsubscribe(BACKEND_INTERNAL_EVENTS.CONFIG_RELOADED, this._configUpdateHandler);
        this.isRunning = false; console.log("[MtxMonitorService] Stopped.");
    }

    // MODIFIED: Added waitForMtx flag to handle startup race condition
    async syncMtxPathsWithConfig(rtspSources: RtspSourceConfig[]) {
        console.log("[MtxMonitorService SYNC_START] Syncing RTSP sources with MediaMTX.");
        
        // Wait for MediaMTX to be responsive before trying to list paths
        const mtxReady = await this.#waitForMediaMtx();
        if (!mtxReady) {
             console.error("[MtxMonitorService] MediaMTX did not become ready. Skipping sync.");
             return;
        }

        try {
            const desiredPaths = new Map((rtspSources ||[]).filter(s => s?.name && s.url).map(s =>[normalizeNameForMtx(s.name), s]));
            const mtxPathsData = await callMtxApi<MtxPathConfList>('/v3/config/paths/list');
            const currentPaths = new Map((mtxPathsData?.items ||[]).filter(p => p.name).map(p => [p.name!, p]));

            const pathsToRemove = Array.from(currentPaths.keys()).filter(key => !desiredPaths.has(key));
            // Always sync all desired paths to ensure their configuration is up-to-date.
            const pathsToSync = Array.from(desiredPaths.keys());

            for (const key of pathsToRemove) await this.deletePathConfig(key);
            for (const key of pathsToSync) await this.addOrUpdatePathConfig(key, desiredPaths.get(key)!);

        } catch (e) { console.error("[MtxMonitorService] Critical error during stream/path sync:", (e as Error).message); }
        
        console.log("[MtxMonitorService SYNC_END] Finished sync.");
    }

    // NEW: Poll MediaMTX API until it responds
    async #waitForMediaMtx(retries = 10, delay = 1000): Promise<boolean> {
        for (let i = 0; i < retries; i++) {
            try {
                // Simple health check call
                await callMtxApi('/v3/paths/list'); 
                return true;
            } catch (_e) { 
                if (i === retries - 1) return false;
                await new Promise(r => setTimeout(r, delay));
            }
        }
        return false;
    }

    private createPayload(source: RtspSourceConfig, key: string): MtxPathConfPayload {
        const getWebhookUrl = (status: 'ready' | 'notReady') => `http://${BACKEND_SERVICE_NAME}:${BACKEND_SERVICE_PORT}/api/mtx-hook/${status}/${encodeURIComponent(key)}`;
        const basePayload: MtxPathConfPayload = { source: source.url, sourceOnDemand: !!source.sourceOnDemand };
        
        if (basePayload.sourceOnDemand) {
            return { ...basePayload, sourceOnDemandStartTimeout: '15s', sourceOnDemandCloseAfter: '15s' };
        }

        // For always-on streams, use runOnReady/NotReady with curl (lighter than wget).
        return {
            ...basePayload,
            runOnReady: `sh -c "curl -sS -X POST ${getWebhookUrl('ready')}"`,
            runOnNotReady: `sh -c "curl -sS -X POST ${getWebhookUrl('notReady')}"`
        };
    }

    async addOrUpdatePathConfig(key: string, source: RtspSourceConfig) {
        const payload = this.createPayload(source, key);
        try {
            // Use 'replace' which acts as add/update, simplifying the logic.
            await callMtxApi(`/v3/config/paths/replace/${key}`, 'POST', payload);
        } catch (err: unknown) {
            console.error(`[MtxMonitorService] Failed to sync path '${key}':`, (err as Error).message);
        }
    }

    public async connectOnDemandStream(pathName: string, rtspSources: RtspSourceConfig[]) {
        const sourceConfig = rtspSources.find(s => normalizeNameForMtx(s.name) === pathName);
        if (!sourceConfig?.url) throw new Error(`Configuration for RTSP source '${pathName}' not found or URL is missing.`);

        try {
            // This is robust for both on-demand and always-on streams.
            await this.addOrUpdatePathConfig(pathName, sourceConfig);
            this.streamStatusBroadcaster?.({ pathName, status: 'unknown', message: 'Path config ensured, awaiting client connection.' });
        } catch (error: unknown) {
            const message = (error as Error).message;
            this.streamStatusBroadcaster?.({ pathName, status: 'error', message: `Failed API interaction: ${message}` });
            throw new Error(`Failed to configure path '${pathName}': ${message}`);
        }
    }

    public async disconnectOnDemandStream(pathName: string) {
        // For on-demand streams, MediaMTX handles the disconnection automatically after a timeout.
        // We can optionally kick any readers if immediate disconnect is needed, but it's often not required.
        this.streamStatusBroadcaster?.({ pathName, status: 'inactive', message: 'Disconnected on demand by request.' });
    }

    async deletePathConfig(pathName: string): Promise<void> {
        try { await callMtxApi(`/v3/config/paths/delete/${pathName}`, 'DELETE');
        } catch (error: unknown) {
            if (!(error as Error).message.includes('404')) console.warn(`[MtxMonitorService] Failed to delete path '${pathName}':`, (error as Error).message);
        }
    }

    setStreamStatusBroadcaster = (fn: BroadcastStreamStatusFn) => { this.streamStatusBroadcaster = fn; }
}