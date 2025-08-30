/* FILE: packages/shared/index.ts */
// Barrel file for shared modules.

// Constants
import * as ALL_EVENTS from './constants/events.js';
export { ALL_EVENTS };
export * from './constants/events.js';
export * from './constants/gestures.js';
export * from './constants/icons.js';

// Core & Services
export * from './core/pubsub.js';
export * from './services/security-utils.js';
export { translations, translate, getCurrentLanguage, defaultLang } from './services/translations.js';
export type { LanguageCode, Translations, Substitutions } from './services/translations.js';

// Utils & Validation
export * from './utils/index.js';
export * from './validation/schemas.js';

// Types
export type * from './types/api.types.js';
export type * from './types/config.types.js';
export type * from './types/plugin.types.js';
export type * from './types/ws.protocol.js';