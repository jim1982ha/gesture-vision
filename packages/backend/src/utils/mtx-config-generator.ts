/* FILE: packages/backend/src/utils/mtx-config-generator.ts */
import fs from 'fs/promises';
import type { RtspSourceConfig } from '#shared/index.js';
import { normalizeNameForMtx } from '#shared/index.js';

const MTX_CONFIG_PATH = '/tmp/generated_mediamtx.yml';

// FIX: Determine correct backend host for internal callbacks.
// In HA Add-on or single-container mode, this must be localhost/127.0.0.1.
// In Docker Compose, it might be the service name 'gesturevision'.
const IS_HA_ADDON = !!process.env.SUPERVISOR_TOKEN;
const BACKEND_HOST = process.env.NODE_ENV === 'development' ? 'localhost' : (IS_HA_ADDON ? '127.0.0.1' : 'gesturevision');
const BACKEND_PORT = process.env.BACKEND_API_PORT_INTERNAL || '9001';

/**
 * Generates the mediamtx.yml configuration file based on the application's config.
 * It includes paths for "always-on" RTSP sources.
 */
export async function generateMtxConfig(): Promise<void> {
  let configContent = 'paths: {}\n';

  try {
    const fileContent = await fs.readFile('/app/config.json', 'utf-8');
    const config: { rtspSources?: RtspSourceConfig[] } = JSON.parse(fileContent);

    if (config && Array.isArray(config.rtspSources) && config.rtspSources.length > 0) {
      const alwaysOnPaths = config.rtspSources
        .filter(
          (source) => source?.name && source.url && source.sourceOnDemand !== true
        )
        .map(
          (source) => {
            const key = normalizeNameForMtx(source.name);
            const webhookUrlReady = `http://${BACKEND_HOST}:${BACKEND_PORT}/api/mtx-hook/ready/${encodeURIComponent(key)}`;
            const webhookUrlNotReady = `http://${BACKEND_HOST}:${BACKEND_PORT}/api/mtx-hook/notReady/${encodeURIComponent(key)}`;
            
            // FIX: Added retry logic to curl. 
            // --retry 10: Try 10 times
            // --retry-connrefused: Retry even if connection is refused (Server starting up)
            // --retry-delay 1: Wait 1 second between retries
            // --max-time 5: Timeout each request after 5 seconds
            return `  ${key}:
    source: ${JSON.stringify(source.url)}
    runOnReady: sh -c "curl -sS --retry 10 --retry-connrefused --retry-delay 1 --max-time 5 -X POST ${webhookUrlReady}"
    runOnNotReady: sh -c "curl -sS --retry 10 --retry-connrefused --retry-delay 1 --max-time 5 -X POST ${webhookUrlNotReady}"`;
          }
        )
        .join('\n');

      if (alwaysOnPaths) {
        configContent = `paths:\n${alwaysOnPaths}\n`;
      }
    }
  } catch (e: unknown) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') {
      console.error(
        '[MtxConfigGenerator] Error reading main config for MediaMTX generation:',
        e
      );
    }
  }

  try {
    await fs.writeFile(MTX_CONFIG_PATH, configContent);
  } catch (e: unknown) {
    console.error(
      `[MtxConfigGenerator] CRITICAL: Failed to write MediaMTX config file at ${MTX_CONFIG_PATH}:`,
      e
    );
  }
}