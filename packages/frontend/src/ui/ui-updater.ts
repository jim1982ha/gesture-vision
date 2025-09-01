/* FILE: packages/frontend/src/ui/ui-updater.ts */
import { type GestureCategoryIconType, translate } from '#shared/index.js';
import { setIcon } from '#frontend/ui/helpers/index.js';
import type { UIController } from '#frontend/ui/ui-controller-core.js';

export function updateWsStatusIndicator(
  this: UIController,
  isInitial = false,
  isConnecting = false
): void {
  const t = document.getElementById("wsStatusIndicator");
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