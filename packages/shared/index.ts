/* FILE: packages/shared/index.ts */
// Barrel file for shared modules.

// Constants
export * from './constants/events.js';
export * from './constants/gestures.js';
export * from './constants/icons.js';

// Core & Services
export * from './core/pubsub.js';
export * from './services/security-utils.js';
export { translations, defaultLang } from './services/translations.js';
export type { LanguageCode, Translations, Substitutions } from './services/translations.js';

// Types (from individual files)
// NOTE: api.types.ts is intentionally omitted to prevent duplicate type exports with Zod schemas.
export * from './types/config.types.js';
export * from './types/plugin.types.js';
export * from './types/ws.protocol.js';

// Utils & Validation (Zod schemas are the source of truth for data shapes)
export * from './utils/index.js';
export * from './validation/index.js';