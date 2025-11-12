/* FILE: packages/shared/validation/plugin.schemas.ts */
import { z } from 'zod';

export const ActionConfigSchema = z.object({
  pluginId: z.string(),
  settings: z.unknown().optional(), 
});
export type ActionConfig = z.infer<typeof ActionConfigSchema>;

export const PluginManifestSchema = z.object({
    id: z.string(),
    nameKey: z.string(),
    version: z.string(),
    descriptionKey: z.string().optional(),
    author: z.string().optional(),
    icon: z.object({ type: z.enum(['material-icons', 'mdi', 'material-symbols-outlined']), name: z.string() }).optional(),
    capabilities: z.object({
      hasGlobalSettings: z.boolean().optional(),
      providesActions: z.boolean().optional(),
      providesUIContribution: z.boolean().optional(),
      canTestConnection: z.boolean().optional(),
    }),
    globalConfigFileName: z.string().optional(),
    backendEntry: z.string().optional(),
    frontendEntry: z.string().optional(),
    hasFrontendStyle: z.boolean().optional(),
    locales: z.record(z.string(), z.record(z.string(), z.string())).optional(),
    status: z.enum(['enabled', 'disabled']).optional(),
    sourceUrl: z.string().optional(),
});
export type PluginManifest = z.infer<typeof PluginManifestSchema>;

export const ActionSettingFieldOptionSchema = z.object({
  value: z.string(),
  label: z.string(),
  disabled: z.boolean().optional(),
});
export type ActionSettingFieldOption = z.infer<typeof ActionSettingFieldOptionSchema>;

export const ActionSettingFieldDescriptorSchema = z.object({
    id: z.string(),
    type: z.enum(['text', 'password', 'url', 'select', 'textarea', 'checkbox']),
    labelKey: z.string(),
    placeholderKey: z.string().optional(),
    helpTextKey: z.string().optional(),
    required: z.boolean().optional(),
    rows: z.number().optional(),
    optionsSource: z.any().optional(),
    dependsOn: z.union([
      z.array(z.string()),
      z.object({
        field: z.string(),
        value: z.any(),
      }),
    ]).optional(),
});
export type ActionSettingFieldDescriptor = z.infer<typeof ActionSettingFieldDescriptorSchema>;

export const ActionDisplayDetailSchema = z.object({
  icon: z.string().optional(),
  iconType: z.enum(['material-icons', 'mdi', 'material-symbols-outlined']).optional(),
  value: z.string(),
  allowWrap: z.boolean().optional(),
});
export type ActionDisplayDetail = z.infer<typeof ActionDisplayDetailSchema>;