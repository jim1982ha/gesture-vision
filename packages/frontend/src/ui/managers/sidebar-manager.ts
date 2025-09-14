/* FILE: packages/frontend/src/ui/managers/sidebar-manager.ts */
import { setIcon, toggleElementClass } from '#frontend/ui/helpers/index.js';
import type { UIController } from '#frontend/ui/ui-controller-core.js';

export class SidebarManager {
  #historySidebar: HTMLElement | null;
  #sidebarBackdrop: HTMLElement | null;
  #headerHistoryToggle: HTMLButtonElement | null;
  #historySidebarHeaderCloseBtn: HTMLButtonElement | null;
  #clearHistoryButton: HTMLButtonElement | null;

  #uiControllerRef: UIController;
  public isMobile = false;

  #boundUpdateViewportState: () => void;
  #boundToggleHistorySidebar: () => void;
  #boundCloseAllSidebars: () => void;
  #boundCloseHistorySidebar: () => void;

  constructor(uiController: UIController) {
    this.#uiControllerRef = uiController;
    this.#historySidebar = document.getElementById("historySidebar");
    this.#sidebarBackdrop = document.getElementById("sidebarBackdrop");
    this.#headerHistoryToggle = document.getElementById("headerHistoryToggle") as HTMLButtonElement | null;
    this.#historySidebarHeaderCloseBtn = document.getElementById("historySidebarHeaderCloseBtn") as HTMLButtonElement | null;
    this.#clearHistoryButton = document.getElementById("clearHistoryButton") as HTMLButtonElement | null;

    this.#boundUpdateViewportState = this.updateViewportState.bind(this);
    this.#boundToggleHistorySidebar = () => this.toggleHistorySidebar();
    this.#boundCloseAllSidebars = this.closeAllSidebars.bind(this);
    this.#boundCloseHistorySidebar = this.closeHistorySidebar.bind(this);

    this.#initialize();
  }

  #initialize(): void {
    this.updateViewportState();
    this.#attachEventListeners();
    this.applyTranslations();
  }

  #attachEventListeners(): void {
    window.addEventListener('resize', this.#boundUpdateViewportState);
    this.#headerHistoryToggle?.addEventListener('click', this.#boundToggleHistorySidebar);
    this.#sidebarBackdrop?.addEventListener('click', this.#boundCloseAllSidebars);
    this.#historySidebarHeaderCloseBtn?.addEventListener('click', this.#boundCloseHistorySidebar);
  }

  public destroy(): void {
    window.removeEventListener('resize', this.#boundUpdateViewportState);
    this.#headerHistoryToggle?.removeEventListener('click', this.#boundToggleHistorySidebar);
    this.#sidebarBackdrop?.removeEventListener('click', this.#boundCloseAllSidebars);
    this.#historySidebarHeaderCloseBtn?.removeEventListener('click', this.#boundCloseHistorySidebar);
  }
  
  public applyTranslations(): void {
    const translate = this.#uiControllerRef.translationService.translate;
    const historyHeader = this.#historySidebar?.querySelector('.sidebar-header');
    if (historyHeader) {
        (historyHeader.querySelector('.header-title') as HTMLElement).textContent = translate('history');
        setIcon(historyHeader.querySelector('.header-icon'), 'UI_HISTORY');
    }

    setIcon(this.#headerHistoryToggle, 'UI_HISTORY');
    setIcon(this.#clearHistoryButton, 'UI_DELETE_FOREVER');
    setIcon(this.#historySidebarHeaderCloseBtn, 'UI_CLOSE');

    this.#clearHistoryButton?.setAttribute('title', translate('clearHistory'));
    this.#headerHistoryToggle?.setAttribute('title', translate('history'));
    this.#historySidebarHeaderCloseBtn?.setAttribute('title', translate('closeHistoryTooltip'));
  }

  public updateViewportState(): void {
    this.isMobile = window.matchMedia('(max-width: 1023px)').matches || window.matchMedia('(any-pointer: coarse)').matches;
    document.body.classList.toggle('is-desktop', !this.isMobile);
    document.body.classList.toggle('is-mobile', this.isMobile);
    this.#uiControllerRef.layoutManager?.applyOrientationLock();
  }
  
  #updateBackdrop(): void {
    const isAnySidebarOpen = document.body.classList.contains('history-sidebar-active');
    const shouldBeVisible = isAnySidebarOpen && this.isMobile;
    if (this.#sidebarBackdrop) {
        toggleElementClass(this.#sidebarBackdrop, 'visible', shouldBeVisible);
    }
  }

  #toggleSidebar(type: 'history', force?: boolean): void {
    const bodyClass = `${type}-sidebar-active`;
    const isCurrentlyOpen = document.body.classList.contains(bodyClass);
    const shouldBeOpen = force !== undefined ? force : !isCurrentlyOpen;

    if (isCurrentlyOpen === shouldBeOpen && force === undefined) return;
    
    document.body.classList.toggle(bodyClass, shouldBeOpen);
        
    this.#updateBackdrop();
  }

  public toggleHistorySidebar(force?: boolean): void { this.#toggleSidebar('history', force); }
  
  public closeHistorySidebar(): void {
    if (document.body.classList.contains('history-sidebar-active')) {
      this.toggleHistorySidebar(false);
    }
  }

  public isHistorySidebarOpen(): boolean {
      return document.body.classList.contains('history-sidebar-active');
  }

  public closeAllSidebars(): void {
    this.closeHistorySidebar();
  }
}