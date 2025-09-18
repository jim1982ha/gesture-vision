/* FILE: packages/frontend/src/ui/ui-event-coordinator.ts */
import {
  pubsub,
  UI_EVENTS,
  WEBSOCKET_EVENTS,
  WEBCAM_EVENTS,
} from '#shared/index.js';
import type { UIController } from './ui-controller-core.js';
import { setIcon } from './helpers/index.js';
import type { GestureCategoryIconType } from '#shared/index.js';

/**
 * Handles application-level Pub/Sub events and coordinates the UI's response.
 */
export class UIEventCoordinator {
    #uiControllerRef: UIController;
    #unsubscribeStore: () => void;

    constructor(uiController: UIController) {
        this.#uiControllerRef = uiController;
        this.#unsubscribeStore = this.#initializeCoreSubscriptions();
    }

    public destroy(): void {
        this.#unsubscribeStore();
    }

    #initializeCoreSubscriptions = (): (() => void) => {
        const subscriptions = [
            pubsub.subscribe(UI_EVENTS.REQUEST_SELECTED_CAMERA_DISPLAY_UPDATE, this.#uiControllerRef.updateButtonState),
            pubsub.subscribe(WEBSOCKET_EVENTS.CONNECTING, () => this.#updateWsStatusIndicator(false, true)),
            pubsub.subscribe(WEBSOCKET_EVENTS.CONNECTED, () => this.#updateWsStatusIndicator(false, false)),
            pubsub.subscribe(WEBSOCKET_EVENTS.DISCONNECTED, () => this.#updateWsStatusIndicator(false, false)),
            pubsub.subscribe(WEBCAM_EVENTS.STREAM_START, this.#handleStreamStart),
            pubsub.subscribe(WEBCAM_EVENTS.STREAM_CONNECTION_CANCELLED, this.#handleStreamStop),
            pubsub.subscribe(UI_EVENTS.RECEIVE_UI_CONTRIBUTION, this.#renderContributions),
            pubsub.subscribe(UI_EVENTS.PLUGINS_MANIFESTS_PROCESSED, () => this.#uiControllerRef._renderer?.renderConfigList())
        ];

        return () => subscriptions.forEach(unsub => unsub());
    };

    #handleStreamStart = (): void => {
        this.#uiControllerRef.appStore.getState().actions.setIsStreamConnecting(false);
        this.#uiControllerRef.updateButtonState();
        this.#uiControllerRef._videoOverlayControlsManager?.setOverlayState('STREAM_ACTIVE');
    }

    #handleStreamStop = (): void => {
        this.#uiControllerRef.appStore.getState().actions.setIsStreamConnecting(false);
        this.#uiControllerRef.updateButtonState();
        this.#uiControllerRef._videoOverlayControlsManager?.setOverlayState('OFFLINE_IDLE');
    }

    #updateWsStatusIndicator = (isInitial = false, isConnecting = false): void => {
        const t = document.getElementById("wsStatusIndicator");
        if (!t) return;
        const translate = this.#uiControllerRef.translationService.translate;
        const isConnected = this.#uiControllerRef.appStore.getState().isWsConnected;
      
        t.innerHTML = '';
        t.classList.remove('connected', 'disconnected', 'connecting');
        t.classList.add('clickable');
        t.style.cursor = 'pointer';
        let statusText = '', titleKey = '';
      
        if (isConnecting) {
          t.classList.add('connecting'); titleKey = 'wsConnecting'; statusText = 'CONNECTING';
          setIcon(t, 'UI_WS_CONNECTING');
        } else if (isConnected) {
          t.classList.add('connected'); titleKey = 'wsConnected'; statusText = 'CONNECTED';
          const img = document.createElement('img');
          img.src = '/icons/favicon.svg';
          img.alt = 'Connected';
          img.style.width = 'var(--icon-size-status)';
          img.style.height = 'var(--icon-size-status)';
          t.appendChild(img);
          if (!isInitial) this.#uiControllerRef._notificationManager?.showNotification(translate('wsConnectedShort'), 'success', 2000);
        } else {
          t.classList.add('disconnected'); titleKey = 'wsDisconnected'; statusText = 'DISCONNECTED';
          setIcon(t, 'UI_WS_DISCONNECTED');
          if (!isInitial && !isConnecting) this.#uiControllerRef._notificationManager?.showNotification(translate('wsDisconnectedShort'), 'warning', 3000);
        }
        
        t.title = translate(titleKey, { defaultValue: `WebSocket ${statusText}` });
    }

    #renderContributions = (): void => {
        const pluginUIService = this.#uiControllerRef.pluginUIService;
        if (!pluginUIService) return;
      
        const slots = ['header-plugin-contribution-slot', 'custom-gestures-actions-slot'];
      
        slots.forEach(slotId => {
          const slotElement = document.getElementById(slotId);
          if (slotElement) {
            slotElement.innerHTML = '';
            const contributions = pluginUIService.getContributionsForSlot(slotId);
            contributions.forEach(element => slotElement.appendChild(element));
          }
        });
    };
}