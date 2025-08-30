/* FILE: packages/frontend/src/ui/ui-controller-core.ts */
// Main UI orchestrator, initializes and manages UI components and managers.
import {
  applyUITranslations,
  updateButtonState,
  updateWsStatusIndicator,
} from './ui-updater.js';
import { getElementGroupingGetters } from './logic/ui-element-groups.js';
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
import { GestureConfigForm } from './components/gesture-form/gesture-config-form.js';
import { PluginUIService } from '#frontend/services/plugin-ui.service.js';
import { GestureConfigManager } from '#frontend/gestures/config-manager.js';
import { CameraManager } from '#frontend/camera/camera-manager.js';

import {
  pubsub,
  UI_EVENTS,
  WEBSOCKET_EVENTS,
  WEBCAM_EVENTS,
  APP_STATUS_EVENTS,
  type GestureConfig,
  type PoseConfig,
} from '#shared/index.js';

import type { AllDOMElements } from '#frontend/core/dom-elements.js';
import type { App } from '#frontend/core/app.js';
import type { DocsModalManager } from './ui-docs-modal-manager.js';
import type { ConfirmationModalManager } from './ui-confirmation-modal-manager.js';
import type { CameraService } from '#frontend/services/camera.service.js';
import { setIcon } from './helpers/index.js';

/**
 * Main UI orchestrator, responsible for initializing all UI managers and components.
 */
export class UIController {
  _elements: Partial<AllDOMElements>;
  _renderer: UIRenderer;
  sidebarManager: SidebarManager;
  modalManager: ModalManager;
  layoutManager: LayoutManager;
  _gestureConfigForm: GestureConfigForm;
  _globalSettingsForm: GlobalSettingsModalManager;
  _themeManager: ThemeManager;
  _languageManager: LanguageManager;
  _headerTogglesController: HeaderTogglesController;
  pluginUIService: PluginUIService;
  _videoOverlayControlsManager: VideoOverlayControlsManager;
  _notificationManager: NotificationManager;
  _docsModalMgr?: DocsModalManager;
  _confirmationModalMgr?: ConfirmationModalManager;

  appStore: App['appStore'];
  appStatusManager: App['appStatusManager'];
  translationService: App['translationService'];
  cameraManager: CameraManager;
  cameraService: CameraService;
  gesture: App['gesture'];
  _gestureConfigManager: GestureConfigManager;

  public updateButtonState: () => void;
  public updateWsStatusIndicator: (
    isInitial?: boolean,
    isConnecting?: boolean
  ) => void;

  _editingConfigIndex: number | null = null;
  _originalNameBeingEdited: string | null = null;
  _editingRtspSourceIndex: number | null = null;

  constructor(appRef: App) {
    this._elements = appRef.elements;
    this.appStore = appRef.appStore;
    this.appStatusManager = appRef.appStatusManager;
    this.translationService = appRef.translationService;
    this.gesture = appRef.gesture;
    this.cameraManager = appRef.cameraManager;
    this.cameraService = appRef.cameraService;

    this.pluginUIService = new PluginUIService(
      this.appStore,
      this.translationService,
    );
    this._renderer = new UIRenderer(this);
    this._notificationManager = new NotificationManager(this);

    const elementGroups = getElementGroupingGetters(this._elements);
    this._renderer.updateElements(elementGroups.rendererElements);
    this.sidebarManager = new SidebarManager(elementGroups.panelElements, this);
    this.modalManager = new ModalManager(elementGroups.panelElements, this);
    this.layoutManager = new LayoutManager(elementGroups.panelElements, this);
    this._languageManager = new LanguageManager(
      elementGroups.languageManagerElements,
      this.appStore
    );
    this._themeManager = new ThemeManager(this.appStore);
    this._headerTogglesController = new HeaderTogglesController(
      elementGroups.headerToggles,
      this.appStore,
      this
    );
    this._videoOverlayControlsManager = new VideoOverlayControlsManager(this);

    this._gestureConfigManager = new GestureConfigManager(this.appStore, this);
    this._gestureConfigForm = new GestureConfigForm(this);
    this._globalSettingsForm = new GlobalSettingsModalManager(
      elementGroups.globalSettingsForm,
      this,
      this.modalManager
    );

    this.updateWsStatusIndicator = updateWsStatusIndicator.bind(this);
    this.updateButtonState = () => {
      updateButtonState.call(this);
      this.layoutManager?.applyVideoSizePreference();
    };
    
    this.#initializeCoreSubscriptions();
  }

  public async initialize(): Promise<void> {
    this.pluginUIService.setUIController(this);
  
    const { ConfirmationModalManager } = await import(
      './ui-confirmation-modal-manager.js'
    );
    this._confirmationModalMgr = new ConfirmationModalManager(this);
    await this.getDocsModalManager();
    await this.cameraManager.initialize();

    this._renderer.initializePubSubEventListeners();
    this.updateWsStatusIndicator(true);
    this.applyTranslations();
    this.updateButtonState();
    this.layoutManager?.applyAllVisibilities(false);
  }

  #initializeCoreSubscriptions = (): void => {
    this.appStore.subscribe((state, prevState) => {
      if (state.languagePreference !== prevState.languagePreference)
        this.applyTranslations();
      if (state.isWsConnected !== prevState.isWsConnected)
        this.updateWsStatusIndicator();
      this.updateButtonState();
      if (state.historyEntries !== prevState.historyEntries)
        this._renderer?.renderHistoryList(state.historyEntries);
    });
    [
      APP_STATUS_EVENTS.WEBCAM_STATE_CHANGED,
      APP_STATUS_EVENTS.MODEL_STATE_CHANGED,
      APP_STATUS_EVENTS.STREAM_CONNECTING_STATE_CHANGED,
      UI_EVENTS.REQUEST_SELECTED_CAMERA_DISPLAY_UPDATE,
    ].forEach((e) => pubsub.subscribe(e, this.updateButtonState));
    pubsub.subscribe(WEBSOCKET_EVENTS.CONNECTING, () =>
      this.updateWsStatusIndicator(false, true)
    );
    pubsub.subscribe(WEBCAM_EVENTS.STREAM_START, () => {
      this.appStatusManager?.setIsStreamConnecting(false);
      this.updateButtonState();
      this._videoOverlayControlsManager?.setOverlayState('STREAM_ACTIVE');
    });
    pubsub.subscribe(WEBCAM_EVENTS.STREAM_CONNECTION_CANCELLED, () => {
      this.appStatusManager?.setIsStreamConnecting(false);
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
    pubsub.subscribe(UI_EVENTS.REQUEST_EDIT_CONFIG, (gestureName?: unknown) => {
      const index = this.getGestureConfigsSnapshot().findIndex(
        (c) =>
          ('gesture' in c ? c.gesture : c.pose) === (gestureName as string)
      );
      if (index > -1) {
        this.sidebarManager?.toggleConfigSidebar(true);
        this._gestureConfigForm?.startEdit(index);
      }
    });

    this._elements.cameraList?.addEventListener('click', (event) => {
      const button = (
        event.target as HTMLElement
      ).closest<HTMLButtonElement>('button[data-device-id]');
      if (button) {
        const deviceId = button.dataset.deviceId;
        this.modalManager.closeCameraSelectModal();
        pubsub.publish(UI_EVENTS.CAMERA_LIST_ITEM_CLICKED, deviceId);
      }
    });

    this._elements.configListContainer?.addEventListener('click', (event) => {
      const card = (event.target as HTMLElement).closest<HTMLElement>('.card-item');
      if (!card) return;

      const deleteBtn = (event.target as HTMLElement).closest('.delete-btn');
      const gestureName = card.dataset.gestureName;

      if (deleteBtn && gestureName) {
        event.stopPropagation();
        this.#handleDeleteGestureConfig(gestureName);
        return;
      }

      if (gestureName && !card.closest('.card-item-actions')) {
        if (this.getOriginalNameBeingEdited() === gestureName) {
          this._gestureConfigForm?.cancelEditMode();
        } else {
          const index = this.getGestureConfigsSnapshot().findIndex(c => ('gesture' in c ? c.gesture : c.pose) === gestureName);
          if (index > -1) {
            this.sidebarManager?.toggleConfigSidebar(true);
            this._gestureConfigForm?.startEdit(index);
          }
        }
      }
    });
    
    // Set icons for static close buttons
    setIcon(this._elements.mainSettingsCloseButton, 'UI_CLOSE');
    setIcon(this._elements.docsCloseButton, 'UI_CLOSE');
    setIcon(this._elements.cameraSelectCloseButton, 'UI_CLOSE');
    setIcon(this._elements.configSidebarHeaderCloseBtn, 'UI_CLOSE');
    setIcon(this._elements.historySidebarHeaderCloseBtn, 'UI_CLOSE');
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
          this._gestureConfigForm?.cancelEditMode(false);
        }
      },
    });
  };

  #renderContributions = (): void => {
    if (!this.pluginUIService) return;
  
    const desktopSlot = document.getElementById('header-plugin-contribution-slot-desktop');
    const mobileSlot = document.getElementById('header-plugin-contribution-slot-mobile');
  
    if (desktopSlot) desktopSlot.innerHTML = '';
    if (mobileSlot) mobileSlot.innerHTML = '';
  
    const contributions = this.pluginUIService.getContributionsForSlot('header-controls');
    
    contributions.forEach(element => {
      if (desktopSlot) {
        desktopSlot.appendChild(element);
      }
      if (mobileSlot) {
        mobileSlot.appendChild(element.cloneNode(true));
      }
    });
  };

  public applyTranslations = (): void => {
    applyUITranslations(this);
    this.sidebarManager.applyTranslations();
    this._globalSettingsForm.applyTranslations();
    this._headerTogglesController.applyTranslations();
    this._videoOverlayControlsManager.applyTranslations();
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
    if (this._gestureConfigManager) {
      await this.appStore
        .getState()
        .actions.requestBackendPatch({ gestureConfigs: c });
    }
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