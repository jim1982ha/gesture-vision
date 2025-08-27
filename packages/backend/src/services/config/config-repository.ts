/* FILE: packages/backend/src/services/config/config-repository.ts */
import fs from 'fs/promises';
import path from 'path';

import { ZodSchema, type ZodError } from 'zod';

const CONFIG_PATH = "/app/config.json";

export class ConfigRepository {

  public async readConfigFile<T>(schema?: ZodSchema<T>): Promise<T | null> {
    try {
      const fileContent = await fs.readFile(CONFIG_PATH, 'utf-8');
      const data = JSON.parse(fileContent);
      if (schema) {
        return schema.parse(data) as T;
      }
      return data as T;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        console.error(`[ConfigRepository] Error reading or parsing ${CONFIG_PATH}:`, error);
      }
      return null;
    }
  }

  public async writeConfigFile<T>(data: T, schema?: ZodSchema<T>): Promise<boolean> {
    try {
      const dataToWrite = schema ? schema.parse(data) : data;
      await fs.mkdir(path.dirname(CONFIG_PATH), { recursive: true });
      await fs.writeFile(CONFIG_PATH, JSON.stringify(dataToWrite, null, 2));
      return true;
    } catch (error) {
      console.error(`[ConfigRepository] Error writing to ${CONFIG_PATH}:`, error);
      return false;
    }
  }

  // Generic methods for plugin configs
  public async readPluginConfigFile<T>(filePath: string, schema?: ZodSchema<T>): Promise<T | null> {
    try {
        const data = JSON.parse(await fs.readFile(filePath, 'utf-8'));
        return schema ? schema.parse(data) : data as T;
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
            console.error(`[ConfigRepository] Error reading plugin config ${filePath}:`, (error as ZodError).issues || error);
        }
        return null;
    }
  }
  
  public async writePluginConfigFile<T>(filePath: string, data: T, schema?: ZodSchema<T>): Promise<boolean> {
      try {
          const dataToWrite = schema ? schema.parse(data) : data;
          await fs.mkdir(path.dirname(filePath), { recursive: true });
          await fs.writeFile(filePath, JSON.stringify(dataToWrite, null, 2));
          return true;
      } catch (error) {
          console.error(`[ConfigRepository] Error writing plugin config ${filePath}:`, (error as ZodError).issues || error);
          return false;
      }
  }
}