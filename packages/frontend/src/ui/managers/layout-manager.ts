/* FILE: packages/frontend/src/ui/managers/layout-manager.ts */
import { setElementVisibility } from '#frontend/ui/helpers/index.js';
import { secureStorage } from '#shared/services/security-utils.js';
import { pubsub } from '#shared/core/pubsub.js';
import { UI_EVENTS } from '#shared/constants/index.js';
import { translate } from '#shared/services/translations.js';
import { setIcon } from '#frontend/ui/helpers/index.js';
import type { UIController } from '#frontend/ui/ui-controller-core.js';

export interface LayoutManagerElements {
  toggleVideoButton?: HTMLElement | null;
  toggleConfigListButton?: HTMLElement | null;
  videoContainer?: HTMLElement | null;
  configListContainer?: HTMLElement | null;
  videoSizeToggleButton?: HTMLElement | null;
  desktopConfigListTitle?: HTMLElement | null;
}

const VIDEO_VISIBILITY_KEY = 'videoVisibilityPreference';
const CONFIG_LIST_VISIBILITY_KEY = 'configListVisibilityPreference';
const VIDEO_SIZE_CONSTRAINED_KEY = 'videoSizeConstrainedPreference';

export class LayoutManager {
  #elements: Partial<LayoutManagerElements>;
  #uiControllerRef: UIController;

  _isVideoVisible = true;
  _isConfigListVisible = true;
  _isVideoFullscreen = false;
  public isVideoSizeConstrained = true;

  constructor(
    elements: Partial<LayoutManagerElements>,
    uiController: UIController
  ) {
    this.#elements = elements;
    this.#uiControllerRef = uiController;
    this.#initialize();
  }

  #initialize(): void {
    this.#loadVisibilityPreferences();
    this.applyAllVisibilities(false);
    this.#attachEventListeners();
  }

  #attachEventListeners(): void {
    this.#elements.toggleVideoButton?.addEventListener('click', this.toggleVideoVisibility.bind(this));
    this.#elements.toggleConfigListButton?.addEventListener('click', this.toggleConfigListVisibility.bind(this));
    this.#elements.videoSizeToggleButton?.addEventListener('click', this.toggleVideoSize.bind(this));
    window.addEventListener('storage', this.#handleStorageChange);
  }

  #handleStorageChange = (event: StorageEvent): void => {
    if (event.key === VIDEO_SIZE_CONSTRAINED_KEY) {
      this.#loadVisibilityPreferences();
      this.applyVideoSizePreference();
    }
  };

  #loadVisibilityPreferences(): void {
    this._isVideoVisible =
      (secureStorage.get(VIDEO_VISIBILITY_KEY) as boolean | null) ?? true;
    this._isConfigListVisible =
      (secureStorage.get(CONFIG_LIST_VISIBILITY_KEY) as boolean | null) ?? true;
    const storedValue = secureStorage.get(
      VIDEO_SIZE_CONSTRAINED_KEY
    ) as boolean | null;
    this.isVideoSizeConstrained = storedValue ?? true;
  }

  public applyAllVisibilities(save = true): void {
    this.applyVideoVisibility(save);
    this.applyConfigListVisibility(save);
    this.applyVideoSizePreference();
  }

  public applyVideoVisibility(save = true): void {
    const c = document.querySelector('.main-content'),
      t = this.#elements.toggleVideoButton as HTMLButtonElement;
    if (!c || !t) return;
    c.classList.toggle('video-hidden', !this._isVideoVisible);
    setIcon(t, this._isVideoVisible ? 'UI_VISIBILITY_OFF' : 'UI_VISIBILITY_ON');
    const k = this._isVideoVisible ? 'hideVideo' : 'showVideo',
      l = translate(k);
    t.title = l;
    t.setAttribute('aria-label', l);
    if (save) secureStorage.set(VIDEO_VISIBILITY_KEY, this._isVideoVisible);
    pubsub.publish(UI_EVENTS.VIDEO_VISIBILITY_CHANGED, {
      isVisible: this._isVideoVisible,
    });
  }

  public toggleVideoVisibility(): void {
    this._isVideoVisible = !this._isVideoVisible;
    this.applyVideoVisibility();
  }

  public applyConfigListVisibility(save = true): void {
    const c = this.#elements.configListContainer,
      t = this.#elements.toggleConfigListButton as HTMLButtonElement;
    if (!c || !t) return;
    setElementVisibility(c, this._isConfigListVisible, 'flex');
    setIcon(t, this._isConfigListVisible ? 'UI_VISIBILITY_OFF' : 'UI_VISIBILITY_ON');
    const k = this._isConfigListVisible ? 'hideConfigList' : 'showConfigList',
      l = translate(k);
    t.title = l;
    t.setAttribute('aria-label', l);
    if (save)
      secureStorage.set(CONFIG_LIST_VISIBILITY_KEY, this._isConfigListVisible);
  }

  public toggleConfigListVisibility(): void {
    this._isConfigListVisible = !this._isConfigListVisible;
    this.applyConfigListVisibility();
  }

  public applyVideoSizePreference(): void {
    const c = this.#elements.videoContainer,
      t = this.#elements.videoSizeToggleButton as HTMLButtonElement;
    if (!c || !t) return;
    const isFull = this.#uiControllerRef.sidebarManager?.isMobile
      ? this._isVideoFullscreen
      : !this.isVideoSizeConstrained;
    c.classList.toggle('size-constrained', !isFull);
    const titleKey = isFull
      ? this.#uiControllerRef.sidebarManager?.isMobile
        ? 'exitFullscreen'
        : 'constrainVideo'
      : this.#uiControllerRef.sidebarManager?.isMobile
      ? 'enterFullscreen'
      : 'expandVideo';
    const iconKey = isFull
      ? 'UI_VIDEO_FULLSCREEN_EXIT'
      : 'UI_VIDEO_FULLSCREEN';
    t.title = translate(titleKey);
    setIcon(t, iconKey);
  }

  public toggleVideoSize(): void {
    if (this.#uiControllerRef.sidebarManager?.isMobile) {
      this.toggleVideoFullscreen();
    } else {
      this.isVideoSizeConstrained = !this.isVideoSizeConstrained;
      secureStorage.set(VIDEO_SIZE_CONSTRAINED_KEY, this.isVideoSizeConstrained);
      this.applyVideoSizePreference();
    }
  }

  public toggleVideoFullscreen(): void {
    this._isVideoFullscreen = !this._isVideoFullscreen;
    document.body.classList.toggle(
      'video-fullscreen-active',
      this._isVideoFullscreen
    );
    this.applyVideoSizePreference();
    if (!this._isVideoFullscreen && this.#uiControllerRef._videoOverlayControlsManager) {
      this.#uiControllerRef._videoOverlayControlsManager.closeAllOverlayPanels();
    }
    this.applyOrientationLock();
  }

  public applyOrientationLock(): void {
    if (this.#uiControllerRef.sidebarManager?.isMobile) {
      if (this._isVideoFullscreen) this.#unlockOrientation();
      else this.#lockToPortrait();
    } else this.#unlockOrientation();
  }

  #lockToPortrait = async (): Promise<void> => {
    try {
      if (screen.orientation?.lock) await screen.orientation.lock('portrait-primary');
    } catch (_error) {
      /* Lock fails are expected */
    }
  };
  #unlockOrientation = (): void => {
    if (screen.orientation?.unlock) screen.orientation.unlock();
  };

  destroy(): void {
    window.removeEventListener('storage', this.#handleStorageChange);
  }
}