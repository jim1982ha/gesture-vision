/* FILE: packages/backend/src/services/mtx-monitor.service.ts */
import { BACKEND_INTERNAL_EVENTS } from '#shared/constants/events.js';
import { pubsub } from '#shared/core/pubsub.js';
import { normalizeNameForMtx } from '#shared/utils/index.js';

import { callMtxApi } from '../mtx-api-helpers.js';

import type { RtspSourceConfig, StreamStatusPayload } from "#shared/index.js";
import type { ConfigService } from './config.service.js';

interface MtxPathConf {
    name?: string; source?: string; sourceOnDemand?: boolean; runOnReady?: string; runOnNotReady?: string;
}
interface MtxPathConfList { items?: MtxPathConf[] }
interface MtxPathConfPayload {
    source?: string; sourceOnDemand?: boolean; sourceOnDemandStartTimeout?: string;
    sourceOnDemandCloseAfter?: string; runOnReady?: string; runOnNotReady?: string;
}

type BroadcastStreamStatusFn = (payload: StreamStatusPayload) => void;

const BACKEND_SERVICE_NAME = process.env.NODE_ENV === 'development' ? 'localhost' : 'gesturevision';
const BACKEND_SERVICE_PORT = process.env.DEV_BACKEND_API_PORT_INTERNAL || '9001';

export class MtxMonitorService {
    private configService: ConfigService;
    private isRunning = false;
    private streamStatusBroadcaster: BroadcastStreamStatusFn | null = null;
    private readonly _configUpdateHandler: (data?: unknown) => void;

    constructor(configService: ConfigService) {
        if (!configService) throw new Error("MtxMonitorService requires a ConfigService instance.");
        this.configService = configService;
        this._configUpdateHandler = (data?: unknown) => this.#handleConfigChangeWrapper(data as { rtspChanged?: boolean } | undefined);
        pubsub.subscribe(BACKEND_INTERNAL_EVENTS.CONFIG_PATCHED, this._configUpdateHandler);
        pubsub.subscribe(BACKEND_INTERNAL_EVENTS.CONFIG_RELOADED, this._configUpdateHandler);
    }

    #handleConfigChangeWrapper = (eventData?: { rtspChanged?: boolean }): void => {
      console.log(`[MtxMonitorService] Config change event. rtspChanged: ${eventData?.rtspChanged ?? 'N/A'}. Triggering sync.`);
      if (eventData?.rtspChanged !== false) this.syncMtxPathsWithConfig(); 
    }

    async start() {
        if (this.isRunning || !this.streamStatusBroadcaster) {
            if (!this.streamStatusBroadcaster) console.error("[MtxMonitorService] Cannot start: StreamStatusBroadcaster not set.");
            return;
        }
        console.log("[MtxMonitorService] Starting...");
        await this.configService.initializationPromise; 
        await this.syncMtxPathsWithConfig();
        this.isRunning = true;
        console.log(`[MtxMonitorService] Started. Relying on webhooks for status updates.`);
    }

    stop() {
        if (!this.isRunning) return;
        console.log("[MtxMonitorService] Stopping...");
        pubsub.unsubscribe(BACKEND_INTERNAL_EVENTS.CONFIG_PATCHED, this._configUpdateHandler);
        pubsub.unsubscribe(BACKEND_INTERNAL_EVENTS.CONFIG_RELOADED, this._configUpdateHandler);
        this.isRunning = false; console.log("[MtxMonitorService] Stopped.");
    }

    async syncMtxPathsWithConfig() {
        console.log("[MtxMonitorService SYNC_START] Syncing RTSP sources with MediaMTX.");
        try {
            const desiredPaths = new Map(this.configService.getRtspSources().filter(s => s?.name && s.url).map(s => [normalizeNameForMtx(s.name), s]));
            const mtxPathsData = await callMtxApi<MtxPathConfList>('/v3/config/paths/list');
            const currentPaths = new Map((mtxPathsData?.items || []).filter(p => p.name).map(p => [p.name!, p]));

            const pathsToRemove = Array.from(currentPaths.keys()).filter(key => !desiredPaths.has(key));
            const pathsToSync = Array.from(desiredPaths.keys()).filter(key => {
                const desired = desiredPaths.get(key); const current = currentPaths.get(key);
                return !current || desired?.url !== current.source || !!desired?.sourceOnDemand !== !!current.sourceOnDemand;
            });
            
            for (const key of pathsToRemove) await this.deletePathConfig(key);
            for (const key of pathsToSync) await this.addOrUpdatePathConfig(key, desiredPaths.get(key)!);
            
        } catch (e) { console.error("[MtxMonitorService] Critical error during stream/path sync:", (e as Error).message); }
        console.log("[MtxMonitorService SYNC_END] Finished sync.");
    }

    private createPayload(source: RtspSourceConfig, key: string): MtxPathConfPayload {
        const getWebhookUrl = (status: 'ready' | 'notReady') => `curl -X POST http://${BACKEND_SERVICE_NAME}:${BACKEND_SERVICE_PORT}/api/mtx-hook/${status}/${encodeURIComponent(key)}`;
        const basePayload: MtxPathConfPayload = { source: source.url, sourceOnDemand: !!source.sourceOnDemand };
        if (basePayload.sourceOnDemand) {
            return { ...basePayload, sourceOnDemandStartTimeout: '15s', sourceOnDemandCloseAfter: '15s' };
        }
        return { ...basePayload, runOnReady: getWebhookUrl('ready'), runOnNotReady: getWebhookUrl('notReady') };
    }

    async addOrUpdatePathConfig(key: string, source: RtspSourceConfig) {
        const payload = this.createPayload(source, key);
        try {
            await callMtxApi(`/v3/config/paths/replace/${key}`, 'POST', payload);
        } catch (err: unknown) {
            console.error(`[MtxMonitorService] Failed to sync path '${key}':`, (err as Error).message);
        }
    }
    
    public async connectOnDemandStream(pathName: string) {
        const sourceConfig = (this.configService.getRtspSources()).find(s => normalizeNameForMtx(s.name) === pathName);
        if (!sourceConfig?.url) throw new Error(`Configuration for RTSP source '${pathName}' not found or URL is missing.`);
        
        try {
            await this.addOrUpdatePathConfig(pathName, sourceConfig);
            this.streamStatusBroadcaster?.({ pathName, status: 'unknown', message: 'Path config ensured, awaiting client connection.' });
        } catch (error: unknown) {
            const message = (error as Error).message;
            this.streamStatusBroadcaster?.({ pathName, status: 'error', message: `Failed API interaction: ${message}` });
            throw new Error(`Failed to configure on-demand path '${pathName}': ${message}`);
        }
    }

    public async disconnectOnDemandStream(pathName: string) {
        await this.deletePathConfig(pathName);
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