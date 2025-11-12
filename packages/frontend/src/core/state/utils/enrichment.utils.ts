import { getGestureDisplayInfo, type CustomGestureMetadata, type EnrichedGestureConfig, type EnrichedCustomGestureMetadata, type GestureConfig, type PoseConfig } from '#shared/index.js';

/**
 * Enriches a list of gesture configurations with pre-computed display information.
 * @param configs - The raw gesture configs from config.json.
 * @param customGestureMetadataList - The list of metadata for custom gestures.
 * @returns An array of enriched gesture configurations.
 */
export function enrichGestureConfigs(
  configs: (GestureConfig | PoseConfig)[],
  customGestureMetadataList: CustomGestureMetadata[]
): EnrichedGestureConfig[] {
  return configs.map((config) => {
    const gestureName = 'gesture' in config ? config.gesture : config.pose;
    const display = getGestureDisplayInfo(gestureName, customGestureMetadataList);
    return { ...config, display };
  });
}

/**
 * Enriches a list of custom gesture metadata with pre-computed display information.
 * @param metadataList - The raw custom gesture metadata.
 * @returns An array of enriched custom gesture metadata.
 */
export function enrichCustomGestureMetadata(
  metadataList: CustomGestureMetadata[]
): EnrichedCustomGestureMetadata[] {
  return metadataList.map((meta) => ({
    ...meta,
    display: getGestureDisplayInfo(meta.name, metadataList),
  }));
}