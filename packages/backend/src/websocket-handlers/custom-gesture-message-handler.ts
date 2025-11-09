/* FILE: packages/backend/src/websocket-handlers/custom-gesture-message-handler.ts */
import { pubsub, WEBSOCKET_EVENTS, BACKEND_INTERNAL_EVENTS, type GestureConfig, type PoseConfig, type WebSocketMessage, type UploadCustomGesturePayload, type UpdateCustomGesturePayload, type DeleteCustomGesturePayload, type UploadCustomGestureAckMessage, type UpdateCustomGestureAckMessage, type DeleteCustomGestureAckMessage } from '#shared/index.js';
import { scanCustomGesturesDir, saveCustomGestureFile, updateCustomGestureFile, deleteCustomGestureFile } from '../custom-gesture-manager.js';
import type { HandlerDependencies } from './handler-dependencies.type.js';
import { sendMessageToClient, sendErrorMessageToClient } from '#backend/utils/index.js';
import type WebSocket from 'ws';

export async function getCustomGesturesMetadataHandler(ws: WebSocket): Promise<void> {
  try {
    const metadata = await scanCustomGesturesDir();
    await sendMessageToClient(ws, { type: WEBSOCKET_EVENTS.BACKEND_CUSTOM_GESTURES_METADATA_LIST, payload: { definitions: metadata } });
  } catch (error) {
    await sendErrorMessageToClient(ws, 'PROCESSING_ERROR', error instanceof Error ? error.message : 'Error scanning custom gestures.');
  }
}

export async function uploadCustomGestureHandler(ws: WebSocket, message: WebSocketMessage<unknown>): Promise<void> {
  const { name, description, type, codeString, source } = (message as WebSocketMessage<UploadCustomGesturePayload>).payload;
  if (!codeString || !name || !type) {
    await sendErrorMessageToClient(ws, 'INVALID_PAYLOAD', 'UPLOAD_CUSTOM_GESTURE requires name, type, and codeString.');
    return;
  }

  try {
    const currentCustomDefinitions = await scanCustomGesturesDir();
    const result = await saveCustomGestureFile(name, description, type, codeString, currentCustomDefinitions);
    const ackMsg: UploadCustomGestureAckMessage = { type: WEBSOCKET_EVENTS.BACKEND_UPLOAD_CUSTOM_GESTURE_ACK, messageId: message.messageId, payload: { success: result.success, message: result.message, newDefinition: result.newDefinition, source } };
    await sendMessageToClient(ws, ackMsg);
    if (result.success) pubsub.publish(BACKEND_INTERNAL_EVENTS.REQUEST_CUSTOM_GESTURE_METADATA_UPDATE);
  } catch (error) {
    await sendErrorMessageToClient(ws, 'PROCESSING_ERROR', error instanceof Error ? error.message : 'Error saving custom gesture.');
  }
}

export async function updateCustomGestureHandler(ws: WebSocket, message: WebSocketMessage<unknown>, { configService }: HandlerDependencies): Promise<void> {
  const { id, newName, newDescription, oldName } = (message as WebSocketMessage<UpdateCustomGesturePayload>).payload;
  if (!id || !newName || !oldName) {
    await sendErrorMessageToClient(ws, 'INVALID_PAYLOAD', 'UPDATE_CUSTOM_GESTURE requires id, oldName, and newName.');
    return;
  }

  try {
    const updateResult = await updateCustomGestureFile(id, newName, newDescription);
    let configUpdateSuccess = true;
    let configUpdateMessage: string | undefined;

    if (updateResult.success && oldName !== newName) {
      const currentConfig = await configService!.getFullConfig();
      if (currentConfig.gestureConfigs.some((cfg: GestureConfig | PoseConfig) => ('gesture' in cfg ? cfg.gesture : cfg.pose) === oldName)) {
        const updatedGestureConfigs = currentConfig.gestureConfigs.map((cfg: GestureConfig | PoseConfig) => ('gesture' in cfg ? cfg.gesture : cfg.pose) === oldName ? { ...cfg, ['gesture' in cfg ? 'gesture' : 'pose']: newName } : cfg);
        const { success, message } = await configService!.patchConfig({ gestureConfigs: updatedGestureConfigs });
        configUpdateSuccess = success;
        if (!success) configUpdateMessage = message || 'File updated, but failed to update associated actions in config.json.';
      }
    }

    const ackMsg: UpdateCustomGestureAckMessage = { type: WEBSOCKET_EVENTS.BACKEND_UPDATE_CUSTOM_GESTURE_ACK, messageId: message.messageId, payload: { success: updateResult.success && configUpdateSuccess, message: configUpdateMessage || updateResult.message, updatedDefinition: updateResult.updatedDefinition } };
    await sendMessageToClient(ws, ackMsg);
    if (ackMsg.payload.success) pubsub.publish(BACKEND_INTERNAL_EVENTS.REQUEST_CUSTOM_GESTURE_METADATA_UPDATE);
  } catch (error) {
    await sendErrorMessageToClient(ws, 'PROCESSING_ERROR', error instanceof Error ? error.message : 'Error updating custom gesture.');
  }
}

export async function deleteCustomGestureHandler(ws: WebSocket, message: WebSocketMessage<unknown>, { configService }: HandlerDependencies): Promise<void> {
  const { id, name: gestureName } = (message as WebSocketMessage<DeleteCustomGesturePayload>).payload;
  if (!id || !gestureName) { await sendErrorMessageToClient(ws, 'INVALID_PAYLOAD', 'DELETE_CUSTOM_GESTURE requires id and name.'); return; }

  try {
    const deleteResult = await deleteCustomGestureFile(id);
    let cleanupSuccess = true;
    let configMessage: string | undefined;

    if (deleteResult.success) {
      const currentFullConfig = await configService!.getFullConfig();
      const filteredConfigs = currentFullConfig.gestureConfigs.filter((cfg: GestureConfig | PoseConfig) => ('gesture' in cfg ? cfg.gesture : cfg.pose) !== gestureName);
      if (filteredConfigs.length < currentFullConfig.gestureConfigs.length) {
        const { success, message } = await configService!.patchConfig({ gestureConfigs: filteredConfigs });
        cleanupSuccess = success;
        if (!success) configMessage = message || 'File deleted, but failed to update main config list.';
      }
    }

    const finalMessage = deleteResult.message || (!cleanupSuccess ? configMessage : undefined);
    const ackMsg: DeleteCustomGestureAckMessage = { type: WEBSOCKET_EVENTS.BACKEND_DELETE_CUSTOM_GESTURE_ACK, messageId: message.messageId, payload: { success: deleteResult.success && cleanupSuccess, message: finalMessage, deletedId: deleteResult.deletedId, deletedName: gestureName } };
    await sendMessageToClient(ws, ackMsg);
    if (deleteResult.success && cleanupSuccess) pubsub.publish(BACKEND_INTERNAL_EVENTS.REQUEST_CUSTOM_GESTURE_METADATA_UPDATE);
  } catch (error) {
    await sendErrorMessageToClient(ws, 'PROCESSING_ERROR', error instanceof Error ? error.message : 'Error deleting custom gesture.');
  }
}