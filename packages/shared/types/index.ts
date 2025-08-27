/* FILE: packages/shared/types/index.ts */
// SINGLE SOURCE OF TRUTH for types shared between frontend and backend.

// --- Gesture & Recognition ---
export interface RoiConfig { x: number; y: number; width: number; height: number; }
export interface ActionDetails { gestureName: string; confidence: number; timestamp: number; }
export interface ActionResult { success: boolean; message?: string; details?: unknown; }

// --- Configuration ---
export interface RtspSourceConfig { name: string; url: string; sourceOnDemand?: boolean; roi?: RoiConfig; }
export interface ActionConfig { pluginId: string; settings?: unknown; }
export interface GestureConfig { gesture: string; confidence: number; duration: number; actionConfig: ActionConfig | null; }
export interface PoseConfig { pose: string; duration: number; actionConfig: ActionConfig | null; confidence?: number; }

export interface FullConfiguration {
  globalCooldown: number; rtspSources: RtspSourceConfig[]; gestureConfigs: (GestureConfig | PoseConfig)[];
  targetFpsPreference: number; telemetryEnabled?: boolean; enableCustomHandGestures: boolean;
  enablePoseProcessing: boolean; enableBuiltInHandGestures: boolean;
  lowLightBrightness?: number; lowLightContrast?: number; handDetectionConfidence?: number;
  handPresenceConfidence?: number; handTrackingConfidence?: number; poseDetectionConfidence?: number;
  posePresenceConfidence?: number; poseTrackingConfidence?: number; _migrationVersion?: number;
}
export interface ValidationErrorDetail { field: string; messageKey: string; details?: unknown; }
export interface SectionValidationResult { isValid: boolean; error?: ValidationErrorDetail; errors?: ValidationErrorDetail[]; }

// --- WebSocket Protocol ---
export interface WebSocketMessage<T = unknown> { type: string; payload: T; messageId?: number; }
export interface InitialStatePayload { globalConfig: FullConfiguration; pluginConfigs: Record<string, unknown>; customGestureMetadata: CustomGestureMetadata[]; manifests: PluginManifest[]; }
export interface ErrorPayload { code: string; message: string; details?: unknown; }
export type ErrorMessage = WebSocketMessage<ErrorPayload>;
export type ActionResultPayload = { gestureName: string; pluginId: string; success: boolean; message?: string; details?: unknown; };
export interface StreamStatusPayload { pathName: string; status: 'active' | 'inactive' | 'error' | 'unknown'; message?: string; }
export interface ConfigPatchAckPayload { success: boolean; message?: string; updatedConfig?: Partial<FullConfiguration>; validationErrors?: ValidationErrorDetail[]; }
export interface GetPluginGlobalConfigPayload { pluginId: string; }
export interface PatchPluginGlobalConfigPayload { pluginId: string; config: unknown; }
export interface PluginGlobalConfigDataPayload { pluginId: string; config: unknown; }
export interface PluginTestConnectionRequestPayload { pluginId: string; configToTest: unknown; }
export interface PluginTestConnectionResultPayload { pluginId: string; success: boolean; messageKey?: string; error?: { code?: string; message?: string }; }
export type UploadCustomGestureAckMessage = WebSocketMessage<UploadCustomGestureAckPayload>;
export type UpdateCustomGestureAckMessage = WebSocketMessage<UpdateCustomGestureAckPayload>;
export type DeleteCustomGestureAckMessage = WebSocketMessage<DeleteCustomGestureAckPayload>;

// --- Custom Gestures ---
export interface CustomGestureMetadata { id: string; name: string; description?: string; filePath: string; codeString: string; type?: 'hand' | 'pose'; }
export interface UploadCustomGesturePayload { name: string; description?: string; codeString: string; type: 'hand' | 'pose'; source?: 'core' | 'studio'; }
export type UploadCustomGestureAckPayload = { success: boolean; message?: string; newDefinition?: CustomGestureMetadata; source?: 'core' | 'studio'; };
export interface UpdateCustomGesturePayload { id: string; oldName: string; newName: string; newDescription: string; }
export type UpdateCustomGestureAckPayload = { success: boolean; message?: string; updatedDefinition?: CustomGestureMetadata; };
export interface DeleteCustomGesturePayload { id: string; name: string; }
export type DeleteCustomGestureAckPayload = { success: boolean; message?: string; deletedId?: string; deletedName?: string; };

// --- Plugins (Shared Aspects) ---
export interface PluginManifest {
  id: string; nameKey: string; version: string; descriptionKey?: string; author?: string;
  icon?: { type: 'material-icons' | 'mdi'; name: string };
  capabilities: { hasGlobalSettings?: boolean; providesActions?: boolean; providesTab?: boolean; providesUIContribution?: boolean; };
  globalConfigFileName?: string; defaultGlobalConfigPath?: string; backendEntry?: string; frontendEntry?: string; frontendStyle?: string;
  locales?: Record<string, Record<string, string>>; status?: 'enabled' | 'disabled'; sourceUrl?: string;
}
export interface ActionSettingFieldOption { value: string; label: string; disabled?: boolean; }
export interface ActionSettingFieldDescriptor {
  id: string; type: 'text' | 'password' | 'url' | 'select' | 'textarea' | 'checkbox';
  labelKey: string; placeholderKey?: string; helpTextKey?: string;
  required?: boolean; rows?: number;
  optionsSource?: (context: unknown, currentSettings?: Record<string, unknown>, filterText?: string) => Promise<ActionSettingFieldOption[]>;
  searchable?: boolean; dependsOn?: string[];
}
export interface ActionDisplayDetail { icon?: string; iconType?: 'material-icons' | 'mdi'; value: string; allowWrap?: boolean; }