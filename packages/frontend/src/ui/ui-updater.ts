/* FILE: packages/frontend/src/ui/ui-updater.ts */
import { type GestureCategoryIconType, translate } from '#shared/index.js';
import { setIcon } from '#frontend/ui/helpers/index.js';
import {
  updateTranslationsForComponent,
  type TranslationConfigItem,
  type MultiTranslationConfigItem,
} from '#frontend/ui/ui-translation-updater.js';
import type { UIController } from '#frontend/ui/ui-controller-core.js';

export function updateWsStatusIndicator(
  this: UIController,
  isInitial = false,
  isConnecting = false
): void {
  const t = this._elements.wsStatusIndicator as HTMLElement | null;
  if (!t) return;

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

export function updateButtonState(this: UIController): void {
  this._headerTogglesController?.updateAllButtonStates();
}

export function applyUITranslations(controllerInstance: UIController): void {
  if (!controllerInstance || !controllerInstance._elements) {
    return;
  }
  const elements = controllerInstance._elements;
  document.title = translate('appName');

  const itemsToTranslate: Array<
    TranslationConfigItem | MultiTranslationConfigItem
  > = [
    { element: elements.appTitle as HTMLElement | null, config: 'appName' },
    {
      element: elements.desktopConfigListTitle?.querySelector<HTMLElement>(
        '[data-translate-text]'
      ),
      config: 'configuredActionsTitle',
    },
    {
      element: elements.liveFeedTitle?.querySelector<HTMLElement>(
        '[data-translate-text]'
      ),
      config: 'liveFeedTitle',
    },
    {
      element: elements.bottomNavGesturesLabel as HTMLElement | null,
      config: 'gestures',
    },
    {
      element: elements.bottomNavHistoryLabel as HTMLElement | null,
      config: 'history',
    },
    {
      element: elements.mainSettingsToggle as HTMLButtonElement | null,
      configs: [
        { key: 'settings', attribute: 'title' },
        { key: 'settings', attribute: 'aria-label' },
      ],
    },
    {
      element: elements.gestureConfigToggleMobile as HTMLButtonElement | null,
      configs: [
        { key: 'gestures', attribute: 'title' },
        { key: 'gestures', attribute: 'aria-label' },
      ],
    },
    {
      element: elements.historyToggleMobile as HTMLButtonElement | null,
      configs: [
        { key: 'history', attribute: 'title' },
        { key: 'history', attribute: 'aria-label' },
      ],
    },
    {
      element: elements.configSidebarToggleBtn as HTMLButtonElement | null,
      configs: [
        { key: 'gestures', attribute: 'title' },
        { key: 'gestures', attribute: 'aria-label' },
      ],
    },
    {
      element: elements.historySidebarToggleBtn as HTMLButtonElement | null,
      configs: [
        { key: 'history', attribute: 'title' },
        { key: 'history', attribute: 'aria-label' },
      ],
    },
    {
      element: elements.mobileVideoStopButton as HTMLButtonElement | null,
      configs: [
        { key: 'stop', attribute: 'title' },
        { key: 'stop', attribute: 'aria-label' },
      ],
    },
    {
      element: elements.cameraModalTitleText as HTMLElement | null,
      config: 'selectCameraSource',
    },
  ];

  updateTranslationsForComponent(itemsToTranslate);

  setIcon(
    elements.mainSettingsToggle as HTMLButtonElement | null,
    'UI_SETTINGS'
  );
  setIcon(
    elements.liveFeedTitle?.querySelector('.config-title-icon'),
    'UI_CAMERA_OUTLINE'
  );
  setIcon(
    elements.desktopConfigListTitle?.querySelector('.config-title-icon'),
    'UI_LIST_CHECK'
  );
  setIcon(
    elements.cameraModalHeader?.querySelector('.header-icon'),
    'UI_WEBCAM'
  );

  const videoSizeToggleButton =
    elements.videoSizeToggleButton as HTMLButtonElement | null;
  if (videoSizeToggleButton) {
    const isFullscreen = document.body.classList.contains(
      'video-fullscreen-active'
    );
    const isConstrained =
      (controllerInstance.layoutManager?.isVideoSizeConstrained ?? false) &&
      !controllerInstance.sidebarManager?.isMobile;
    let titleKey = 'constrainVideo';
    let iconKey: GestureCategoryIconType = 'UI_VIDEO_FULLSCREEN_EXIT';
    if (controllerInstance.sidebarManager?.isMobile) {
      titleKey = isFullscreen ? 'exitFullscreen' : 'enterFullscreen';
      iconKey = isFullscreen
        ? 'UI_VIDEO_FULLSCREEN_EXIT'
        : 'UI_VIDEO_FULLSCREEN';
    } else {
      titleKey = isConstrained ? 'expandVideo' : 'constrainVideo';
      iconKey = isConstrained
        ? 'UI_VIDEO_FULLSCREEN'
        : 'UI_VIDEO_FULLSCREEN_EXIT';
    }
    videoSizeToggleButton.title = translate(titleKey);
    videoSizeToggleButton.setAttribute('aria-label', translate(titleKey));
    setIcon(videoSizeToggleButton, iconKey);
  }
}