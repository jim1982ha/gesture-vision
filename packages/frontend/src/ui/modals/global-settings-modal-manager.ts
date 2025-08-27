/* FILE: packages/frontend/src/ui/modals/global-settings-modal-manager.ts */
import type { AppStore } from "#frontend/core/state/app-store.js";
import { initializeTabs } from "#frontend/ui/components/tab-manager.js";
import type { UIController } from "#frontend/ui/ui-controller-core.js";
import { UI_EVENTS } from "#shared/constants/index.js";
import { pubsub } from "#shared/core/pubsub.js";
import { translate } from "#shared/services/translations.js";
import { setIcon } from "#frontend/ui/helpers/icon-helpers.js";

import { type TabElements, BaseSettingsTab } from "../base-settings-tab.js"; 
import { CustomGesturesTab, type CustomGesturesTabElements } from "../tabs/custom-gestures-tab.js";
import { GeneralSettingsTab, type GeneralSettingsTabElements } from "../tabs/general-settings-tab.js";
import { RtspSettingsTab, type RtspSettingsTabElements } from "../tabs/rtsp-settings-tab.js";
import { ThemeSettingsTab, type ThemeSettingsTabElements } from "../tabs/theme-settings-tab.js";
import { PluginsTab, type PluginsTabElements } from "../tabs/plugins-tab.js"; 

import type { FullConfiguration } from "#shared/types/index.js";
import type { ModalManager } from "#frontend/ui/managers/modal-manager.js"; 

type HTMLElementOrNull = HTMLElement | null;

export interface GlobalSettingsFormElementGroups {
    core: {
        mainSettingsModal: HTMLElementOrNull;
        mainSettingsCloseButton: HTMLButtonElement | null;
        settingsTabs: HTMLElementOrNull;
        settingsTabContentContainer?: HTMLElementOrNull;
        appVersionDisplaySettings?: HTMLElementOrNull;
        customGesturesTabButton?: HTMLButtonElement | null;
        settingsModalTitle?: HTMLElementOrNull;
        settingsModalIcon?: HTMLElementOrNull;
        settingsModalTitleText?: HTMLElementOrNull;
        appearanceSettingsTabButton?: HTMLButtonElement | null; 
        modalActionsFooter: HTMLElement | null;
    };
    generalTab: GeneralSettingsTabElements;
    pluginsTab: PluginsTabElements;
    rtspTab: RtspSettingsTabElements;
    themeTab: ThemeSettingsTabElements; 
    customGesturesTab: CustomGesturesTabElements;
}

export class GlobalSettingsModalManager {
    _elements: GlobalSettingsFormElementGroups['core'];
    _tabElements: Omit<GlobalSettingsFormElementGroups, 'core' | 'integrationsTab'>;
    _uiControllerRef: UIController;
    _modalManagerRef: ModalManager;
    _appStore: AppStore;
    _tabManagerApi: { activateTab: (tabKey: string, forceCallback?: boolean) => void, getCurrentTab: () => string | null } | null = null;
    _isApplyingTranslations = false;
    #tabs: Record<string, BaseSettingsTab<TabElements> > = {};
    #contentContainer: HTMLElement | null = null;
    #originalContentCache: Node[] = [];
    #unsubscribeStore: () => void;

    constructor(elementGroups: GlobalSettingsFormElementGroups, uiControllerRef: UIController, modalManagerRef: ModalManager) {
        this._elements = elementGroups.core;
        this._tabElements = elementGroups;
        this.#contentContainer = this._elements.settingsTabContentContainer ?? null;

        this._uiControllerRef = uiControllerRef;
        this._modalManagerRef = modalManagerRef;
        this._appStore = this._uiControllerRef.appStore;

        this.#tabs = {
            general: new GeneralSettingsTab(this._tabElements.generalTab, this._appStore),
            plugins: new PluginsTab(this._tabElements.pluginsTab, this._appStore, this._uiControllerRef), 
            rtsp: new RtspSettingsTab(this._tabElements.rtspTab, this._appStore, this._uiControllerRef),
            appearance: new ThemeSettingsTab(this._tabElements.themeTab, this._uiControllerRef),
            customGestures: new CustomGesturesTab(this._tabElements.customGesturesTab, this._appStore, this._uiControllerRef)
        };
        
        this.#unsubscribeStore = this._appStore.subscribe((state) => {
            if (state.isInitialConfigLoaded && this._elements.mainSettingsModal?.classList.contains('visible')) {
                const activeTabKey = this._tabManagerApi?.getCurrentTab();
                if (activeTabKey) this._loadContentForTab(activeTabKey);
            }
        });

        this._initializeEventListeners();
        this._initializeTabManager();
    }
    
    destroy(): void {
        this.#unsubscribeStore();
    }

    _initializeEventListeners() {
        this._elements.mainSettingsCloseButton?.addEventListener('click', this._handleCloseClick);
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
        const tabsContainer = this._elements.settingsTabs;
        if (tabsContainer && this.#contentContainer) {
            this._tabManagerApi = initializeTabs({ tabsContainer, contentContainer: this.#contentContainer, defaultTabKey: 'general', onTabChange: this._handleTabChange });
        } else console.error("[GlobalSettingsModalManager] Tab manager init failed: containers not found.");
    }
    
    public swapContent(newContentElement: HTMLElement): void {
        const modalHost = this._elements.mainSettingsModal;
        const originalContent = modalHost?.querySelector('.modal-content');
        
        if (!modalHost || !originalContent) return;
    
        if (this.#originalContentCache.length === 0) {
            this.#originalContentCache = Array.from(originalContent.childNodes);
        }
        
        originalContent.replaceWith(newContentElement);
    }
    
    public restoreOriginalContent(): void {
        const modalHost = this._elements.mainSettingsModal;
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

    _handleTabChange = async (activeTabKey: string): Promise<void> => {
        if (!activeTabKey) return;
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
        try {
            const titleSpan = this._elements.settingsModalTitleText;
            if (titleSpan) titleSpan.textContent = translate("configurationTitle");
            setIcon(this._elements.settingsModalIcon, 'UI_SETTINGS');
            const closeBtn = this._elements.mainSettingsCloseButton;
            if (closeBtn) { const closeLabel = translate("close"); closeBtn.title = closeLabel; closeBtn.setAttribute("aria-label", `${closeLabel} ${translate("configurationTitle")}`); }
            
            this._elements.settingsTabs?.querySelectorAll<HTMLButtonElement>('.modal-tab-button[data-tab]').forEach((tab: HTMLButtonElement) => {
                const key = tab.dataset.tab; let transKey = '';
                switch (key) {
                    case 'general': transKey = 'generalSettingsTitle'; break;
                    case 'plugins': transKey = 'pluginsTabTitle'; break;
                    case 'rtsp': transKey = 'rtspSourcesTitle'; break;
                    case 'appearance': transKey = 'appearanceSettingsTab'; break; 
                    case 'customGestures': transKey = 'customGesturesTabButton'; break;
                }
                if (transKey) tab.textContent = translate(transKey, {defaultValue: key || 'Tab'});
            });
            for (const tabKey in this.#tabs) {
                const tabInstance = this.#tabs[tabKey];
                if (tabInstance && tabInstance['_isInitialized']) await tabInstance.applyTranslations();
            }
        } catch (e) { console.error("[GlobalSettingsModalManager applyTranslations] Error:", e); }
        finally { this._isApplyingTranslations = false; }
    }
}