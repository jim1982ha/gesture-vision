/* FILE: packages/backend/src/utils/mtx-config-generator.ts */
import fs from 'fs/promises';

import type { RtspSourceConfig } from '#shared/index.js';

const MTX_CONFIG_PATH = '/tmp/generated_mediamtx.yml';

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
          (source) =>
            `  ${source.name
              .toLowerCase()
              .replace(/[^a-z0-9_]/g, '_')}:\n    source: ${JSON.stringify(
              source.url
            )}`
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