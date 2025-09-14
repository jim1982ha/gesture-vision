/* FILE: packages/shared/validation/ws.schemas.ts */
import { z } from 'zod';
import { FullConfigurationSchema } from './config.schemas.js';
import { PluginManifestSchema } from './plugin.schemas.js';

export const WebSocketMessageSchema = z.object({
    type: z.string(),
    payload: z.unknown(),
    messageId: z.number().optional(),
});

export const CustomGestureMetadataSchema = z.object({
    id: z.string(),
    name: z.string(),
    description: z.string().optional(),
    filePath: z.string(),
    codeString: z.string(),
    type: z.enum(['hand', 'pose']).optional(),
});

export const InitialStatePayloadSchema = z.object({
    globalConfig: FullConfigurationSchema,
    pluginConfigs: z.record(z.string(), z.unknown()),
    customGestureMetadata: z.array(CustomGestureMetadataSchema),
    manifests: z.array(PluginManifestSchema),
});

export const ErrorPayloadSchema = z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
});

export const ActionResultPayloadSchema = z.object({
    gestureName: z.string(),
    pluginId: z.string(),
    success: z.boolean(),
    message: z.string().optional(),
    details: z.unknown().optional(),
});

export const StreamStatusPayloadSchema = z.object({
    pathName: z.string(),
    status: z.enum(['active', 'inactive', 'error', 'unknown']),
    message: z.string().optional(),
});

export const ConfigPatchAckPayloadSchema = z.object({
    success: z.boolean(),
    message: z.string().optional(),
    updatedConfig: FullConfigurationSchema.partial().optional(),
    validationErrors: z.array(z.object({ field: z.string(), messageKey: z.string(), details: z.unknown().optional() })).optional(),
});

export const UploadCustomGesturePayloadSchema = z.object({
    name: z.string(),
    description: z.string().optional(),
    codeString: z.string(),
    type: z.enum(['hand', 'pose']),
    source: z.enum(['core', 'studio']).optional(),
});

export const UploadCustomGestureAckPayloadSchema = z.object({
    success: z.boolean(),
    message: z.string().optional(),
    newDefinition: CustomGestureMetadataSchema.optional(),
    source: z.enum(['core', 'studio']).optional(),
});

export const UpdateCustomGesturePayloadSchema = z.object({
    id: z.string(),
    oldName: z.string(),
    newName: z.string(),
    newDescription: z.string(),
});

export const UpdateCustomGestureAckPayloadSchema = z.object({
    success: z.boolean(),
    message: z.string().optional(),
    updatedDefinition: CustomGestureMetadataSchema.optional(),
});

export const DeleteCustomGesturePayloadSchema = z.object({
    id: z.string(),
    name: z.string(),
});

export const DeleteCustomGestureAckPayloadSchema = z.object({
    success: z.boolean(),
    message: z.string().optional(),
    deletedId: z.string().optional(),
    deletedName: z.string().optional(),
});

export const PluginTestConnectionResultPayloadSchema = z.object({
    pluginId: z.string(),
    success: z.boolean(),
    messageKey: z.string().optional(),
    error: z.object({ code: z.string().optional(), message: z.string().optional() }).optional(),
});