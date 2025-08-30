/* FILE: packages/shared/constants/events.ts */
// Centralized constants for all application event types.

export const PLUGIN_CONFIG_UPDATED_EVENT_PREFIX = "pluginConfigUpdated:";

export const UI_EVENTS = {
  CAMERA_LIST_ITEM_CLICKED: "ui:cameraListItemClicked",
  REQUEST_STOP_STREAM: "ui:requestStopStream",
  REQUEST_CLOSE_ALL_PANELS_EXCEPT: "ui:requestCloseAllPanelsExcept",
  MODAL_VISIBILITY_CHANGED: "ui:modalVisibilityChanged",
  SHOW_NOTIFICATION: "ui:showNotification",
  SHOW_ERROR: "ui:showError",
  CONFIG_VALIDATION_ERROR: "ui:configValidationError",
  REQUEST_CAMERA_LIST_RENDER: "ui:requestCameraListRender",
  REQUEST_SELECTED_CAMERA_DISPLAY_UPDATE:
    "ui:requestSelectedCameraDisplayUpdate",
  VIDEO_VISIBILITY_CHANGED: "ui:videoVisibilityChanged",
  REQUEST_BUTTON_STATE_UPDATE: "ui:requestButtonStateUpdate",
  RECEIVE_UI_CONTRIBUTION: "ui:receiveContribution",
  REQUEST_VIDEO_REPARENT: "ui:requestVideoReparent",
  REQUEST_OVERLAY_STATE: "ui:requestOverlayState",
  REQUEST_EDIT_CONFIG: "ui:requestEditConfig",
  MODAL_OPENED_CAMERA_SELECT: "ui:modalOpenedCameraSelect",
  REQUEST_MODAL_BLUR_UPDATE: "ui:requestModalBlurUpdate",
  PLUGINS_MANIFESTS_PROCESSED: "ui:pluginsManifestsProcessed",
  VIDEO_TOOLBAR_AI_CLICKED: "ui:videoToolbarAiClicked",
  VIDEO_TOOLBAR_DISPLAY_CLICKED: "ui:videoToolbarDisplayClicked",
} as const;

export const WEBCAM_EVENTS = {
  DEVICE_UPDATE: "webcam:devices-updated",
  STREAM_START: "webcam:stream-started",
  STREAM_STOP: "webcam:stream-stopped",
  STREAM_CONNECTION_CANCELLED: "webcam:stream-connection-cancelled",
  ERROR: "webcam:error",
} as const;

export const CAMERA_SERVICE_EVENTS = {
  STREAM_STARTED: "cameraService:streamStarted",
  STREAM_ERROR: "cameraService:streamError",
} as const;

export const CAMERA_SOURCE_EVENTS = {
  MAP_UPDATED: "cameraSource:mapUpdated",
  CHANGED: "cameraSource:changed",
  REQUESTING_STREAM_START: "camera:requestingStreamStart",
} as const;

export const GESTURE_EVENTS = {
  PERFORMANCE_UPDATE: "gesture:performance",
  MODEL_LOADED: "gesture:model-loaded",
  UPDATE_STATUS: "gesture:update-status",
  UPDATE_PROGRESS: "gesture:update-progress",
  DETECTED_ALERT: "gesture:detected-alert",
  CONFIDENCE_THRESHOLD_MET: "gesture:confidence-threshold-met",
  TIMERS_RESET: "gesture:timersReset",
  RECORDED: "gesture:recorded",
  RENDER_OUTPUT: "gesture:renderOutput",
  TEST_RESULT: "gesture:testResult",
  REQUEST_LANDMARK_VISIBILITY_OVERRIDE:
    "gesture:requestLandmarkVisibilityOverride",
  CLEAR_LANDMARK_VISIBILITY_OVERRIDE:
    "gesture:clearLandmarkVisibilityOverride",
  REQUEST_PROCESSING_OVERRIDE: "gesture:requestProcessingOverride",
  CLEAR_PROCESSING_OVERRIDE: "gesture:clearProcessingOverride",
  SUPPRESS_ACTIONS: "gesture:suppressActions",
  RESUME_ACTIONS: "gesture:resumeActions",
  ACTION_TRIGGERED_BY_PLUGIN: "gesture:actionTriggeredByPlugin",
} as const;

export const WEBSOCKET_EVENTS = {
  CONNECTING: "websocket:connecting",
  CONNECTED: "websocket:connected",
  DISCONNECTED: "websocket:disconnected",
  ERROR: "websocket:error",
  INITIAL_STATE: "backend:initialState",
  CONFIG_SAVE_RESULT: "config:saveResult",
  BACKEND_ACTION_RESULT: "backend:actionResult",
  STREAM_STATUS_UPDATE: "streamStatus:update",
  GET_CUSTOM_GESTURES_METADATA: "GET_CUSTOM_GESTURES_METADATA",
  BACKEND_CUSTOM_GESTURES_METADATA_LIST: "CUSTOM_GESTURES_METADATA_LIST",
  UPLOAD_CUSTOM_GESTURE: "UPLOAD_CUSTOM_GESTURE",
  BACKEND_UPLOAD_CUSTOM_GESTURE_ACK: "backend:uploadCustomGestureAck",
  UPDATE_CUSTOM_GESTURE: "UPDATE_CUSTOM_GESTURE",
  BACKEND_UPDATE_CUSTOM_GESTURE_ACK: "backend:updateCustomGestureAck",
  DELETE_CUSTOM_GESTURE: "DELETE_CUSTOM_GESTURE",
  BACKEND_DELETE_CUSTOM_GESTURE_ACK: "backend:deleteCustomGestureAck",
  PLUGIN_GLOBAL_CONFIG_DATA: "websocket:pluginGlobalConfigData",
  PLUGIN_CONFIG_PATCH_ACK: "websocket:pluginConfigPatchAck",
  PLUGIN_CONFIG_UPDATED: "websocket:pluginConfigUpdated",
  PLUGIN_TEST_CONNECTION_RESULT: "plugin:testConnectionResult",
  FULL_CONFIG_UPDATE: "backend:fullConfigUpdate",
  PLUGINS_MANIFESTS_UPDATED: "backend:pluginsManifestsUpdated",
  RTSP_CONNECT_REQUEST: "rtsp:connectRequest",
  RTSP_DISCONNECT_REQUEST: "rtsp:disconnectRequest",
} as const;

export const APP_STATUS_EVENTS = {
  WEBCAM_STATE_CHANGED: "appStatus:webcamStateChanged",
  MODEL_STATE_CHANGED: "appStatus:modelStateChanged",
  STREAM_CONNECTING_STATE_CHANGED: "appStatus:streamConnectingStateChanged",
} as const;

export const DOCS_MODAL_EVENTS = {
  REQUEST_OPEN: "docs:requestOpen",
  REQUEST_CLOSE: "docs:requestClose",
} as const;

export const BACKEND_INTERNAL_EVENTS = {
  CONFIG_PATCHED: "backendInternal:globalConfigPatched",
  CONFIG_RELOADED: "backendInternal:globalConfigReloaded",
  REQUEST_CUSTOM_GESTURE_METADATA_UPDATE:
    "backend:requestCustomGestureMetadataUpdate",
  REQUEST_MANIFESTS_BROADCAST: "backendInternal:requestManifestsBroadcast",
  PLUGIN_GLOBAL_CONFIG_CHANGED_ON_BACKEND:
    "backendInternal:pluginConfigChanged",
} as const;

export const PERMISSION_EVENTS = {
  CAMERA_CHANGED: "permission:cameraChanged",
} as const;