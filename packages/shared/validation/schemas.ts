/* FILE: packages/shared/validation/schemas.ts */
import { z } from 'zod';

// --- CORE APPLICATION SCHEMAS ---

export const RoiConfigSchema = z.object({
  x: z.number().min(0).max(100),
  y: z.number().min(0).max(100),
  width: z.number().min(1).max(100),
  height: z.number().min(1).max(100),
}).refine(data => data.x + data.width <= 100, {
  message: "Left Offset + Width cannot exceed 100.", path: ["width"],
}).refine(data => data.y + data.height <= 100, {
  message: "Top Offset + Height cannot exceed 100.", path: ["height"],
});
export type RoiConfig = z.infer<typeof RoiConfigSchema>;

export const ActionConfigSchema = z.object({
  pluginId: z.string(),
  settings: z.unknown().optional(), 
});
export type ActionConfig = z.infer<typeof ActionConfigSchema>;

export const RtspSourceConfigSchema = z.object({
  name: z.string().min(1),
  url: z.string().url().refine(val => val.startsWith("rtsp://"), "URL must start with rtsp://"),
  sourceOnDemand: z.boolean().optional(),
  roi: RoiConfigSchema.optional(),
});
export type RtspSourceConfig = z.infer<typeof RtspSourceConfigSchema>;

export const GestureConfigSchema = z.object({
  gesture: z.string().min(1),
  confidence: z.number().min(0).max(100),
  duration: z.number().positive(),
  actionConfig: ActionConfigSchema.nullable(),
});
export type GestureConfig = z.infer<typeof GestureConfigSchema>;

export const PoseConfigSchema = z.object({
  pose: z.string().min(1),
  duration: z.number().positive(),
  actionConfig: ActionConfigSchema.nullable(),
  confidence: z.number().min(0).max(100).optional(),
});
export type PoseConfig = z.infer<typeof PoseConfigSchema>;

const allowedFpsValues = [5, 10, 15, 20, 30] as const;

export const FullConfigurationSchema = z.object({
  globalCooldown: z.number().min(0),
  rtspSources: z.array(RtspSourceConfigSchema),
  gestureConfigs: z.array(z.union([GestureConfigSchema, PoseConfigSchema])),
  targetFpsPreference: z.coerce.number().refine((val) => allowedFpsValues.includes(val as typeof allowedFpsValues[number]), {
    message: `Target FPS must be one of: ${allowedFpsValues.join(', ')}`,
  }),
  telemetryEnabled: z.boolean().optional(),
  enableCustomHandGestures: z.boolean(),
  enablePoseProcessing: z.boolean(),
  enableBuiltInHandGestures: z.boolean(),
  lowLightBrightness: z.number().min(0).max(5000).optional(),
  lowLightContrast: z.number().min(0).max(5000).optional(),
  handDetectionConfidence: z.number().min(0.1).max(0.9).optional(),
  handPresenceConfidence: z.number().min(0.1).max(0.9).optional(),
  handTrackingConfidence: z.number().min(0.1).max(0.9).optional(),
  poseDetectionConfidence: z.number().min(0.1).max(0.9).optional(),
  posePresenceConfidence: z.number().min(0.1).max(0.9).optional(),
  poseTrackingConfidence: z.number().min(0.1).max(0.9).optional(),
  _migrationVersion: z.number().optional(),
});
export type FullConfiguration = z.infer<typeof FullConfigurationSchema>;


// --- API & ACTION SCHEMAS ---
export const ActionDetailsSchema = z.object({
  gestureName: z.string(),
  confidence: z.number(),
  timestamp: z.number(),
});
export type ActionDetails = z.infer<typeof ActionDetailsSchema>;

export const ActionResultSchema = z.object({
  success: z.boolean(),
  message: z.string().optional(),
  details: z.unknown().optional(),
});
export type ActionResult = z.infer<typeof ActionResultSchema>;

export const ValidationErrorDetailSchema = z.object({
    field: z.string(),
    messageKey: z.string(),
    details: z.unknown().optional(),
});
export type ValidationErrorDetail = z.infer<typeof ValidationErrorDetailSchema>;

export const SectionValidationResultSchema = z.object({
    isValid: z.boolean(),
    error: ValidationErrorDetailSchema.optional(),
    errors: z.array(ValidationErrorDetailSchema).optional(),
});
export type SectionValidationResult = z.infer<typeof SectionValidationResultSchema>;


// --- PLUGIN SCHEMAS ---
export const PluginManifestSchema = z.object({
    id: z.string(),
    nameKey: z.string(),
    version: z.string(),
    descriptionKey: z.string().optional(),
    author: z.string().optional(),
    icon: z.object({ type: z.enum(['material-icons', 'mdi']), name: z.string() }).optional(),
    capabilities: z.object({
      hasGlobalSettings: z.boolean().optional(),
      providesActions: z.boolean().optional(),
      providesTab: z.boolean().optional(),
      providesUIContribution: z.boolean().optional(),
    }),
    globalConfigFileName: z.string().optional(),
    defaultGlobalConfigPath: z.string().optional(),
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
    optionsSource: z.function().optional(),
    searchable: z.boolean().optional(),
    dependsOn: z.array(z.string()).optional(),
    autocomplete: z.enum(['on', 'off', 'name', 'email', 'username', 'new-password', 'current-password', 'url']).optional(),
});
export type ActionSettingFieldDescriptor = z.infer<typeof ActionSettingFieldDescriptorSchema>;

export const ActionDisplayDetailSchema = z.object({
  icon: z.string().optional(),
  iconType: z.enum(['material-icons', 'mdi']).optional(),
  value: z.string(),
  allowWrap: z.boolean().optional(),
});
export type ActionDisplayDetail = z.infer<typeof ActionDisplayDetailSchema>;

// --- WEBSOCKET SCHEMAS ---

export const WebSocketMessageSchema = z.object({
    type: z.string(),
    payload: z.unknown(),
    messageId: z.number().optional(),
});
export type WebSocketMessage<T = unknown> = z.infer<typeof WebSocketMessageSchema> & { payload: T };

export const CustomGestureMetadataSchema = z.object({
    id: z.string(),
    name: z.string(),
    description: z.string().optional(),
    filePath: z.string(),
    codeString: z.string(),
    type: z.enum(['hand', 'pose']).optional(),
});
export type CustomGestureMetadata = z.infer<typeof CustomGestureMetadataSchema>;

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
    validationErrors: z.array(ValidationErrorDetailSchema).optional(),
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