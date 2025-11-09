/* FILE: packages/frontend/src/types/index.ts */
// Contains types that are exclusively used by the frontend application.
import type React from 'react';
import type { GestureCategoryIconType, ActionSettingFieldDescriptor, ActionDisplayDetail, PluginManifest, FullConfiguration } from '#shared/index.js';
import type { Landmark, GestureRecognizerResult, PoseLandmarkerResult } from '@mediapipe/tasks-vision';

import type { AppStore } from '#frontend/core/state/app-store.js';
import type { CameraService } from '#frontend/services/camera.service.js';
import type { GestureProcessor } from '#frontend/gestures/processor.js';
import type { TranslationService } from '#frontend/services/translation.service.js';
import type { PluginUIService } from '#frontend/services/plugin-ui.service.js';
import type { WebSocketService } from '#frontend/services/websocket-service.js';
import type ThemeManager from '#frontend/services/theme-manager.js';

import * as constants from '#shared/index.js';
import * as sharedUtils from '#shared/utils/index.js';
import * as uiHelpers from '#frontend/ui/helpers/ui-helpers.js';

export interface AppContextType {
    appStore: AppStore;
    services: {
        translationService: TranslationService;
        pluginUIService: PluginUIService;
        cameraService: CameraService | null;
        gestureProcessor: GestureProcessor | null;
        themeManager: ThemeManager;
        webSocketService: WebSocketService;
        pubsub: {
            publish: (event: string, data?: unknown) => void;
            subscribe: ( event: string, callback: (...args: unknown[]) => void ) => () => void;
        };
    };
    elements: {
        videoElement: HTMLVideoElement | null;
        outputCanvas: HTMLCanvasElement | null;
    };
    shared: {
        constants: typeof constants;
        utils: typeof sharedUtils;
        services: {
            actionDisplayUtils: typeof uiHelpers;
        };
    };
}

export interface ThemePreference {
  base: string;
  mode: 'light' | 'dark' | 'system';
}

export interface FrameAnalysisFrameData {
  videoElement: HTMLVideoElement;
  imageSourceElement: HTMLVideoElement | HTMLCanvasElement;
  roiConfig: { x: number; y: number; width: number; height: number } | null;
  timestamp: number;
}

export interface TestResultPayload {
  detected: boolean;
  confidence: number;
  landmarks: unknown[] | null;
  gestureType: 'hand' | 'pose';
}

export interface HistoryEntry {
  id: string;
  timestamp: Date;
  gesture: string;
  actionType: string;
  gestureCategory: GestureCategoryIconType;
  success?: boolean;
  reason?: string | null;
  details?: unknown;
}

export interface SnapshotData {
  landmarks2d: Landmark[] | null;
  landmarks3d: Landmark[] | null;
  imageData: ImageData | null;
  isMirrored?: boolean;
}

export interface SnapshotPromise {
  resolve: (value: SnapshotData | PromiseLike<SnapshotData>) => void;
  reject: (reason?: unknown) => void;
}

export interface ConfirmationModalConfig {
    titleKey?: string;
    messageKey: string;
    messageSubstitutions?: Record<string, string | number>;
    confirmTextKey?: string;
    cancelTextKey?: string;
    onConfirm: () => void;
    onCancel?: () => void;
    isDangerAction?: boolean;
}

export interface RenderOutputData {
    processingTime?: number;
    handGestureResults?: GestureRecognizerResult;
    customActionableGestures?: { categoryName?: string; score?: number }[];
    poseLandmarkerResults?: PoseLandmarkerResult;
}

export interface SliderConfig {
    labelKey: string;
    configKey: keyof FullConfiguration;
    min: number;
    max: number;
    step: number;
}

export interface SliderProps {
  label: string;
  configKey: keyof FullConfiguration;
  min: number;
  max: number;
  step: number;
  value: number;
  onInput: (key: keyof FullConfiguration, value: number) => void;
  onChange: (key: keyof FullConfiguration, value: number) => void;
}

// --- Frontend Plugin Interfaces ---
export type ActionDisplayDetailsRendererFn = (
  actionPluginSettings: unknown,
  context: PluginUIContext
) => ActionDisplayDetail[];

export interface FrontendPluginModule {
  actionSettingsFields?:
    | ActionSettingFieldDescriptor[]
    | ((context: PluginUIContext) => ActionSettingFieldDescriptor[]);
  init?(context: PluginUIContext): Promise<void>;
  destroy?(): void;
  GlobalSettingsComponent?: React.ComponentType<{ manifest: PluginManifest; onSaveSuccess?: () => void; onCancel?: () => void; }>;
  UIComponent?: React.ComponentType;
  HeaderComponent?: React.ComponentType;
  getActionDisplayDetails?: ActionDisplayDetailsRendererFn;
  pluginSlot?: string;
}

export interface PluginUIContext {
  manifest?: PluginManifest;
  coreStateManager: AppStore;
  pluginUIService: PluginUIService;
  cameraService?: CameraService;
  gesture?: GestureProcessor;
  webSocketService?: WebSocketService;
  requestCloseSettingsModal?: () => void;
  data: Record<string, unknown>;
  services: {
    translationService: TranslationService;
    pubsub: {
      publish: (event: string, data?: unknown) => void;
      subscribe: ( event: string, callback: (...args: unknown[]) => void ) => () => void;
    };
  };
  shared: {
    constants: typeof constants;
    services: {
      actionDisplayUtils: typeof uiHelpers;
    };
    utils: typeof sharedUtils;
  };
}