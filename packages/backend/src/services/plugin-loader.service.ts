/* FILE: packages/backend/src/services/plugin-loader.service.ts */
import fs from 'fs/promises';
import path from 'path';
import type { PluginManifest } from '#shared/index.js';

const PLUGINS_DIR = '/app/extensions/plugins';
const DISABLED_PLUGINS_FILE = path.join(PLUGINS_DIR, 'disabled-plugins.json');

/**
 * Service responsible for discovering, reading, and dynamically loading plugins from the filesystem.
 */
export class PluginLoaderService {
  public async loadDisabledPluginIds(): Promise<Set<string>> {
    try {
      const data = await fs.readFile(DISABLED_PLUGINS_FILE, 'utf-8');
      const disabled = JSON.parse(data);
      return new Set(Array.isArray(disabled) ? disabled : []);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') {
        console.error('[PluginLoader] Error reading disabled-plugins.json:', e);
      }
      return new Set();
    }
  }

  public async saveDisabledPluginIds(disabledIds: Set<string>): Promise<void> {
    try {
      await fs.writeFile(DISABLED_PLUGINS_FILE, JSON.stringify(Array.from(disabledIds), null, 2));
    } catch (e) {
      console.error('[PluginLoader] Error saving disabled-plugins.json:', e);
    }
  }

  public async discoverPlugins(): Promise<PluginManifest[]> {
    const manifests: PluginManifest[] = [];
    try {
      const pluginDirs = await fs.readdir(PLUGINS_DIR, { withFileTypes: true });
      for (const dirent of pluginDirs) {
        if (!dirent.isDirectory() || dirent.name.startsWith('_') || dirent.name === 'common' || dirent.name === 'plugin-template') continue;
        
        const manifestPath = path.join(PLUGINS_DIR, dirent.name, 'plugin.json');
        try {
          const manifest: PluginManifest = JSON.parse(await fs.readFile(manifestPath, 'utf-8'));
          if (manifest.id !== dirent.name) {
            console.warn(`[PluginLoader] Manifest ID ('${manifest.id}') mismatch with dir ('${dirent.name}'). Using dir name.`);
            manifest.id = dirent.name;
          }
          manifests.push(manifest);
        } catch (error) {
          console.error(`[PluginLoader] Failed to load manifest from '${dirent.name}':`, error);
        }
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        console.error('[PluginLoader] Error discovering plugins:', error);
      }
    }
    return manifests;
  }

  public async getPluginLocales(pluginDirName: string): Promise<Record<string, Record<string, string>> | undefined> {
    const localesDir = path.join(PLUGINS_DIR, pluginDirName, 'locales');
    try {
      const files = await fs.readdir(localesDir);
      const localeData: Record<string, Record<string, string>> = {};
      for (const file of files.filter(f => f.endsWith('.json'))) {
        const lang = path.basename(file, '.json');
        const content = await fs.readFile(path.join(localesDir, file), 'utf-8');
        localeData[lang] = JSON.parse(content);
      }
      return Object.keys(localeData).length > 0 ? localeData : undefined;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') {
        console.error(`[PluginLoader] Error reading locales for plugin ${pluginDirName}:`, e);
      }
      return undefined;
    }
  }
}