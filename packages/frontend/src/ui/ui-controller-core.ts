/* FILE: packages/frontend/src/ui/ui-controller-core.ts */
// Main UI orchestrator, initializes and manages UI components and managers.
import { WebcamManager } from '#frontend/camera/manager.js';
import { CameraSourceManager } from '#frontend/camera/source-manager.js';
import { AppStatusManager } from '#frontend/core/app-status-manager.js';
import type { AppStore } from '#frontend/core/state/app-store.js';
import type { AllDOMElements } from '#frontend/core/dom-elements.js';
import { GestureConfigManager } from '#frontend/gestures/config-manager.js';
import { CameraService } from '#frontend/services/camera.service.js';
import type { TranslationService } from '#frontend/services/translation.service.js';
import { webSocketService } from '#frontend/services/websocket-service.js';
import {
  applyUITranslations,
  updateButtonState,
  updateWsStatusIndicator,
} from "./ui-updater.js";
import type { DocsModalManager } from "./ui-docs-modal-manager.js";
import { ConfirmationModalManager } from "./ui-confirmation-modal-manager.js";
import {
  CAMERA_SOURCE_EVENTS,
  UI_EVENTS,
  WEBCAM_EVENTS,
  APP_STATUS_EVENTS,
  WEBSOCKET_EVENTS,
} from "#shared/constants/index.js";
import { pubsub } from "#shared/core/pubsub.js";
import type {
  GestureConfig,
  PoseConfig
} from "#shared/types/index.js";
import { SidebarManager } from "./managers/sidebar-manager.js";
import { ModalManager } from "./managers/modal-manager.js";
import { LayoutManager } from "./managers/layout-manager.js";
import { GlobalSettingsModalManager } from "./modals/global-settings-modal-manager.js";
import { getElementGroupingGetters } from "./logic/ui-element-groups.js";
import { NotificationManager } from "#frontend/services/notification-manager.js";
import { LanguageManager } from "#frontend/services/language-manager.js";
import ThemeManager from "#frontend/services/theme-manager.js";
import { HeaderTogglesController } from "#frontend/ui/ui-header-toggles-controller.js";
import { UIRenderer } from "./ui-renderer-core.js";
import { VideoOverlayControlsManager } from "#frontend/ui/components/video-overlay-controls-manager.js";
import { GestureConfigForm } from "./components/gesture-form/gesture-config-form.js";
import { PluginUIService } from "#frontend/services/plugin-ui.service.js";
import type { GestureProcessor } from "#frontend/gestures/processor.js";
import type { App } from '#frontend/core/app.js';
import type { FrontendPluginModule } from '#frontend/types/index.js';

interface DashboardPluginModule extends FrontendPluginModule {
    dashboardManagerInstance?: {
        toggleDashboard: (forceState: boolean) => void;
    }
}

export class UIController {
  _elements: Partial<AllDOMElements>;
  _renderer: UIRenderer | null = null;
  sidebarManager: SidebarManager | null = null;
  modalManager: ModalManager | null = null;
  layoutManager: LayoutManager | null = null;
  _gestureConfigForm: GestureConfigForm | null = null;
  _globalSettingsForm: GlobalSettingsModalManager | null = null;
  _themeManager: ThemeManager | null = null;
  _languageManager: LanguageManager | null = null;
  _cameraSourceManager: CameraSourceManager | null = null;
  _appStatusManager: AppStatusManager | null = null;
  _gestureConfigManager: GestureConfigManager | null = null;
  translationService: TranslationService | null = null;
  appStore: AppStore;
  _webcamManagerRef: WebcamManager | null = null;
  _docsModalMgr: DocsModalManager | null = null;
  _confirmationModalMgr: ConfirmationModalManager | null = null;
  _headerTogglesController: HeaderTogglesController | null = null;
  pluginUIService: PluginUIService | null = null;
  _cameraService: CameraService | null = null;
  _videoOverlayControlsManager: VideoOverlayControlsManager | null = null;
  _notificationManager: NotificationManager | null = null;
  _gestureProcessorRef: GestureProcessor | null = null;
  _appRef: App | null = null;
  _editingConfigIndex: number | null = null;
  _originalNameBeingEdited: string | null = null;
  _editingRtspSourceIndex: number | null = null;
  #readyPromise: Promise<void>;
  #resolveReadyPromise?: () => void;
  public updateButtonState: () => void;
  public updateWsStatusIndicator: (c: boolean, i?: boolean, o?: boolean) => void;
  _isInitialized = false;

  constructor(
    passedElements: Partial<AllDOMElements>,
    appStoreInstance: AppStore,
    appStatusManagerInstance: AppStatusManager,
    translationServiceInstance: TranslationService,
    gestureProcessorInstance: GestureProcessor | null
  ) {
    this._elements = passedElements;
    this.appStore = appStoreInstance;
    this._appStatusManager = appStatusManagerInstance;
    this.translationService = translationServiceInstance;
    this._gestureProcessorRef = gestureProcessorInstance;
    this.#readyPromise = new Promise((resolve) => { this.#resolveReadyPromise = resolve; });
    if (!this.translationService) throw new Error("UIController requires a TranslationService instance.");
    if (!this._gestureProcessorRef) throw new Error("UIController requires a GestureProcessor instance.");
    this.pluginUIService = new PluginUIService(this.appStore, this.translationService, this, this._gestureProcessorRef);
    this.updateWsStatusIndicator = updateWsStatusIndicator.bind(this);
    this.updateButtonState = () => { updateButtonState.call(this); this.layoutManager?.applyVideoSizePreference(); };
    this.updateWsStatusIndicator(webSocketService.isConnected(), false, webSocketService.isConnecting());
  }

  public async initialize(): Promise<void> {
    await this.translationService?.waitUntilInitialized();
    await this.#initManagersAndComponents();
    if (this._confirmationModalMgr) await this._confirmationModalMgr.waitUntilReady();
    this.#initializeEventListeners();
    this.#initializeCoreSubscriptions();
    this.applyTranslations();
    this.updateButtonState();
    this.layoutManager?.applyAllVisibilities(false);
    this._isInitialized = true;
    if (this.#resolveReadyPromise) { this.#resolveReadyPromise(); this.#resolveReadyPromise = undefined; }
  }

  #initManagersAndComponents = async (): Promise<void> => {
    if (!this.pluginUIService || !this.appStore || !this.translationService) throw new Error("Core services not ready.");
    const elementGroups = getElementGroupingGetters(this._elements);
    this._gestureConfigManager = new GestureConfigManager(this.appStore, this);
    this._notificationManager = new NotificationManager(this);
    this._renderer = new UIRenderer(this);
    this._renderer.updateElements(elementGroups.rendererElements);
    this._languageManager = new LanguageManager(elementGroups.languageManagerElements, this.appStore);
    this._themeManager = new ThemeManager(this.appStore);
    this._confirmationModalMgr = new ConfirmationModalManager(this);
    this.sidebarManager = new SidebarManager(elementGroups.panelElements, this);
    this.modalManager = new ModalManager(elementGroups.panelElements, this);
    this.layoutManager = new LayoutManager(elementGroups.panelElements, this);
    this._gestureConfigForm = new GestureConfigForm(this);
    this._globalSettingsForm = new GlobalSettingsModalManager(elementGroups.globalSettingsForm, this, this.modalManager);
    this._headerTogglesController = new HeaderTogglesController(elementGroups.headerToggles, this.appStore, this);
    this._videoOverlayControlsManager = new VideoOverlayControlsManager(this);
  };

  public setCameraSourceManager(cameraSourceManager: CameraSourceManager | null): void { this._cameraSourceManager = cameraSourceManager; }
  public setAppRef(appRef: App): void { this._appRef = appRef; }

  #initializeEventListeners = (): void => {
    this._elements.wsStatusIndicator?.addEventListener("click", () => { if (!webSocketService.isConnected()) webSocketService.forceReconnect(); });
    this._elements.clearHistoryButton?.addEventListener("click", () => this.appStore.getState().actions.clearHistory());
    const docsOpen = () => this.getDocsModalManager().then((mgr) => mgr?.openModal()).catch((e) => console.error(e));
    this._elements.appTitle?.addEventListener("click", docsOpen);
    this._elements.appVersionDisplaySettings?.addEventListener("click", docsOpen);
    this._elements.configListDiv?.addEventListener("click", (e: Event) => this.#handleConfigListClick(e as MouseEvent));
    this._elements.inactiveConfigListDiv?.addEventListener("click", (e: Event) => this.#handleConfigListClick(e as MouseEvent));
    this._elements.cameraList?.addEventListener("click", (e: Event) => this.#handleCameraListItemClick(e as MouseEvent));
  };

  #initializeCoreSubscriptions = (): void => {
    this.appStore.subscribe((state, prevState) => {
        if (this._isInitialized) {
            if (state.languagePreference !== prevState.languagePreference) this.applyTranslations();
            this.updateButtonState();
            if (state.gestureConfigs !== prevState.gestureConfigs || state.pluginManifests !== prevState.pluginManifests) this._renderer?.renderConfigList();
            if (state.streamStatus !== prevState.streamStatus) { this._renderer?.updateCameraListUI(); this.updateButtonState(); }
            if (state.historyEntries !== prevState.historyEntries) this._renderer?.renderHistoryList(state.historyEntries);
        }
    });
    [APP_STATUS_EVENTS.WEBCAM_STATE_CHANGED, APP_STATUS_EVENTS.MODEL_STATE_CHANGED, APP_STATUS_EVENTS.STREAM_CONNECTING_STATE_CHANGED, UI_EVENTS.REQUEST_SELECTED_CAMERA_DISPLAY_UPDATE, CAMERA_SOURCE_EVENTS.START_STREAM_FROM_UI].forEach(e => pubsub.subscribe(e, this.updateButtonState));
    pubsub.subscribe(WEBSOCKET_EVENTS.CONNECTING, () => this.updateWsStatusIndicator(false, false, true));
    pubsub.subscribe(WEBSOCKET_EVENTS.CONNECTED, () => this.updateWsStatusIndicator(true, false, false));
    pubsub.subscribe(WEBSOCKET_EVENTS.DISCONNECTED, () => this.updateWsStatusIndicator(false, false, false));
    pubsub.subscribe(WEBCAM_EVENTS.STREAM_START, () => { this._appStatusManager?.setIsStreamConnecting(false); this.updateButtonState(); this._videoOverlayControlsManager?.setOverlayState("STREAM_ACTIVE"); });
    pubsub.subscribe(WEBCAM_EVENTS.STREAM_CONNECTION_CANCELLED, () => { this._appStatusManager?.setIsStreamConnecting(false); this.updateButtonState(); this._videoOverlayControlsManager?.setOverlayState("OFFLINE_IDLE"); });
    pubsub.subscribe(UI_EVENTS.RECEIVE_UI_CONTRIBUTION, this.#renderContributions);
    pubsub.subscribe(UI_EVENTS.REQUEST_EDIT_CONFIG, this.#handleEditConfigRequest);
    if(this._renderer) this._renderer.initializePubSubEventListeners();
  }
  
  #renderContributions = (): void => {
    if (!this.pluginUIService) return;
    const headerSlot = document.getElementById('header-plugin-contribution-slot');
    if (headerSlot) {
        headerSlot.innerHTML = '';
        const contributions = this.pluginUIService.getContributionsForSlot('header-controls');
        contributions.forEach(element => headerSlot.appendChild(element));
    }
  };

  #handleCameraListItemClick = (event: MouseEvent): void => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button[data-device-id]");
    if (button?.dataset.deviceId) {
      this._appRef?._startStreamWithSource(button.dataset.deviceId);
      this.modalManager?.closeCameraSelectModal();
    }
  };

  #handleEditConfigRequest = (gestureName?: unknown): void => {
    if (typeof gestureName !== 'string' || !this._gestureConfigForm) return;
    const currentConfigs = this.getGestureConfigsSnapshot();
    const index = currentConfigs.findIndex(c => ('gesture' in c ? c.gesture : c.pose) === gestureName);
    if (index !== -1) {
        this._gestureConfigForm.startEdit(index);
        this.sidebarManager?.toggleConfigSidebar(true);

        const dashboardModule = this._appRef?.ui?.pluginUIService?.getLoadedModuleById('gesture-vision-plugin-dashboard') as DashboardPluginModule | undefined;
        dashboardModule?.dashboardManagerInstance?.toggleDashboard(false);
    }
  };
  
  #handleConfigListClick = (event: MouseEvent): void => {
    const cardItem = (event.target as HTMLElement).closest<HTMLElement>(".card-item");
    if (!cardItem) return;
    const gestureName = cardItem.dataset.gestureName;
    if (!gestureName) return;
    
    if ((event.target as HTMLElement).closest<HTMLButtonElement>(".delete-btn")) {
        this.#handleDeleteConfig(gestureName);
    } else if (cardItem.classList.contains("card-item-clickable")) {
        this.#handleEditConfigRequest(gestureName);
    }
  };
  
  #handleDeleteConfig = (gestureName: string): void => {
    const currentConfigs = this.getGestureConfigsSnapshot();
    const configIndex = currentConfigs.findIndex(c => ('gesture' in c ? c.gesture : c.pose) === gestureName);
    if (configIndex === -1) return;
    
    if (this.getEditingConfigIndex() === configIndex) {
        this._gestureConfigForm?.cancelEditMode(false);
    }

    const updatedConfigs = currentConfigs.filter((_, i) => i !== configIndex);
    this.updateGestureConfigs(updatedConfigs)
        .catch(error => pubsub.publish(UI_EVENTS.SHOW_ERROR, { messageKey: `Error deleting config: ${(error as Error).message}` }));
  };

  public closeSettingsModal = (): void => this.modalManager?.closeSettingsModal();
  public getRenderer = (): UIRenderer | null => this._renderer;
  public waitUntilReady = (): Promise<void> => this.#readyPromise;
  public setWebcamManager = (w: WebcamManager | null): void => { this._webcamManagerRef = w; };
  public setCameraService = (cs: CameraService | null): void => { if (this.pluginUIService) this.pluginUIService.setCameraService(cs); };

  public applyTranslations = (): void => {
    applyUITranslations(this);
    this._globalSettingsForm?.applyTranslations();
    this._gestureConfigForm?.applyTranslations();
    this._languageManager?.applyTranslations();
    this._docsModalMgr?.applyTranslations();
    this._confirmationModalMgr?.applyTranslations();
    this._renderer?.applyTranslations();
    this._headerTogglesController?.applyTranslations();
    this._videoOverlayControlsManager?.applyTranslations();
  };
  
  public async renderConfigListToContainer(container: HTMLElement, configs: (GestureConfig | PoseConfig)[], options = {}): Promise<void> {
    const { renderConfigList } = await import('./renderers/config-list-renderer.js');
    const elements = { configListDiv: container, inactiveConfigListDiv: null };
    await renderConfigList(elements, configs, this.appStore, this.pluginUIService, this, options);
  }

  public async updateGestureConfigs(c: (GestureConfig | PoseConfig)[]): Promise<void> {
    if (this._gestureConfigManager) { await this.appStore.getState().actions.requestBackendPatch({ gestureConfigs: c }); }
  }
  public getGestureConfigsSnapshot = (): (GestureConfig | PoseConfig)[] => this.appStore.getState().gestureConfigs || [];
  public getEditingConfigIndex = (): number | null => this._editingConfigIndex;
  public getOriginalNameBeingEdited = (): string | null => this._originalNameBeingEdited;
  public getEditingRtspSourceIndex = (): number | null => this._editingRtspSourceIndex;
  public setEditingConfigIndex = (i: number | null, n?: string | null): void => { this._editingConfigIndex = i; this._originalNameBeingEdited = i !== null && n ? n : null; };
  public setEditingRtspSourceIndex = (index: number | null): void => { this._editingRtspSourceIndex = index; };
  public async getDocsModalManager(): Promise<DocsModalManager | null> {
    if (this._docsModalMgr) return this._docsModalMgr;
    try {
      const { DocsModalManager } = await import("./ui-docs-modal-manager.js");
      this._docsModalMgr = new DocsModalManager(this);
      return this._docsModalMgr;
    } catch (e) { console.error("[UI] Dynamic import of DocsModalManager failed:", e); return null; }
  }
}