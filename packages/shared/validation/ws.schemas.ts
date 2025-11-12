/* FILE: packages/shared/validation/ws.schemas.ts */
import { z } from 'zod';
import { FullConfigurationSchema, GestureConfigSchema, PoseConfigSchema } from './config.schemas.js';
import { PluginManifestSchema } from './plugin.schemas.js';
import { GestureDisplayInfoSchema } from './ui.schemas.js';

export const WebSocketMessageSchema = z.object({
    type: z.string(),
    payload: z.unknown(),
    messageId: z.number().optional(),
});
export type WebSocketMessage<T = unknown> = {
    type: string;
    payload: T;
    messageId?: number;
};

export const PerformanceMetricsPayloadSchema = z.object({
    isStreaming: z.boolean(),
    source: z.enum(['webcam', 'rtsp', 'studio']),
    actualFPS: z.number().optional(),
    targetFPS: z.number().optional(),
    processingTimeMs: z.number().optional(),
    latencyEstimateMs: z.number().optional(),
    memoryUsedMB: z.number().optional(),
    heapUsedRatio: z.number().optional(),
});
export type PerformanceMetricsPayload = z.infer<typeof PerformanceMetricsPayloadSchema>;

export const CustomGestureMetadataSchema = z.object({
    id: z.string(),
    name: z.string(),
    description: z.string().optional(),
    filePath: z.string(),
    codeString: z.string(),
    type: z.enum(['hand', 'pose']).optional(),
});
export type CustomGestureMetadata = z.infer<typeof CustomGestureMetadataSchema>;

export const EnrichedCustomGestureMetadataSchema = CustomGestureMetadataSchema.extend({
    display: GestureDisplayInfoSchema,
});
export type EnrichedCustomGestureMetadata = z.infer<typeof EnrichedCustomGestureMetadataSchema>;

export const EnrichedGestureConfigSchema = z.union([
    GestureConfigSchema.extend({ display: GestureDisplayInfoSchema }),
    PoseConfigSchema.extend({ display: GestureDisplayInfoSchema }),
]);
export type EnrichedGestureConfig = z.infer<typeof EnrichedGestureConfigSchema>;

export const EnrichedPoseConfigSchema = PoseConfigSchema.extend({
    display: GestureDisplayInfoSchema,
});
export type EnrichedPoseConfig = z.infer<typeof EnrichedPoseConfigSchema>;


export const InitialStatePayloadSchema = z.object({
    globalConfig: FullConfigurationSchema,
    pluginConfigs: z.record(z.string(), z.unknown()),
    customGestureMetadata: z.array(CustomGestureMetadataSchema),
    manifests: z.array(PluginManifestSchema),
});
export type InitialStatePayload = z.infer<typeof InitialStatePayloadSchema>;

export const ErrorPayloadSchema = z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
});
export type ErrorPayload = z.infer<typeof ErrorPayloadSchema>;
export type ErrorMessage = WebSocketMessage<ErrorPayload>;

export const ActionResultPayloadSchema = z.object({
    gestureName: z.string(),
    pluginId: z.string(),
    success: z.boolean(),
    message: z.string().optional(),
    details: z.unknown().optional(),
});
export type ActionResultPayload = z.infer<typeof ActionResultPayloadSchema>;

export const StreamStatusPayloadSchema = z.object({
    pathName: z.string(),
    status: z.enum(['active', 'inactive', 'error', 'unknown']),
    message: z.string().optional(),
});
export type StreamStatusPayload = z.infer<typeof StreamStatusPayloadSchema>;

export const ConfigPatchAckPayloadSchema = z.object({
    success: z.boolean(),
    message: z.string().optional(),
    updatedConfig: FullConfigurationSchema.partial().optional(),
    validationErrors: z.array(z.object({ field: z.string(), messageKey: z.string(), details: z.unknown().optional() })).optional(),
});
export type ConfigPatchAckPayload = z.infer<typeof ConfigPatchAckPayloadSchema>;

export const UploadCustomGesturePayloadSchema = z.object({
    name: z.string(),
    description: z.string().optional(),
    codeString: z.string(),
    type: z.enum(['hand', 'pose']),
    source: z.enum(['core', 'studio']).optional(),
});
export type UploadCustomGesturePayload = z.infer<typeof UploadCustomGesturePayloadSchema>;
  
export const UploadCustomGestureAckPayloadSchema = z.object({
    success: z.boolean(),
    message: z.string().optional(),
    newDefinition: CustomGestureMetadataSchema.optional(),
    source: z.enum(['core', 'studio']).optional(),
});
export type UploadCustomGestureAckPayload = z.infer<typeof UploadCustomGestureAckPayloadSchema>;
export type UploadCustomGestureAckMessage = WebSocketMessage<UploadCustomGestureAckPayload>;

export const UpdateCustomGesturePayloadSchema = z.object({
    id: z.string(),
    oldName: z.string(),
    newName: z.string(),
    newDescription: z.string(),
});
export type UpdateCustomGesturePayload = z.infer<typeof UpdateCustomGesturePayloadSchema>;

export const UpdateCustomGestureAckPayloadSchema = z.object({
    success: z.boolean(),
    message: z.string().optional(),
    updatedDefinition: CustomGestureMetadataSchema.optional(),
});
export type UpdateCustomGestureAckPayload = z.infer<typeof UpdateCustomGestureAckPayloadSchema>;
export type UpdateCustomGestureAckMessage = WebSocketMessage<UpdateCustomGestureAckPayload>;

export const DeleteCustomGesturePayloadSchema = z.object({
    id: z.string(),
    name: z.string(),
});
export type DeleteCustomGesturePayload = z.infer<typeof DeleteCustomGesturePayloadSchema>;

export const DeleteCustomGestureAckPayloadSchema = z.object({
    success: z.boolean(),
    message: z.string().optional(),
    deletedId: z.string().optional(),
    deletedName: z.string().optional(),
});
export type DeleteCustomGestureAckPayload = z.infer<typeof DeleteCustomGestureAckPayloadSchema>;
export type DeleteCustomGestureAckMessage = WebSocketMessage<DeleteCustomGestureAckPayload>;

export const PluginTestConnectionResultPayloadSchema = z.object({
    pluginId: z.string(),
    success: z.boolean(),
    messageKey: z.string().optional(),
    error: z.object({ code: z.string().optional(), message: z.string().optional() }).optional(),
});
export type PluginTestConnectionResultPayload = z.infer<typeof PluginTestConnectionResultPayloadSchema>;