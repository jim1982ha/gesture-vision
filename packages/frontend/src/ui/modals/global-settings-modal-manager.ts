/* FILE: packages/frontend/src/ui/modals/global-settings-modal-manager.ts */
import type { AppStore } from '#frontend/core/state/app-store.js';
import { initializeTabs } from '#frontend/ui/components/tab-manager.js';
import type { UIController } from '#frontend/ui/ui-controller-core.js';
import { UI_EVENTS, pubsub } from '#shared/index.js';
import { setIcon } from '#frontend/ui/helpers/index.js';

import { type TabElements, BaseSettingsTab } from "../base-settings-tab.js"; 
import { CustomGesturesTab } from "../tabs/custom-gestures-tab.js";
import { GeneralSettingsTab } from "../tabs/general-settings-tab.js";
import { RtspSettingsTab } from "../tabs/rtsp-settings-tab.js";
import { ThemeSettingsTab } from "../tabs/theme-settings-tab.js";
import { PluginsTab } from "../tabs/plugins-tab.js"; 

import type { FullConfiguration } from '#shared/index.js';
import type { ModalManager } from "#frontend/ui/managers/modal-manager.js"; 

export class GlobalSettingsModalManager {
    _uiControllerRef: UIController;
    _modalManagerRef: ModalManager;
    _appStore: AppStore;
    _tabManagerApi: { activateTab: (tabKey: string, forceCallback?: boolean) => void, getCurrentTab: () => string | null } | null = null;
    _isApplyingTranslations = false;
    #tabs: Record<string, BaseSettingsTab<TabElements> > = {};
    #contentContainer: HTMLElement | null = null;
    #originalContentCache: Node[] = [];
    #unsubscribeStore: () => void;
    #unsubscribeLang: () => void;
    
    #mainSettingsModal: HTMLElement | null;
    #mainSettingsCloseButton: HTMLButtonElement | null;
    #settingsTabsDesktopNav: HTMLElement | null;
    #settingsTabsMobileSelect: HTMLSelectElement | null;
    #settingsModalTitle: HTMLElement | null;

    constructor(uiControllerRef: UIController, modalManagerRef: ModalManager) {
        this._uiControllerRef = uiControllerRef;
        this._modalManagerRef = modalManagerRef;
        this._appStore = this._uiControllerRef.appStore;

        this.#mainSettingsModal = document.getElementById("mainSettingsModal");
        this.#mainSettingsCloseButton = document.getElementById("mainSettingsCloseButton") as HTMLButtonElement | null;
        this.#settingsTabsDesktopNav = document.getElementById("settingsTabsDesktopNav");
        this.#settingsTabsMobileSelect = document.getElementById("settingsTabsMobileSelect") as HTMLSelectElement | null;
        this.#settingsModalTitle = document.getElementById("settingsModalTitle");
        
        const scrollableContent = this.#mainSettingsModal?.querySelector('.modal-scrollable-content');
        this.#contentContainer = document.getElementById("settingsTabContentContainer");
        if (this.#contentContainer && scrollableContent) {
            this.#contentContainer.appendChild(scrollableContent);
        }
        
        this.#tabs = {
            // FIX: Removed the third 'elementQueries' argument from all constructors
            general: new GeneralSettingsTab(this._appStore, this._uiControllerRef),
            plugins: new PluginsTab(this._appStore, this._uiControllerRef), 
            rtsp: new RtspSettingsTab(this._appStore, this._uiControllerRef),
            appearance: new ThemeSettingsTab(this._appStore, this._uiControllerRef),
            customGestures: new CustomGesturesTab(this._appStore, this._uiControllerRef)
        };
        
        this.#unsubscribeStore = this._appStore.subscribe((state) => {
            if (state.isInitialConfigLoaded && this.#mainSettingsModal?.classList.contains('visible')) {
                const activeTabKey = this._tabManagerApi?.getCurrentTab();
                if (activeTabKey) this._loadContentForTab(activeTabKey);
            }
        });

        this.#unsubscribeLang = this._appStore.subscribe((state, prevState) => {
            if (state.languagePreference !== prevState.languagePreference) {
                this.applyTranslations();
            }
        });

        this.#renderNavigation();
        this._initializeEventListeners();
        this._initializeTabManager();
    }
    
    destroy(): void {
        this.#unsubscribeStore();
        this.#unsubscribeLang();
    }

    _initializeEventListeners() {
        this.#mainSettingsCloseButton?.addEventListener('click', this._handleCloseClick);
        this.#settingsTabsMobileSelect?.addEventListener('change', this._handleMobileTabChange);
        pubsub.subscribe(UI_EVENTS.MODAL_VISIBILITY_CHANGED, (data?: unknown) => {
            const eventData = data as { modalId?: string; isVisible?: boolean } | undefined;
            if (eventData?.modalId === 'main-settings' && eventData.isVisible) {
                this.restoreOriginalContent(); 
                this._handleModalOpen().catch(e => console.error("Error handling modal open:", e));
            } else if (eventData?.modalId === 'main-settings' && !eventData.isVisible) {
                this.restoreOriginalContent(); 
            }
        });
    }

    _initializeTabManager() {
        const tabsContainer = this.#settingsTabsDesktopNav;
        if (tabsContainer && this.#contentContainer) {
            this._tabManagerApi = initializeTabs({ tabsContainer, contentContainer: this.#contentContainer, defaultTabKey: 'general', onTabChange: this._handleTabChange });
        } else console.error("[GlobalSettingsModalManager] Tab manager init failed: containers not found.");
    }
    
    public swapContent(newContentElement: HTMLElement): void {
        const modalHost = this.#mainSettingsModal;
        const originalContent = modalHost?.querySelector('.modal-content');
        
        if (!modalHost || !originalContent) return;
    
        if (this.#originalContentCache.length === 0) {
            this.#originalContentCache = Array.from(originalContent.childNodes);
        }
        
        originalContent.replaceWith(newContentElement);
    }
    
    public restoreOriginalContent(): void {
        const modalHost = this.#mainSettingsModal;
        const currentContent = modalHost?.querySelector('.modal-content');
        
        if (!modalHost || !currentContent || this.#originalContentCache.length === 0) {
            return;
        }
    
        const newModalContent = document.createElement('div');
        newModalContent.className = 'modal-content';
        
        this.#originalContentCache.forEach(node => newModalContent.appendChild(node));
        
        currentContent.replaceWith(newModalContent);
        
        this.#originalContentCache = [];
    }

    _handleMobileTabChange = (event: Event): void => {
        const selectedTab = (event.target as HTMLSelectElement).value;
        this._tabManagerApi?.activateTab(selectedTab);
    };

    _handleTabChange = async (activeTabKey: string): Promise<void> => {
        if (!activeTabKey) return;
        if (this.#settingsTabsMobileSelect) this.#settingsTabsMobileSelect.value = activeTabKey;
        await this._loadContentForTab(activeTabKey);
    };

    async _loadContentForTab(tabKey?: string) { 
        if (!tabKey) return;
        const tabInstance = this.#tabs[tabKey];
        if (tabInstance) {
            if (!tabInstance['_isInitialized']) await tabInstance.finishInitialization();
            else tabInstance.loadSettings();
        }
    }

    public async prepareToShowDefaultTab(): Promise<void> {
        if (this._tabManagerApi) this._tabManagerApi.activateTab('general', true);
    }

    _handleModalOpen = async () => {
        for (const tabKey of Object.keys(this.#tabs)) {
            const tabInstance = this.#tabs[tabKey];
            if (!tabInstance['_isInitialized']) await tabInstance.finishInitialization();
        }

        const currentTabKey = this._tabManagerApi?.getCurrentTab() || 'general';
        await this._loadContentForTab(currentTabKey);
    };

    _handleCloseClick = () => { this.saveSettings(); this._modalManagerRef?.closeSettingsModal(); }
    public closeModal = () => this._modalManagerRef?.closeSettingsModal();
    
    saveSettings = () => {
        let patchData: Partial<FullConfiguration> = {};
        for (const key in this.#tabs) {
            patchData = { ...patchData, ...this.#tabs[key].getSettingsToSave() };
        }
        
        if (Object.keys(patchData).length > 0) {
            this._appStore.getState().actions.requestBackendPatch(patchData);
        }
    }

    applyTranslations = async () => {
        if (this._isApplyingTranslations) return; this._isApplyingTranslations = true;
        const translate = this._uiControllerRef.translationService.translate;
        try {
            const titleSpan = this.#settingsModalTitle?.querySelector(".header-title");
            if (titleSpan) titleSpan.textContent = translate("configurationTitle");
            setIcon(this.#settingsModalTitle?.querySelector(".header-icon"), 'UI_SETTINGS');
            const closeBtn = this.#mainSettingsCloseButton;
            if (closeBtn) { const closeLabel = translate("close"); closeBtn.title = closeLabel; closeBtn.setAttribute("aria-label", `${closeLabel} ${translate("configurationTitle")}`); }
            
            const appVersionDisplay = document.getElementById("appVersionDisplaySettings");
            if (appVersionDisplay) appVersionDisplay.title = translate('viewDocsTooltip');
            
            this.#renderNavigation();

            for (const tabKey in this.#tabs) {
                const tabInstance = this.#tabs[tabKey];
                if (tabInstance && tabInstance['_isInitialized']) await tabInstance.applyTranslations();
            }
        } catch (e) { console.error("[GlobalSettingsModalManager applyTranslations] Error:", e); }
        finally { this._isApplyingTranslations = false; }
    }

    #renderNavigation() {
        const translate = this._uiControllerRef.translationService.translate;
        const tabsInfo = [
            { key: 'general', titleKey: 'generalSettingsTitle', iconKey: 'UI_SETTINGS' },
            { key: 'customGestures', titleKey: 'customGesturesTabButton', iconKey: 'UI_GESTURE' },
            { key: 'plugins', titleKey: 'pluginsTabTitle', iconKey: 'UI_EXTENSION' },
            { key: 'rtsp', titleKey: 'rtspSourcesTitle', iconKey: 'UI_RTSP_STREAM' },
            { key: 'appearance', titleKey: 'appearanceSettingsTab', iconKey: 'UI_DARK_MODE' }
        ];

        if (this.#settingsTabsDesktopNav) {
            this.#settingsTabsDesktopNav.innerHTML = '';
            tabsInfo.forEach(tab => {
                const button = document.createElement('button');
                button.className = 'btn settings-tab-nav-button';
                button.dataset.tab = tab.key;
                const icon = document.createElement('span');
                setIcon(icon, tab.iconKey as string);
                const text = document.createElement('span');
                text.textContent = translate(tab.titleKey, { defaultValue: tab.key });
                button.append(icon, text);
                this.#settingsTabsDesktopNav?.appendChild(button);
            });
        }
        
        if (this.#settingsTabsMobileSelect) {
            this.#settingsTabsMobileSelect.innerHTML = '';
            tabsInfo.forEach(tab => {
                const option = document.createElement('option');
                option.value = tab.key;
                option.textContent = translate(tab.titleKey, { defaultValue: tab.key });
                this.#settingsTabsMobileSelect?.appendChild(option);
            });
        }
    }
}