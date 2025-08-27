/* FILE: packages/backend/src/websocket-handlers/custom-gesture-message-handler.ts */
import { pubsub } from '#shared/core/pubsub.js';
import { WEBSOCKET_EVENTS, BACKEND_INTERNAL_EVENTS } from '#shared/constants/index.js';
import {
  scanCustomGesturesDir,
  saveCustomGestureFile,
  updateCustomGestureFile,
  deleteCustomGestureFile,
} from '../custom-gesture-manager.js';
import { type HandlerDependencies } from './handler-dependencies.type.js';
import { sendMessageToClient, sendErrorMessageToClient } from './ws-response-utils.js';
import type WebSocket from 'ws';

import type {
  CustomGestureMetadata,
  GestureConfig,
  PoseConfig,
  WebSocketMessage,
  UploadCustomGesturePayload,
  UpdateCustomGesturePayload,
  DeleteCustomGesturePayload,
  UploadCustomGestureAckMessage,
  UpdateCustomGestureAckMessage,
  DeleteCustomGestureAckMessage,
} from '#shared/types/index.js';

export async function getCustomGesturesMetadataHandler(
  ws: WebSocket,
  _message: WebSocketMessage<unknown>,
  _dependencies: HandlerDependencies
): Promise<void> {
  try {
    const metadata = await scanCustomGesturesDir();
    const response: WebSocketMessage<{ definitions: CustomGestureMetadata[] }> = {
      type: WEBSOCKET_EVENTS.BACKEND_CUSTOM_GESTURES_METADATA_LIST,
      payload: { definitions: metadata },
    };
    await sendMessageToClient(ws, response);
  } catch (error: unknown) {
    const msg =
      error instanceof Error ? error.message : 'Error scanning custom gestures.';
    await sendErrorMessageToClient(ws, 'PROCESSING_ERROR', msg);
  }
}

export async function uploadCustomGestureHandler(
  ws: WebSocket,
  message: WebSocketMessage<unknown>,
  _dependencies: HandlerDependencies
): Promise<void> {
  const { name, description, type, codeString, source } = (
    message as WebSocketMessage<UploadCustomGesturePayload>
  ).payload;
  if (!codeString || !name || !type) {
    await sendErrorMessageToClient(
      ws,
      'INVALID_PAYLOAD',
      'UPLOAD_CUSTOM_GESTURE requires name, type, and codeString.'
    );
    return;
  }

  try {
    const currentCustomDefinitions: CustomGestureMetadata[] =
      await scanCustomGesturesDir();
    const result = await saveCustomGestureFile(
      name,
      description,
      type,
      codeString,
      currentCustomDefinitions
    );

    const ackMsg: UploadCustomGestureAckMessage = {
      type: WEBSOCKET_EVENTS.BACKEND_UPLOAD_CUSTOM_GESTURE_ACK,
      messageId: message.messageId,
      payload: {
        success: result.success,
        message: result.message,
        newDefinition: result.newDefinition,
        source: source,
      },
    };
    await sendMessageToClient(ws, ackMsg);

    if (result.success) {
      pubsub.publish(BACKEND_INTERNAL_EVENTS.REQUEST_CUSTOM_GESTURE_METADATA_UPDATE);
    }
  } catch (error: unknown) {
    const msg =
      error instanceof Error ? error.message : 'Error saving custom gesture.';
    await sendErrorMessageToClient(ws, 'PROCESSING_ERROR', msg);
  }
}

export async function updateCustomGestureHandler(
  ws: WebSocket,
  message: WebSocketMessage<unknown>,
  dependencies: HandlerDependencies
): Promise<void> {
  const { configService } = dependencies;
  if (!configService) {
    await sendErrorMessageToClient(ws, 'SERVER_ERROR', 'ConfigService not ready.');
    return;
  }

  const { id, newName, newDescription, oldName } = (
    message as WebSocketMessage<UpdateCustomGesturePayload>
  ).payload;
  if (!id || !newName || !oldName) {
    await sendErrorMessageToClient(
      ws,
      'INVALID_PAYLOAD',
      'UPDATE_CUSTOM_GESTURE requires id, oldName, and newName.'
    );
    return;
  }

  try {
    const updateResult = await updateCustomGestureFile(id, newName, newDescription);
    let configUpdateSuccess = true;
    let configUpdateMessage: string | undefined;

    if (updateResult.success && oldName !== newName) {
      const currentConfig = await configService.getFullConfig();
      const configsToUpdate = currentConfig.gestureConfigs.filter(
        (cfg: GestureConfig | PoseConfig) =>
          ('gesture' in cfg ? cfg.gesture : cfg.pose) === oldName
      );
      if (configsToUpdate.length > 0) {
        const updatedGestureConfigs = currentConfig.gestureConfigs.map(
          (cfg: GestureConfig | PoseConfig) => {
            if (('gesture' in cfg ? cfg.gesture : cfg.pose) === oldName)
              return {
                ...cfg,
                ['gesture' in cfg ? 'gesture' : 'pose']: newName,
              };
            return cfg;
          }
        );
        const patchResult = await configService.patchConfig({
          gestureConfigs: updatedGestureConfigs,
        });
        configUpdateSuccess = patchResult.success;
        if (!patchResult.success)
          configUpdateMessage =
            'File updated, but failed to update associated actions in config.json.';
      }
    }

    const ackMsg: UpdateCustomGestureAckMessage = {
      type: WEBSOCKET_EVENTS.BACKEND_UPDATE_CUSTOM_GESTURE_ACK,
      messageId: message.messageId,
      payload: {
        success: updateResult.success && configUpdateSuccess,
        message: configUpdateMessage || updateResult.message,
        updatedDefinition: updateResult.updatedDefinition,
      },
    };
    await sendMessageToClient(ws, ackMsg);
    if (ackMsg.payload.success)
      pubsub.publish(BACKEND_INTERNAL_EVENTS.REQUEST_CUSTOM_GESTURE_METADATA_UPDATE);
  } catch (error: unknown) {
    const msg =
      error instanceof Error ? error.message : 'Error updating custom gesture.';
    await sendErrorMessageToClient(ws, 'PROCESSING_ERROR', msg);
  }
}

export async function deleteCustomGestureHandler(
  ws: WebSocket,
  message: WebSocketMessage<unknown>,
  dependencies: HandlerDependencies
): Promise<void> {
  const { configService } = dependencies;
  if (!configService) {
    await sendErrorMessageToClient(ws, 'SERVER_ERROR', 'ConfigService not ready.');
    return;
  }

  const { id, name: gestureName } = (
    message as WebSocketMessage<DeleteCustomGesturePayload>
  ).payload;
  if (!id || !gestureName) {
    await sendErrorMessageToClient(
      ws,
      'INVALID_PAYLOAD',
      'DELETE_CUSTOM_GESTURE requires id and name.'
    );
    return;
  }

  try {
    const deleteResult = await deleteCustomGestureFile(id);
    let cleanupSuccess = false;
    let configMessage: string | undefined = undefined;

    if (deleteResult.success) {
      const currentFullConfig = await configService.getFullConfig();
      const originalConfigs = currentFullConfig.gestureConfigs;
      const filteredConfigs = originalConfigs.filter(
        (cfg: GestureConfig | PoseConfig) =>
          ('gesture' in cfg ? cfg.gesture : cfg.pose) !== gestureName
      );
      if (filteredConfigs.length < originalConfigs.length) {
        const patchResult = await configService.patchConfig({
          gestureConfigs: filteredConfigs,
        });
        cleanupSuccess = patchResult.success;
        if (!patchResult.success)
          configMessage = 'File deleted, but failed to update main config list.';
      } else {
        cleanupSuccess = true;
      }
    }

    const finalMessage =
      deleteResult.message || (!cleanupSuccess ? configMessage : undefined);
    const ackMsg: DeleteCustomGestureAckMessage = {
      type: WEBSOCKET_EVENTS.BACKEND_DELETE_CUSTOM_GESTURE_ACK,
      messageId: message.messageId,
      payload: {
        success: deleteResult.success && cleanupSuccess,
        message: finalMessage,
        deletedId: deleteResult.deletedId,
        deletedName: gestureName,
      },
    };
    await sendMessageToClient(ws, ackMsg);
    if (deleteResult.success && cleanupSuccess)
      pubsub.publish(BACKEND_INTERNAL_EVENTS.REQUEST_CUSTOM_GESTURE_METADATA_UPDATE);
  } catch (error: unknown) {
    const msg =
      error instanceof Error ? error.message : 'Error deleting custom gesture.';
    await sendErrorMessageToClient(ws, 'PROCESSING_ERROR', msg);
  }
}