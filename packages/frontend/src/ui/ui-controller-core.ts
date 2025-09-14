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
import { UIRenderer } from './ui-renderer-core.js';
import { VideoOverlayControlsManager } from '#frontend/ui/components/video-overlay-controls-manager.js';
import { GestureConfigModalManager } from './modals/gesture-config-modal-manager.js';
import { PluginUIService } from '#frontend/services/plugin-ui.service.js';
import { CameraManager } from '#frontend/camera/camera-manager.js';
import {
  pubsub,
  UI_EVENTS,
  WEBSOCKET_EVENTS,
  WEBCAM_EVENTS,
  DOCS_MODAL_EVENTS,
  type GestureConfig,
  type PoseConfig,
  type GestureCategoryIconType,
} from '#shared/index.js';
import type { App } from '#frontend/core/app.js';
import type { DocsModalManager } from './ui-docs-modal-manager.js';
import type { ConfirmationModalManager } from './ui-confirmation-modal-manager.js';
import type { CameraService } from '#frontend/services/camera.service.js';
import { setIcon } from './helpers/index.js';
import type { TranslationService } from '#frontend/services/translation.service.js';

/**
 * Main UI orchestrator, responsible for initializing all UI managers and components.
 */
export class UIController {
  _renderer!: UIRenderer;
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
    this.#initializeCoreSubscriptions();
  }

  #initializeManagers(translationService: TranslationService): void {
    this.pluginUIService = new PluginUIService(
      this.appStore,
      translationService
    );
    this._renderer = new UIRenderer(this);
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
  }

  public async initialize(): Promise<void> {
    this.pluginUIService.setUIController(this);
    this.modalManager.initialize();
    this._gestureConfigModalManager.initialize();
  
    const { ConfirmationModalManager } = await import(
      './ui-confirmation-modal-manager.js'
    );
    this._confirmationModalMgr = new ConfirmationModalManager(this.translationService);
    await this.getDocsModalManager();
    await this.cameraManager.initialize();

    this._renderer.initializePubSubEventListeners();
    this.#updateWsStatusIndicator(true);
    this.applyTranslations();
    this.updateButtonState();

    document.getElementById('appBrand')?.addEventListener('click', () => {
        pubsub.publish(DOCS_MODAL_EVENTS.REQUEST_OPEN, 'ABOUT');
    });

    this.#renderContributions();
  }

  #initializeCoreSubscriptions = (): void => {
    this.appStore.subscribe((state, prevState) => {
      if (state.languagePreference !== prevState.languagePreference) {
        this.applyTranslations();
      }
      if (state.isWsConnected !== prevState.isWsConnected)
        this.#updateWsStatusIndicator();
      this.updateButtonState();
      if (state.historyEntries !== prevState.historyEntries)
        this._renderer?.renderHistoryList(state.historyEntries);
    });

    pubsub.subscribe(UI_EVENTS.REQUEST_SELECTED_CAMERA_DISPLAY_UPDATE, this.updateButtonState);

    pubsub.subscribe(WEBSOCKET_EVENTS.CONNECTING, () =>
      this.#updateWsStatusIndicator(false, true)
    );
    pubsub.subscribe(WEBCAM_EVENTS.STREAM_START, () => {
      this.appStore.getState().actions.setIsStreamConnecting(false);
      this.updateButtonState();
      this._videoOverlayControlsManager?.setOverlayState('STREAM_ACTIVE');
    });
    pubsub.subscribe(WEBCAM_EVENTS.STREAM_CONNECTION_CANCELLED, () => {
      this.appStore.getState().actions.setIsStreamConnecting(false);
      this.updateButtonState();
      this._videoOverlayControlsManager?.setOverlayState('OFFLINE_IDLE');
    });
    pubsub.subscribe(
      UI_EVENTS.RECEIVE_UI_CONTRIBUTION,
      this.#renderContributions
    );
    pubsub.subscribe(UI_EVENTS.PLUGINS_MANIFESTS_PROCESSED, () =>
      this._renderer?.renderConfigList()
    );

    document.getElementById('cameraList')?.addEventListener('click', (event) => {
      const button = (
        event.target as HTMLElement
      ).closest<HTMLButtonElement>('button[data-device-id]');
      if (button) {
        const deviceId = button.dataset.deviceId;
        this.modalManager.closeCameraSelectModal();
        pubsub.publish(UI_EVENTS.CAMERA_LIST_ITEM_CLICKED, deviceId);
      }
    });

    document.getElementById('configListContainer')?.addEventListener('click', (event) => {
      const card = (event.target as HTMLElement).closest<HTMLElement>('.card-item');
      if (!card) return;

      const deleteBtn = (event.target as HTMLElement).closest('.delete-btn');
      const gestureName = card.dataset.gestureName;

      if (deleteBtn && gestureName) {
        event.stopPropagation();
        this.#handleDeleteGestureConfig(gestureName);
        return;
      }

      const editBtn = (event.target as HTMLElement).closest('.edit-btn');
      if (gestureName && editBtn) {
        event.stopPropagation();
        pubsub.publish(UI_EVENTS.REQUEST_EDIT_CONFIG, gestureName);
      }
    });
    
    setIcon(document.getElementById("mainSettingsCloseButton"), 'UI_CLOSE');
    setIcon(document.getElementById("docsCloseButton"), 'UI_CLOSE');
    setIcon(document.getElementById("cameraSelectCloseButton"), 'UI_CLOSE');
    setIcon(document.getElementById("historySidebarHeaderCloseBtn"), 'UI_CLOSE');
  };

  #updateWsStatusIndicator(isInitial = false, isConnecting = false): void {
    const t = document.getElementById("wsStatusIndicator");
    if (!t) return;
    const translate = this.translationService.translate;
  
    const isConnected = this.appStore.getState().isWsConnected;
  
    t.innerHTML = '';
    t.classList.remove('connected', 'disconnected', 'connecting');
    t.classList.toggle('clickable', !isConnected || isConnecting);
    t.style.cursor = !isConnected || isConnecting ? 'pointer' : 'help';
    let statusText = '',
      titleKey = '',
      iconKey: GestureCategoryIconType = 'UI_WS_DISCONNECTED';
  
    if (isConnecting) {
      t.classList.add('connecting');
      titleKey = 'wsConnecting';
      statusText = 'CONNECTING';
      iconKey = 'UI_WS_CONNECTING';
    } else if (isConnected) {
      t.classList.add('connected');
      titleKey = 'wsConnected';
      statusText = 'CONNECTED';
      iconKey = 'UI_WS_CONNECTED';
      if (!isInitial)
        this._notificationManager?.showNotification(
          translate('wsConnectedShort'),
          'success',
          2000
        );
    } else {
      t.classList.add('disconnected');
      titleKey = 'wsDisconnected';
      statusText = 'DISCONNECTED';
      iconKey = 'UI_WS_DISCONNECTED';
      if (!isInitial && !isConnecting)
        this._notificationManager?.showNotification(
          translate('wsDisconnectedShort'),
          'warning',
          3000
        );
    }
  
    if (iconKey === 'UI_WS_CONNECTED') {
      const e = document.createElement('img');
      e.src = '/icons/favicon.svg';
      e.alt = 'Connected';
      e.style.width = 'var(--icon-size-status)';
      e.style.height = 'var(--icon-size-status)';
      e.style.filter = 'var(--svg-filter-primary)';
      t.appendChild(e);
    } else {
      const iconSpan = document.createElement('span');
      t.appendChild(iconSpan);
      setIcon(iconSpan, iconKey);
    }
    t.title = translate(titleKey, { defaultValue: `WebSocket ${statusText}` });
  }

  public updateButtonState = (): void => {
    this._headerTogglesController?.updateAllButtonStates();
  };

  #handleDeleteGestureConfig = (gestureName: string): void => {
    const configs = this.getGestureConfigsSnapshot();
    const configToDelete = configs.find(c => ('gesture' in c ? c.gesture : c.pose) === gestureName);
    if (!configToDelete) return;

    this._confirmationModalMgr?.show({
      messageKey: 'confirmDeleteMessage',
      messageSubstitutions: { item: gestureName },
      confirmTextKey: 'delete',
      onConfirm: () => {
        const updatedConfigs = configs.filter(c => ('gesture' in c ? c.gesture : c.pose) !== gestureName);
        this.updateGestureConfigs(updatedConfigs);
        if (this.getOriginalNameBeingEdited() === gestureName) {
          this._gestureConfigModalManager.hide();
        }
      },
    });
  };

  #renderContributions = (): void => {
    if (!this.pluginUIService) return;
  
    const slots = ['header-plugin-contribution-slot', 'custom-gestures-actions-slot'];
  
    slots.forEach(slotId => {
      const slotElement = document.getElementById(slotId);
      if (slotElement) {
        slotElement.innerHTML = '';
        const contributions = this.pluginUIService.getContributionsForSlot(slotId);
        contributions.forEach(element => {
          slotElement.appendChild(element);
        });
      }
    });
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
  public async updateGestureConfigs(
    c: (GestureConfig | PoseConfig)[]
  ): Promise<void> {
    await this.appStore
      .getState()
      .actions.requestBackendPatch({ gestureConfigs: c });
  }
  public getGestureConfigsSnapshot = (): (GestureConfig | PoseConfig)[] =>
    this.appStore.getState().gestureConfigs || [];
  public getEditingConfigIndex = (): number | null => this._editingConfigIndex;
  public getOriginalNameBeingEdited = (): string | null =>
    this._originalNameBeingEdited;
  public getEditingRtspSourceIndex = (): number | null =>
    this._editingRtspSourceIndex;
  public setEditingConfigIndex = (
    i: number | null,
    n?: string | null
  ): void => {
    this._editingConfigIndex = i;
    this._originalNameBeingEdited = i !== null && n ? n : null;
  };
  public setEditingRtspSourceIndex = (index: number | null): void => {
    this._editingRtspSourceIndex = index;
  };
  public closeSettingsModal = (): void =>
    this.modalManager?.closeSettingsModal();
}