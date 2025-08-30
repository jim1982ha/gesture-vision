/* FILE: packages/frontend/src/ui/managers/sidebar-manager.ts */
import { SIDEBAR_AUTO_HIDE_DELAY_MS } from '#frontend/constants/app-defaults.js';
import { setIcon, toggleElementClass } from '#frontend/ui/helpers/index.js';
import type { UIController } from '#frontend/ui/ui-controller-core.js';
import { translate } from '#shared/index.js';

export interface SidebarManagerElements {
  configSidebar: HTMLElement | null;
  historySidebar: HTMLElement | null;
  sidebarBackdrop: HTMLElement | null;
  gestureConfigToggleMobile: HTMLButtonElement | null;
  historyToggleMobile: HTMLButtonElement | null;
  configSidebarToggleBtn: HTMLButtonElement | null;
  historySidebarToggleBtn: HTMLButtonElement | null;
  configSidebarHeaderCloseBtn: HTMLButtonElement | null;
  historySidebarHeaderCloseBtn: HTMLButtonElement | null;
  clearHistoryButton?: HTMLButtonElement | null;
}

export class SidebarManager {
  #elements: Partial<SidebarManagerElements>;
  #uiControllerRef: UIController;
  #isConfigSidebarOpen = false;
  #isHistorySidebarOpen = false;
  #autoHideTimeouts = new Map<'config' | 'history', number>();

  public isMobile = false;

  constructor(elements: Partial<SidebarManagerElements>, uiController: UIController) {
    this.#elements = elements;
    this.#uiControllerRef = uiController;
    this.#initialize();
  }

  #initialize(): void {
    this.updateViewportState();
    this.#attachEventListeners();
    this.applyTranslations();
    this.#setInitialDesktopState();
  }

  #attachEventListeners(): void {
    window.addEventListener('resize', this.updateViewportState.bind(this));
    this.#elements.gestureConfigToggleMobile?.addEventListener('click', () =>
      this.toggleConfigSidebar()
    );
    this.#elements.historyToggleMobile?.addEventListener('click', () =>
      this.toggleHistorySidebar()
    );
    this.#elements.sidebarBackdrop?.addEventListener('click', () =>
      this.closeAllSidebars()
    );
    this.#elements.configSidebarToggleBtn?.addEventListener('click', () =>
      this.toggleConfigSidebar()
    );
    this.#elements.historySidebarToggleBtn?.addEventListener('click', () =>
      this.toggleHistorySidebar()
    );
    this.#elements.configSidebarHeaderCloseBtn?.addEventListener('click', () =>
      this.closeConfigSidebar()
    );
    this.#elements.historySidebarHeaderCloseBtn?.addEventListener('click', () =>
      this.closeHistorySidebar()
    );

    this.#elements.configSidebar?.addEventListener('mouseenter', () =>
      this.#clearAutoHideTimeout('config')
    );
    this.#elements.historySidebar?.addEventListener('mouseenter', () =>
      this.#clearAutoHideTimeout('history')
    );

    this.#elements.configSidebar?.addEventListener('mouseleave', () =>
      this.#startAutoHideTimeout('config')
    );
    this.#elements.historySidebar?.addEventListener('mouseleave', () =>
      this.#startAutoHideTimeout('history')
    );

    this.#elements.configSidebarToggleBtn?.addEventListener('mouseenter', () =>
      this.#clearAutoHideTimeout('config')
    );
    this.#elements.historySidebarToggleBtn?.addEventListener('mouseenter', () =>
      this.#clearAutoHideTimeout('history')
    );
  }
  
  public applyTranslations(): void {
    const configHeader = this.#elements.configSidebar?.querySelector('.sidebar-header');
    if (configHeader) {
        (configHeader.querySelector('.header-title') as HTMLElement).textContent = translate('gestureSettings');
        setIcon(configHeader.querySelector('.header-icon'), 'UI_TUNE');
    }

    const historyHeader = this.#elements.historySidebar?.querySelector('.sidebar-header');
    if (historyHeader) {
        (historyHeader.querySelector('.header-title') as HTMLElement).textContent = translate('history');
        setIcon(historyHeader.querySelector('.header-icon'), 'UI_HISTORY');
    }

    setIcon(this.#elements.gestureConfigToggleMobile, 'UI_TUNE');
    setIcon(this.#elements.historyToggleMobile, 'UI_HISTORY');
    setIcon(this.#elements.clearHistoryButton, 'UI_DELETE');
    setIcon(this.#elements.configSidebarToggleBtn, this.#isConfigSidebarOpen ? 'UI_CHEVRON_LEFT' : 'UI_CHEVRON_RIGHT');
    setIcon(this.#elements.historySidebarToggleBtn, this.#isHistorySidebarOpen ? 'UI_CHEVRON_RIGHT' : 'UI_CHEVRON_LEFT');

    this.#elements.clearHistoryButton?.setAttribute('title', translate('clearHistory'));
  }

  public updateViewportState(): void {
    this.isMobile =
      window.matchMedia('(max-width: 768px)').matches ||
      window.matchMedia('(any-pointer: coarse)').matches;
    this.#uiControllerRef.layoutManager?.applyOrientationLock();
    this.#setInitialDesktopState();
  }

  #setInitialDesktopState = (): void => {
    if (!this.isMobile) {
      this.#isConfigSidebarOpen = false;
      this.#isHistorySidebarOpen = false;
      this.#toggleSidebarUI('config', false);
      this.#toggleSidebarUI('history', false);
    }
  };

  #startAutoHideTimeout(type: 'config' | 'history'): void {
    if (this.isMobile) return;
    this.#clearAutoHideTimeout(type);
    const shouldStart =
      type === 'config' ? this.#isConfigSidebarOpen : this.#isHistorySidebarOpen;
    if (shouldStart) {
      const timeoutId = window.setTimeout(() => {
        if (type === 'config') this.closeConfigSidebar(true);
        else this.closeHistorySidebar(true);
      }, SIDEBAR_AUTO_HIDE_DELAY_MS);
      this.#autoHideTimeouts.set(type, timeoutId);
    }
  }

  #clearAutoHideTimeout(type: 'config' | 'history'): void {
    if (this.#autoHideTimeouts.has(type)) {
      clearTimeout(this.#autoHideTimeouts.get(type)!);
      this.#autoHideTimeouts.delete(type);
    }
  }

  public updateBackdrop(): void {
    const shouldBeVisible = this.#isConfigSidebarOpen || this.#isHistorySidebarOpen;
    if (this.#elements.sidebarBackdrop) {
      toggleElementClass(this.#elements.sidebarBackdrop, 'visible', shouldBeVisible);
      this.#elements.sidebarBackdrop.style.pointerEvents =
        this.isMobile && shouldBeVisible ? 'auto' : 'none';
    }
  }

  #toggleSidebarUI(type: 'config' | 'history', shouldBeOpen: boolean): void {
    document.body.classList.toggle(`${type}-sidebar-active`, shouldBeOpen);
    const toggleButton =
      type === 'config'
        ? this.#elements.configSidebarToggleBtn
        : this.#elements.historySidebarToggleBtn;
    if (toggleButton) {
      toggleButton.setAttribute('aria-expanded', String(shouldBeOpen));
      const iconKey = shouldBeOpen
        ? type === 'config'
          ? 'UI_CHEVRON_LEFT'
          : 'UI_CHEVRON_RIGHT'
        : type === 'config'
        ? 'UI_CHEVRON_RIGHT'
        : 'UI_CHEVRON_LEFT';
      setIcon(toggleButton, iconKey);
    }
  }

  #toggleSidebar(type: 'config' | 'history', force?: boolean): void {
    const isCurrentlyOpen =
      type === 'config' ? this.#isConfigSidebarOpen : this.#isHistorySidebarOpen;
    const shouldBeOpen = force !== undefined ? force : !isCurrentlyOpen;

    if (isCurrentlyOpen === shouldBeOpen && force === undefined) return;

    if (shouldBeOpen) {
      if (this.isMobile) {
        this.closeAllSidebars();
      } else {
        if (type === 'config') this.closeHistorySidebar(false);
        if (type === 'history') this.closeConfigSidebar(false);
      }
    }

    if (type === 'config') this.#isConfigSidebarOpen = shouldBeOpen;
    else this.#isHistorySidebarOpen = shouldBeOpen;

    this.#toggleSidebarUI(type, shouldBeOpen);

    if (!this.isMobile) {
      if (shouldBeOpen) {
        // Timer is now only started on mouseleave events
      } else {
        this.#clearAutoHideTimeout(type);
      }
    }

    this.updateBackdrop();
  }

  public toggleConfigSidebar(force?: boolean): void {
    this.#toggleSidebar('config', force);
  }
  public toggleHistorySidebar(force?: boolean): void {
    this.#toggleSidebar('history', force);
  }
  public closeConfigSidebar(manageBackdrop = true): void {
    if (this.#isConfigSidebarOpen) {
      if (this.#uiControllerRef.getEditingConfigIndex() !== null)
        this.#uiControllerRef._gestureConfigForm?.cancelEditMode(false);
      this.toggleConfigSidebar(false);
      if (manageBackdrop) this.updateBackdrop();
    }
  }
  public closeHistorySidebar(manageBackdrop = true): void {
    if (this.#isHistorySidebarOpen) {
      this.toggleHistorySidebar(false);
      if (manageBackdrop) this.updateBackdrop();
    }
  }
  public closeAllSidebars(): void {
    this.closeConfigSidebar(false);
    this.closeHistorySidebar(false);
    this.updateBackdrop();
  }
}