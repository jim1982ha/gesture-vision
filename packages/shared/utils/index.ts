/* FILE: packages/shared/utils/index.ts */
// This file contains truly universal utility functions, safe for both frontend and backend.

/**
 * Normalizes a user-provided name into a safe format for filenames or identifiers.
 * @param name - The user-provided string.
 * @returns A sanitized string.
 */
export function normalizeNameForMtx(name: string | null | undefined): string {
  if (!name || typeof name !== 'string') return 'unnamed';
  const normalized = name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/__+/g, '_')
    .replace(/^_+|_+$/g, '');
  return normalized === '' ? 'unnamed' : normalized;
}

/**
 * Processes a template string, replacing placeholders like {{key}} with values from a data object.
 * @param template - The string containing placeholders.
 * @param data - An object with keys matching the placeholders.
 * @returns The processed string.
 */
export function processActionTemplate(
  template: string,
  data: Record<string, unknown>
): string {
  let processed = template;
  for (const key in data) {
    if (Object.prototype.hasOwnProperty.call(data, key)) {
      const placeholder = new RegExp(`{{\\s*${key}\\s*}}`, 'g');
      processed = processed.replace(placeholder, String(data[key]));
    }
  }
  return processed;
}