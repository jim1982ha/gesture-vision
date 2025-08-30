/* FILE: packages/frontend/src/types/index.ts */
// Contains types that are exclusively used by the frontend application.

import type { GestureCategoryIconType } from '#shared/index.js';
import type {
  ActionSettingFieldDescriptor,
  ActionSettingFieldOption,
  ActionDisplayDetail,
  PluginManifest,
} from '#shared/index.js';
import type { CardContent } from '#frontend/ui/utils/card-utils.js';
import type { Landmark } from '@mediapipe/tasks-vision';

export interface ThemePreference {
  base: string;
  mode: 'light' | 'dark' | 'system';
}

export interface FrameAnalysisFrameData {
  videoElement: HTMLVideoElement;
  imageSourceElement: HTMLVideoElement | HTMLCanvasElement; // New property to specify the analysis source
  roiConfig: { x: number; y: number; width: number; height: number } | null;
  timestamp: number;
}

export interface TestResultPayload {
  detected: boolean;
  confidence: number;
  landmarks: unknown[] | null;
  gestureType: 'hand' | 'pose';
}

export interface AppDOMElements {
  [key: string]:
    | HTMLElement
    | SVGElement
    | HTMLInputElement
    | HTMLButtonElement
    | HTMLSelectElement
    | HTMLTextAreaElement
    | HTMLFormElement
    | null
    | undefined;
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

// --- Frontend Plugin Interfaces ---
export type ActionDisplayDetailsRendererFn = (
  actionPluginSettings: unknown,
  context: PluginUIContext
) => ActionDisplayDetail[];

export interface IPluginActionSettingsComponent {
  render(
    currentActionSpecificSettings: unknown | null,
    context: PluginUIContext
  ): HTMLElement;
  getActionSettingsToSave(): unknown | null;
  validate?(): { isValid: boolean; errors?: string[] };
  destroy?(): void;
  applyTranslations?(): void;
}

export type CreatePluginActionSettingsComponentFn = (
  pluginId: string,
  manifest: PluginManifest,
  context: PluginUIContext
) => IPluginActionSettingsComponent;

export interface IPluginGlobalSettingsComponent {
  getElement(): HTMLElement;
  initialize?(): void;
  update(
    currentPluginGlobalConfig: unknown | null,
    context: PluginUIContext,
    extraState?: { isPending?: boolean }
  ): void;
  onConfigUpdate?(newConfig: unknown | null): void;
  destroy?(): void;
  applyTranslations?(): void;
  getConfigToSave?(): unknown | null;
}
export type CreatePluginGlobalSettingsComponentFn = (
  pluginId: string,
  manifest: PluginManifest,
  context: PluginUIContext
) => IPluginGlobalSettingsComponent;

export type CreateSearchableDropdownFn = (config: {
  inputElement: HTMLInputElement;
  listElement: HTMLElement;
  valueElement: HTMLInputElement;
  fetchItemsFn: (filterText: string) => Promise<ActionSettingFieldOption[]>;
  onItemSelectFn: (value: string, label: string) => void;
  inputPlaceholder?: string;
  disabledPlaceholder?: string;
}) => {
  refresh: (showAfterRefresh?: boolean) => Promise<void>;
  setDisabled: (isDisabled: boolean, newPlaceholderText?: string) => void;
  applyTranslations?: () => void;
};

export interface FrontendPluginModule {
  manifest: PluginManifest;
  actionSettingsFields?:
    | ActionSettingFieldDescriptor[]
    | ((context: PluginUIContext) => ActionSettingFieldDescriptor[]);
  init?(context: PluginUIContext): Promise<void>;
  destroy?(): void;
  createGlobalSettingsComponent?: CreatePluginGlobalSettingsComponentFn;
  createActionSettingsComponent?: CreatePluginActionSettingsComponentFn;
  getActionDisplayDetails?: ActionDisplayDetailsRendererFn;
  launchModal?(): void;
}

export interface PluginUIContext {
  manifest?: PluginManifest;
  coreStateManager: unknown;
  pluginUIService: import('#frontend/services/plugin-ui.service.js').PluginUIService;
  cameraService?: unknown;
  gesture?: unknown;
  webSocketService?: unknown;
  globalSettingsModalManager?: { closeModal: () => void };
  uiController?: import('#frontend/ui/ui-controller-core.js').UIController;
  requestCloseSettingsModal?: () => void;
  data?: Record<string, unknown>;
  services: {
    translate: (key: string, substitutions?: Record<string, unknown>) => string;
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
    createSearchableDropdown: CreateSearchableDropdownFn;
    setIcon: unknown;
    updateButtonGroupActiveState: (
      groupElement: HTMLElement | null | undefined,
      activeValue: string | number | boolean | null | undefined,
      isGroupDisabled?: boolean
    ) => void;
    BasePluginGlobalSettingsComponent: unknown;
    GenericPluginActionSettingsComponent: unknown;
    ActionPluginUIManager: unknown;
  };
  shared: {
    constants: unknown;
    services: {
      actionDisplayUtils: unknown;
    };
    utils: unknown;
  };
}