/* FILE: packages/shared/constants/index.ts */
// This file is the single source of truth for all shared constants.

// --- Event Keys ---

export const PLUGIN_CONFIG_UPDATED_EVENT_PREFIX = "pluginConfigUpdated:";

export const UI_EVENTS = {
  CAMERA_LIST_ITEM_CLICKED: "ui:cameraListItemClicked",
  REQUEST_STOP_STREAM: "ui:requestStopStream",
  REQUEST_CLOSE_ALL_PANELS_EXCEPT: "ui:requestCloseAllPanelsExcept",
  REQUEST_MODAL_BLUR_UPDATE: "ui:requestModalBlurUpdate",
  REQUEST_BACKDROP_UPDATE: "ui:requestBackdropUpdate",
  MODAL_VISIBILITY_CHANGED: "ui:modalVisibilityChanged",
  SHOW_NOTIFICATION: "ui:showNotification",
  SHOW_ERROR: "ui:showError",
  CONFIG_VALIDATION_ERROR: "ui:configValidationError",
  REQUEST_CAMERA_LIST_RENDER: "ui:requestCameraListRender",
  REQUEST_SELECTED_CAMERA_DISPLAY_UPDATE: "ui:requestSelectedCameraDisplayUpdate",
  EFFECTIVE_MODE_CHANGED: "ui:effectiveModeChanged",
  VIDEO_VISIBILITY_CHANGED: "ui:videoVisibilityChanged",
  FATAL_ERROR: "ui:fatalError",
  MODAL_OPENED_CAMERA_SELECT: "ui:modalOpened:camera",
  MODAL_OPENED_MAIN_SETTINGS: "ui:modalOpened:main-settings",
  MODAL_OPENED_DOCS: "ui:modalOpened:docs",
  REQUEST_BUTTON_STATE_UPDATE: "ui:requestButtonStateUpdate",
  HISTORY_UPDATED: "ui:historyUpdated",
  STREAM_CONNECTION_CANCELLED: "ui:streamConnectionCancelled",
  RECEIVE_UI_CONTRIBUTION: "ui:receiveContribution",
  REQUEST_VIDEO_REPARENT: "ui:requestVideoReparent",
  REQUEST_OVERLAY_STATE: "ui:requestOverlayState",
  REQUEST_PLUGIN_DATA_REFRESH: "ui:requestPluginDataRefresh",
  REQUEST_EDIT_CONFIG: "ui:requestEditConfig",
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
  INVALIDATED: "ui:cameraSourceInvalidated",
  REQUESTING_STREAM_START: "camera:requestingStreamStart",
  START_STREAM_FROM_UI: "cameraSource:startStreamFromUI",
} as const;

export const STUDIO_EVENTS = {
  LANDMARK_SNAPSHOT_RESPONSE: "studio:landmarkSnapshotResponse",
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
  START_TEST_MODE: "gesture:startTestMode",
  STOP_TEST_MODE: "gesture:stopTestMode",
  TEST_RESULT: "gesture:testResult",
  REQUEST_LANDMARK_VISIBILITY_OVERRIDE: "gesture:requestLandmarkVisibilityOverride",
  CLEAR_LANDMARK_VISIBILITY_OVERRIDE: "gesture:clearLandmarkVisibilityOverride",
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
  PLUGIN_TEST_CONNECTION_REQUEST: "plugin:testConnectionRequest",
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
  REQUEST_CUSTOM_GESTURE_METADATA_UPDATE: "backend:requestCustomGestureMetadataUpdate",
  PLUGIN_GLOBAL_CONFIG_CHANGED_ON_BACKEND: "backendInternal:pluginConfigChanged",
  REQUEST_MANIFESTS_BROADCAST: "backendInternal:requestManifestsBroadcast",
} as const;

export const PERMISSION_EVENTS = {
  CAMERA_CHANGED: "permission:cameraChanged",
} as const;

// --- Icons ---

export const GESTURE_CATEGORY_ICONS = {
  BUILT_IN_HAND: { iconName: "waving_hand", iconType: "material-icons", defaultEmoji: "👋" },
  CUSTOM_HAND: { iconName: "front_hand", iconType: "material-icons", defaultEmoji: "🫱" },
  CUSTOM_POSE: { iconName: "emoji_people", iconType: "material-icons", defaultEmoji: "🙋🏻‍♂️" },
  UNKNOWN: { iconName: "help_outline", iconType: "material-icons", defaultEmoji: "❔" },
  UI_DASHBOARD_WIDGET: { iconName: "touch_app", iconType: "material-icons", defaultEmoji: "👆" },
  UI_WEBCAM: { iconName: "photo_camera", iconType: "material-icons" },
  UI_RTSP_STREAM: { iconName: "router", iconType: "material-icons" },
  UI_FEATURES_DROPDOWN_TRIGGER: { iconName: "sensors", iconType: "material-icons" },
  UI_HANDS_LANDMARKS_DROPDOWN_TRIGGER: { iconName: "handshake", iconType: "material-icons" },
  UI_POSE_LANDMARK_TOGGLE: { iconName: "timeline", iconType: "material-icons" },
  UI_HAND_LANDMARK_HIDE: { iconName: "do_not_touch", iconType: "material-icons" },
  UI_HAND_DETECT_ONE: { iconName: "pan_tool", iconType: "material-icons" },
  UI_HAND_DETECT_TWO: { iconName: "sign_language", iconType: "material-icons" },
  UI_VIDEO_MIRROR: { iconName: "flip", iconType: "material-icons" },
  UI_VIDEO_FULLSCREEN: { iconName: "fullscreen", iconType: "material-icons" },
  UI_VIDEO_FULLSCREEN_EXIT: { iconName: "fullscreen_exit", iconType: "material-icons" },
  UI_FLIP_CAMERA: { iconName: "cameraswitch", iconType: "material-icons" },
  UI_DISPLAY_ADJUSTMENTS: { iconName: "brightness_6", iconType: "material-icons" },
  UI_AI_TUNING: { iconName: "graphic_eq", iconType: "material-icons" },
  UI_STOP_STREAM: { iconName: "stop", iconType: "material-icons" },
  UI_VISIBILITY_ON: { iconName: "visibility", iconType: "material-icons" },
  UI_VISIBILITY_OFF: { iconName: "visibility_off", iconType: "material-icons" },
  UI_TIMER: { iconName: "timer", iconType: "material-icons" },
  UI_CHEVRON_LEFT: { iconName: "chevron_left", iconType: "material-icons" },
  UI_CHEVRON_RIGHT: { iconName: "chevron_right", iconType: "material-icons" },
  UI_BACK: { iconName: "arrow_back", iconType: "material-icons" },
  UI_ADD: { iconName: "add_circle_outline", iconType: "material-icons" },
  UI_DELETE: { iconName: "delete", iconType: "material-icons" },
  UI_CLOSE: { iconName: "mdi-close", iconType: "mdi" },
  UI_SAVE: { iconName: "save", iconType: "material-icons" },
  UI_CANCEL: { iconName: "cancel", iconType: "material-icons" },
  UI_CONFIRM: { iconName: "check_circle", iconType: "material-icons" },
  UI_UPLOAD: { iconName: "upload", iconType: "material-icons" },
  UI_FILE_ATTACH: { iconName: "upload_file", iconType: "material-icons" },
  UI_TEST: { iconName: "science", iconType: "material-icons" },
  UI_STOP_TEST: { iconName: "cancel_schedule_send", iconType: "material-icons" },
  UI_ANALYZE: { iconName: "analytics", iconType: "material-icons" },
  UI_HOURGLASS: { iconName: "hourglass_top", iconType: "material-icons" },
  UI_SETTINGS: { iconName: "settings", iconType: "material-icons" },
  UI_TUNE: { iconName: "tune", iconType: "material-icons" },
  UI_PLAY: { iconName: "play_arrow", iconType: "material-icons" },
  UI_HISTORY: { iconName: "history", iconType: "material-icons" },
  UI_DOCS: { iconName: "menu_book", iconType: "material-icons" },
  UI_WS_CONNECTED: { iconName: "cloud_done", iconType: "material-icons" },
  UI_WS_DISCONNECTED: { iconName: "cloud_off", iconType: "material-icons" },
  UI_WS_CONNECTING: { iconName: "sync", iconType: "material-icons" },
  UI_RESOLUTION_NHD: { iconName: "aspect_ratio", iconType: "material-icons" },
  UI_RESOLUTION_SD: { iconName: "settings_overscan", iconType: "material-icons" },
  UI_RESOLUTION_HD: { iconName: "hd", iconType: "material-icons" },
  UI_CHECK_CIRCLE: { iconName: "check_circle_outline", iconType: "material-icons" },
  UI_HIGHLIGHT_OFF: { iconName: "highlight_off", iconType: "material-icons" },
  UI_NETWORK_CHECK: { iconName: "network_check", iconType: "material-icons" },
  UI_CAMERA_OUTLINE: { iconName: 'mdi-camera-outline', iconType: 'mdi' },
  UI_LIST_CHECK: { iconName: 'mdi-format-list-checks', iconType: 'mdi' },
  UI_LIGHT_MODE: { iconName: "light_mode", iconType: "material-icons" },
  UI_SYSTEM_MODE: { iconName: "brightness_auto", iconType: "material-icons" },
  UI_DARK_MODE: { iconName: "dark_mode", iconType: "material-icons" },
} as const;

export type GestureCategoryIconType = keyof typeof GESTURE_CATEGORY_ICONS;

// --- Common Values ---

export const BUILT_IN_HAND_GESTURES = [
    "OPEN_PALM", "CLOSED_FIST", "POINTING_UP", "THUMB_UP",
    "THUMB_DOWN", "VICTORY", "ILOVEYOU", "NONE",
] as const;

export const ALL_EVENTS = {
    UI: UI_EVENTS,
    WEBCAM: WEBCAM_EVENTS,
    CAMERA_SERVICE: CAMERA_SERVICE_EVENTS,
    CAMERA_SOURCE: CAMERA_SOURCE_EVENTS,
    STUDIO: STUDIO_EVENTS,
    GESTURE: GESTURE_EVENTS,
    WEBSOCKET: WEBSOCKET_EVENTS,
    APP_STATUS: APP_STATUS_EVENTS,
    DOCS_MODAL: DOCS_MODAL_EVENTS,
    BACKEND_INTERNAL: BACKEND_INTERNAL_EVENTS,
    PERMISSION: PERMISSION_EVENTS,
} as const;