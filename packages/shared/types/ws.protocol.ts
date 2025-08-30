/* FILE: packages/shared/types/ws.protocol.ts */
import type { FullConfiguration } from './config.types.js';
import type { PluginManifest } from './plugin.types.js';
import type { ValidationErrorDetail } from './api.types.js';

export interface WebSocketMessage<T = unknown> {
    type: string;
    payload: T;
    messageId?: number;
}

export interface CustomGestureMetadata {
    id: string;
    name: string;
    description?: string;
    filePath: string;
    codeString: string;
    type?: 'hand' | 'pose';
}

export interface InitialStatePayload {
    globalConfig: FullConfiguration;
    pluginConfigs: Record<string, unknown>;
    customGestureMetadata: CustomGestureMetadata[];
    manifests: PluginManifest[];
}

export interface ErrorPayload {
    code: string;
    message: string;
    details?: unknown;
}

export type ErrorMessage = WebSocketMessage<ErrorPayload>;

export type ActionResultPayload = {
    gestureName: string;
    pluginId: string;
    success: boolean;
    message?: string;
    details?: unknown;
};

export interface StreamStatusPayload {
    pathName: string;
    status: 'active' | 'inactive' | 'error' | 'unknown';
    message?: string;
}

export interface ConfigPatchAckPayload {
    success: boolean;
    message?: string;
    updatedConfig?: Partial<FullConfiguration>;
    validationErrors?: ValidationErrorDetail[];
}

export interface UploadCustomGesturePayload {
    name: string;
    description?: string;
    codeString: string;
    type: 'hand' | 'pose';
    source?: 'core' | 'studio';
}
  
export type UploadCustomGestureAckPayload = {
    success: boolean;
    message?: string;
    newDefinition?: CustomGestureMetadata;
    source?: 'core' | 'studio';
};

export type UploadCustomGestureAckMessage = WebSocketMessage<UploadCustomGestureAckPayload>;

export interface UpdateCustomGesturePayload {
    id: string;
    oldName: string;
    newName: string;
    newDescription: string;
}

export type UpdateCustomGestureAckPayload = {
    success: boolean;
    message?: string;
    updatedDefinition?: CustomGestureMetadata;
};

export type UpdateCustomGestureAckMessage = WebSocketMessage<UpdateCustomGestureAckPayload>;

export interface DeleteCustomGesturePayload {
    id: string;
    name: string;
}

export type DeleteCustomGestureAckPayload = {
    success: boolean;
    message?: string;
    deletedId?: string;
    deletedName?: string;
};

export type DeleteCustomGestureAckMessage = WebSocketMessage<DeleteCustomGestureAckPayload>;


export interface PluginTestConnectionResultPayload {
    pluginId: string;
    success: boolean;
    messageKey?: string;
    error?: { code?: string; message?: string };
}