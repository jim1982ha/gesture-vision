/* FILE: packages/frontend/src/ui/ui-controller-core.ts */
// Main UI orchestrator, initializes and manages UI components and managers.
import { SidebarManager } from './managers/sidebar-manager.js';
import { ModalManager } from './managers/modal-manager.js';
import { LayoutManager } from './managers/layout-manager.js';
import { GlobalSettingsModalManager } from './modals/global-settings-modal-manager.js';
import { NotificationManager } from '#frontend/services/notification-manager.js';
import { LanguageManager } from '#frontend/services/language-manager.js';
import ThemeManager from '#frontend/services/theme-manager.js';
import { HeaderTogglesController } from '#frontend/ui/ui-header-toggles-controller.js';
import { CoreRenderer } from './renderers/core-renderer.js';
import { VideoOverlayControlsManager } from '#frontend/ui/components/video-overlay-controls-manager.js';
import { GestureConfigModalManager } from './modals/gesture-config-modal-manager.js';
import { PluginUIService } from '#frontend/services/plugin-ui.service.js';
import { CameraManager } from '#frontend/camera/camera-manager.js';
import { type GestureConfig, type PoseConfig } from '#shared/index.js';
import type { App } from '#frontend/core/app.js';
import type { DocsModalManager } from './ui-docs-modal-manager.js';
import type { ConfirmationModalManager } from './ui-confirmation-modal-manager.js';
import type { CameraService } from '#frontend/services/camera.service.js';
import { setIcon } from './helpers/index.js';
import type { TranslationService } from '#frontend/services/translation.service.js';
import { errorHandlingService } from '#frontend/services/error-handling.service.js';
import { UIActionHandler } from './ui-action-handler.js';
import { UIEventCoordinator } from './ui-event-coordinator.js';

/**
 * Main UI orchestrator, responsible for initializing all UI managers and components.
 */
export class UIController {
  _renderer!: CoreRenderer;
  sidebarManager!: SidebarManager;
  modalManager!: ModalManager;
  layoutManager!: LayoutManager;
  _gestureConfigModalManager!: GestureConfigModalManager;
  _globalSettingsForm!: GlobalSettingsModalManager;
  _themeManager!: ThemeManager;
  _languageManager!: LanguageManager;
  _headerTogglesController!: HeaderTogglesController;
  pluginUIService!: PluginUIService;
  _videoOverlayControlsManager!: VideoOverlayControlsManager;
  _notificationManager!: NotificationManager;
  _docsModalMgr?: DocsModalManager;
  _confirmationModalMgr?: ConfirmationModalManager;
  #actionHandler!: UIActionHandler;
  #eventCoordinator!: UIEventCoordinator;

  appStore: App['appStore'];
  translationService: App['translationService'];
  cameraManager: CameraManager;
  cameraService: CameraService;
  gesture: App['gesture'];

  _editingConfigIndex: number | null = null;
  _originalNameBeingEdited: string | null = null;
  _editingRtspSourceIndex: number | null = null;

  constructor(appRef: App) {
    this.appStore = appRef.appStore;
    this.translationService = appRef.translationService;
    this.gesture = appRef.gesture;
    this.cameraManager = appRef.cameraManager;
    this.cameraService = appRef.cameraService;
    this.#initializeManagers(appRef.translationService);
  }

  #initializeManagers(translationService: TranslationService): void {
    this.pluginUIService = new PluginUIService(this.appStore, translationService);
    this._renderer = new CoreRenderer(this);
    this._notificationManager = new NotificationManager(this.appStore, translationService);
    this.sidebarManager = new SidebarManager(this);
    this.modalManager = new ModalManager(this);
    this.layoutManager = new LayoutManager(this);
    this._languageManager = new LanguageManager(this.appStore, this.translationService);
    this._themeManager = new ThemeManager(this.appStore);
    this._headerTogglesController = new HeaderTogglesController(this.appStore, this);
    this._videoOverlayControlsManager = new VideoOverlayControlsManager(this);
    this._gestureConfigModalManager = new GestureConfigModalManager(this);
    this._globalSettingsForm = new GlobalSettingsModalManager(this, this.modalManager);
    this.#actionHandler = new UIActionHandler(this);
    this.#eventCoordinator = new UIEventCoordinator(this);
  }

  public async initialize(): Promise<void> {
    this.pluginUIService.setUIController(this);
    this.modalManager.initialize();
    this._gestureConfigModalManager.initialize();
    this.#actionHandler.initialize();
  
    const { ConfirmationModalManager } = await import('./ui-confirmation-modal-manager.js');
    this._confirmationModalMgr = new ConfirmationModalManager(this.translationService);
    await this.getDocsModalManager();
    await this.cameraManager.initialize();

    this._renderer.initializePubSubEventListeners();
    this.applyTranslations();
    this.updateButtonState();
  }

  public destroy(): void {
    this.#actionHandler.destroy();
    this.#eventCoordinator.destroy();
    this.sidebarManager.destroy();
    this.modalManager.destroy();
    this.layoutManager.destroy();
    this._gestureConfigModalManager.destroy();
    this._globalSettingsForm.destroy();
    this._themeManager.destroy();
    this._languageManager.destroy();
    this._headerTogglesController.destroy();
    this.pluginUIService.destroy();
    this._videoOverlayControlsManager.destroy();
    this._renderer.destroy();
    this._docsModalMgr?.destroy();
  }

  public updateButtonState = (): void => {
    this._headerTogglesController?.updateAllButtonStates();
  };

  public applyTranslations = (): void => {
    const translate = this.translationService.translate;
    document.title = translate('appName');
    const appTitle = document.getElementById("appTitle");
    if (appTitle) appTitle.textContent = translate('appName');

    const settingsToggle = document.getElementById("mainSettingsToggle") as HTMLButtonElement | null;
    if (settingsToggle) {
        const settingsText = translate('settings');
        settingsToggle.title = settingsText;
        settingsToggle.setAttribute('aria-label', settingsText);
    }
    setIcon(settingsToggle, 'UI_SETTINGS');
    
    this.sidebarManager.applyTranslations();
    this.modalManager.applyTranslations();
    this._globalSettingsForm.applyTranslations();
    this._headerTogglesController.applyTranslations();
    this._videoOverlayControlsManager.applyTranslations();
    this._gestureConfigModalManager?.applyTranslations();
    this.layoutManager?.applyTranslations();
    if (this._confirmationModalMgr?.isReady()) {
      this._confirmationModalMgr.applyTranslations();
    }
    if (this._docsModalMgr) {
      this._docsModalMgr.applyTranslations();
    }
  };
  
  public async getDocsModalManager(): Promise<DocsModalManager | undefined> {
    if (this._docsModalMgr) return this._docsModalMgr;
    const { DocsModalManager } = await import('./ui-docs-modal-manager.js');
    this._docsModalMgr = new DocsModalManager(this);
    return this._docsModalMgr;
  }

  public async updateGestureConfigs(c: (GestureConfig | PoseConfig)[]): Promise<void> {
    try {
      await this.appStore.getState().actions.requestBackendPatch({ gestureConfigs: c });
    } catch (e) {
      errorHandlingService?.handleError(e, 'UpdateGestureConfigs');
    }
  }

  public getGestureConfigsSnapshot = (): (GestureConfig | PoseConfig)[] => this.appStore.getState().gestureConfigs || [];
  public getEditingConfigIndex = (): number | null => this._editingConfigIndex;
  public getOriginalNameBeingEdited = (): string | null => this._originalNameBeingEdited;
  public getEditingRtspSourceIndex = (): number | null => this._editingRtspSourceIndex;
  
  public setEditingConfigIndex = (i: number | null, n?: string | null): void => {
    this._editingConfigIndex = i;
    this._originalNameBeingEdited = i !== null && n ? n : null;
  };
  public setEditingRtspSourceIndex = (index: number | null): void => {
    this._editingRtspSourceIndex = index;
  };

  public closeSettingsModal = (): void => this.modalManager?.closeSettingsModal();
}