/* FILE: packages/frontend/src/types/index.ts */
// Contains types that are exclusively used by the frontend application.

import type { GestureCategoryIconType, ActionSettingFieldDescriptor, ActionDisplayDetail, PluginManifest, PluginTestConnectionResultPayload } from '#shared/index.js';
import type { Landmark } from '@mediapipe/tasks-vision';

// Import concrete classes for strong typing
import type { AppStore } from '#frontend/core/state/app-store.js';
import type { CameraService } from '#frontend/services/camera.service.js';
import type { GestureProcessor } from '#frontend/gestures/processor.js';
import type { TranslationService } from '#frontend/services/translation.service.js';
import type { PluginUIService } from '#frontend/services/plugin-ui.service.js';
import type { UIController } from '#frontend/ui/ui-controller-core.js';
import type { GlobalSettingsModalManager } from '#frontend/ui/modals/global-settings-modal-manager.js';
import type { WebSocketService } from '#frontend/services/websocket-service.js';
import type { CardContent } from '#frontend/ui/helpers/card-utils.js';
import type { modalStack } from '#frontend/ui/managers/modal-manager.js';

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

export interface SnapshotPromise {
  resolve: (
    value:
      | { landmarks: Landmark[] | null; imageData: ImageData | null }
      | PromiseLike<{ landmarks: Landmark[] | null; imageData: ImageData | null }>
  ) => void;
  reject: (reason?: unknown) => void;
}

export interface LandmarkVisibilityOverridePayload {
  hand: boolean;
  pose: boolean;
  numHands?: number;
}

// --- Frontend Plugin Interfaces ---
export type ActionDisplayDetailsRendererFn = (
  actionPluginSettings: unknown,
  context: PluginUIContext
) => ActionDisplayDetail[];

export interface IPluginActionSettingsComponent {
  render(currentActionSpecificSettings: unknown | null, context: PluginUIContext): HTMLElement;
  getActionSettingsToSave(): unknown | null;
  validate?(): { isValid: boolean; errors?: string[] };
  destroy?(): void;
  applyTranslations?(): void;
}

export interface IPluginGlobalSettingsComponent {
  isPending: boolean;
  isTestingConnection: boolean;
  lastTestResult: PluginTestConnectionResultPayload | null;
  testButtonTimeout: number | null;
  manifest: PluginManifest;
  
  getElement(): HTMLElement;
  update(newConfig?: object | null): void;
  updateToggleButtonState(): void;
  updateTestState(isTesting: boolean, result?: PluginTestConnectionResultPayload | null): void;
  destroy(): void;
  applyTranslations?(): void;
  switchToEditMode(): void;
  switchToViewMode(): void;
  isEditing(): boolean;
  getFormValues(): object | null;
}

export interface FrontendPluginModule {
  manifest: PluginManifest;
  actionSettingsFields?:
    | ActionSettingFieldDescriptor[]
    | ((context: PluginUIContext) => ActionSettingFieldDescriptor[]);
  init?(context: PluginUIContext): Promise<void>;
  destroy?(): void;
  createGlobalSettingsComponent?: (
    pluginId: string,
    manifest: PluginManifest,
    context: PluginUIContext,
  ) => IPluginGlobalSettingsComponent;
  getActionDisplayDetails?: ActionDisplayDetailsRendererFn;
  launchModal?(): void;
}

export interface PluginUIContext {
  manifest?: PluginManifest;
  coreStateManager: AppStore;
  pluginUIService: PluginUIService;
  cameraService?: CameraService;
  gesture?: GestureProcessor;
  webSocketService?: WebSocketService;
  globalSettingsModalManager?: GlobalSettingsModalManager;
  uiController?: UIController;
  requestCloseSettingsModal?: () => void;
  data: Record<string, unknown>;
  services: {
    translationService: TranslationService;
    pubsub: {
      publish: (event: string, data?: unknown) => void;
      subscribe: (
        event: string,
        callback: (...args: unknown[]) => void
      ) => () => void;
    };
  };
  uiComponents: {
    createCardElement: (content: CardContent) => HTMLDivElement;
    setIcon: (element: Element | null | undefined, iconIdentifier: GestureCategoryIconType | string) => void;
    setElementVisibility: (element: HTMLElement | null | undefined, isVisible: boolean) => void;
    updateButtonGroupActiveState: (
      groupElement: HTMLElement | null | undefined,
      activeValue: string | number | boolean | null | undefined,
      isGroupDisabled?: boolean
    ) => void;
    BasePluginGlobalSettingsComponent: typeof import('#frontend/ui/components/plugins/base-plugin-global-settings.component.js').BasePluginGlobalSettingsComponent;
    GenericPluginActionSettingsComponent: typeof import('#frontend/ui/components/plugins/generic-plugin-action-settings.component.js').GenericPluginActionSettingsComponent;
    ActionPluginUIManager: typeof import('#frontend/ui/components/gesture-form/action-plugin-ui-manager.js').ActionPluginUIManager;
    modalStack: typeof modalStack;
  };
  shared: {
    constants: unknown;
    services: {
      actionDisplayUtils: unknown;
    };
    utils: unknown;
  };
}