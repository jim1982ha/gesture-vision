/* FILE: packages/frontend/src/ui/managers/layout-manager.ts */
import { secureStorage } from "#shared/services/security-utils.js";
import { pubsub } from "#shared/core/pubsub.js";
import { UI_EVENTS, type GestureCategoryIconType } from "#shared/index.js";
import { setIcon } from "#frontend/ui/helpers/index.js";
import type { UIController } from "#frontend/ui/ui-controller-core.js";

const VIDEO_VISIBILITY_KEY = "videoVisibilityPreference";
const VIDEO_SIZE_CONSTRAINED_KEY = "videoSizeConstrainedPreference";

export class LayoutManager {
  #toggleVideoButton: HTMLElement | null;
  #videoContainer: HTMLElement | null;
  #videoSizeToggleButton: HTMLElement | null;

  #uiControllerRef: UIController;

  constructor(uiController: UIController) {
    this.#uiControllerRef = uiController;
    this.#toggleVideoButton = document.getElementById("toggleVideoButton");
    this.#videoContainer = document.querySelector(
      ".video-container"
    ) as HTMLElement | null;
    this.#videoSizeToggleButton = document.getElementById(
      "videoSizeToggleButton"
    );
    this.#initialize();
  }

  #initialize(): void {
    this.applyVideoVisibility();
    this.applyVideoSizePreference();
    this.#attachEventListeners();
  }

  #attachEventListeners(): void {
    this.#toggleVideoButton?.addEventListener(
      "click",
      this.toggleVideoVisibility.bind(this)
    );
  }

  public getIsVideoVisible = (): boolean => (secureStorage.get(VIDEO_VISIBILITY_KEY) as boolean | null) ?? true;

  public applyTranslations(): void {
    const translate = this.#uiControllerRef.translationService.translate;
    const liveFeedTitle = document.getElementById("liveFeedTitle")?.querySelector<HTMLElement>('[data-translate-text]');
    if (liveFeedTitle) liveFeedTitle.textContent = translate('liveFeedTitle');
    setIcon(document.getElementById("liveFeedTitle")?.querySelector('.config-title-icon'), 'UI_CAMERA_OUTLINE');

    const configListTitle = document.getElementById("desktopConfigListTitle")?.querySelector<HTMLElement>('[data-translate-text]');
    if (configListTitle) configListTitle.textContent = translate('configuredActionsTitle');
    setIcon(document.getElementById("desktopConfigListTitle")?.querySelector('.config-title-icon'), 'UI_LIST_CHECK');

    const addNewActionButtonLabel = document.getElementById("addNewActionButtonLabel");
    if (addNewActionButtonLabel) addNewActionButtonLabel.textContent = translate('addNewAction');
    setIcon(document.getElementById("addNewActionButton"), 'UI_ADD');

    this._updateVideoVisibilityUI();
    this._updateVideoSizePreferenceUI();
  }
  
  _updateVideoVisibilityUI(): void {
    const t = this.#toggleVideoButton as HTMLButtonElement;
    if (!t) return;
    const isVisible = this.getIsVideoVisible();
    setIcon(t, isVisible ? "UI_VISIBILITY_OFF" : "UI_VISIBILITY_ON");
    const k = isVisible ? "hideVideo" : "showVideo";
    const l = this.#uiControllerRef.translationService.translate(k);
    t.title = l;
    t.setAttribute("aria-label", l);
  }
  
  public applyVideoVisibility(): void {
    const isVisible = this.getIsVideoVisible();
    const c = document.querySelector(".main-content");
    if (c) c.classList.toggle("video-hidden", !isVisible);
    this._updateVideoVisibilityUI();
    pubsub.publish(UI_EVENTS.VIDEO_VISIBILITY_CHANGED, { isVisible });
  }

  public toggleVideoVisibility(): void {
    const newVisibility = !this.getIsVideoVisible();
    secureStorage.set(VIDEO_VISIBILITY_KEY, newVisibility);
    this.applyVideoVisibility();
  }

  _updateVideoSizePreferenceUI(): void {
    const button = this.#videoSizeToggleButton as HTMLButtonElement;
    if (!button) return;
    const translate = this.#uiControllerRef.translationService.translate;

    const isMobile = this.#uiControllerRef.sidebarManager?.isMobile;
    const isFullscreen = document.body.classList.contains("video-fullscreen-active");
    const isConstrained = (secureStorage.get(VIDEO_SIZE_CONSTRAINED_KEY) as boolean | null) ?? true;

    let titleKey: string;
    let iconKey: GestureCategoryIconType;

    if (isMobile) {
        titleKey = isFullscreen ? "exitFullscreen" : "enterFullscreen";
        iconKey = isFullscreen ? "UI_VIDEO_FULLSCREEN_EXIT" : "UI_VIDEO_FULLSCREEN";
    } else {
        titleKey = isConstrained ? "expandVideo" : "constrainVideo";
        iconKey = isConstrained ? "UI_VIDEO_FULLSCREEN" : "UI_VIDEO_FULLSCREEN_EXIT";
    }

    const titleText = translate(titleKey);
    button.title = titleText;
    button.setAttribute("aria-label", titleText);
    setIcon(button, iconKey);
  }

  public applyVideoSizePreference(): void {
    const container = this.#videoContainer;
    if (!container) return;
    const isMobile = this.#uiControllerRef.sidebarManager?.isMobile;
    const isFullscreen = document.body.classList.contains("video-fullscreen-active");
    const isConstrained = (secureStorage.get(VIDEO_SIZE_CONSTRAINED_KEY) as boolean | null) ?? true;
    
    const shouldBeExpanded = isMobile ? isFullscreen : !isConstrained;
    container.classList.toggle("size-constrained", !shouldBeExpanded);
    this._updateVideoSizePreferenceUI();
  }

  public setVideoSizeOverride(isConstrained: boolean): void {
    this.#videoContainer?.classList.toggle("size-constrained", isConstrained);
  }

  public toggleVideoFullscreen(): void {
    const shouldBeFullscreen = !document.body.classList.contains(
      "video-fullscreen-active"
    );
    document.body.classList.toggle(
      "video-fullscreen-active",
      shouldBeFullscreen
    );
    this.applyVideoSizePreference();
    if (
      !shouldBeFullscreen &&
      this.#uiControllerRef._videoOverlayControlsManager
    ) {
      this.#uiControllerRef._videoOverlayControlsManager.closeAllOverlayPanels();
    }
    this.applyOrientationLock();
  }

  public applyOrientationLock(): void {
    if (this.#uiControllerRef.sidebarManager?.isMobile) {
      const isFullscreen = document.body.classList.contains(
        "video-fullscreen-active"
      );
      if (isFullscreen) this.#unlockOrientation();
      else this.#lockToPortrait();
    } else this.#unlockOrientation();
  }

  #lockToPortrait = async (): Promise<void> => {
    try {
      if (screen.orientation?.lock)
        await screen.orientation.lock("portrait-primary");
    } catch (_error) {
      /* Lock fails are expected */
    }
  };
  #unlockOrientation = (): void => {
    if (screen.orientation?.unlock) screen.orientation.unlock();
  };

  destroy(): void {
    // No-op
  }
}