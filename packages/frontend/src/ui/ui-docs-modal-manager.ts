/* FILE: packages/frontend/src/ui/ui-docs-modal-manager.ts */
import {
  UI_EVENTS,
  DOCS_MODAL_EVENTS,
} from "#shared/index.js";
import { pubsub } from "#shared/core/pubsub.js";
import { type LanguageCode } from '#shared/services/translations.js';

import { DocsContentLoader } from "./docs/docs-content-loader.js";
import { DocsTocManager } from "./docs/docs-toc-manager.js";
import {
  updateTranslationsForComponent,
  type TranslationConfigItem,
} from "./ui-translation-updater.js";
import { setIcon } from "./helpers/index.js";

import type { UIController } from "./ui-controller-core.js";
import { translate } from "#shared/services/translations.js";

export interface DocsModalElements {
  docsModal: HTMLElement | null;
  docsCloseButton: HTMLButtonElement | null;
  docsModalTitle: HTMLElement | null;
  docsModalIcon: HTMLElement | null;
  docsModalTitleText: HTMLElement | null;
  modalTocSidebar: HTMLElement | null;
  modalDocsContent: HTMLElement | null;
  modalContent: HTMLElement | null;
  modalTocList: HTMLElement | null;
  modalTocControls: HTMLElement | null;
  docsModalScrollableContent?: HTMLElement | null;
}

export class DocsModalManager {
  #elements: Partial<DocsModalElements> = {};
  #currentDocKey = "";
  #uiControllerRef: UIController;
  #contentLoader: DocsContentLoader;
  #tocManager: DocsTocManager;
  #unsubscribeStore: () => void;
  #unsubscribeDropdownToggle: () => void;

  constructor(uiControllerRef: UIController) {
    if (!uiControllerRef || !uiControllerRef.appStore) {
      throw new Error(
        "DocsModalManager requires a valid UIController and AppStore reference."
      );
    }
    this.#uiControllerRef = uiControllerRef;
    this.#queryElements();
    if (!this.#verifyElements("constructor")) {
      throw new Error(
        "DocsModalManager failed to initialize due to missing critical elements."
      );
    }
    this.#contentLoader = new DocsContentLoader();
    this.#tocManager = new DocsTocManager(
      this.#elements,
      this.#uiControllerRef
    );
    this.#attachEventListeners();
    
    this.#unsubscribeStore = this.#uiControllerRef.appStore.subscribe(
      (state, prevState) => {
        if (state.languagePreference !== prevState.languagePreference) {
          this.handleLanguageChangeForDocs();
        }
      }
    );
    
    this.#unsubscribeDropdownToggle = pubsub.subscribe('language-dropdown-toggled', () => {
        if (this.#elements.docsModal?.classList.contains('visible')) {
            this.#tocManager.syncMovedLanguageSelectorUI();
        }
    });
  }
  
  destroy(): void {
    this.#unsubscribeStore();
    this.#unsubscribeDropdownToggle();
  }

  #queryElements(): void {
    const query = (id: string) => document.getElementById(id);

    this.#elements.docsModal = query("docsModal") as HTMLElement;
    this.#elements.docsCloseButton = query("docsCloseButton") as HTMLButtonElement;
    this.#elements.docsModalTitle = query("docsModalTitle") as HTMLElement;
    this.#elements.docsModalIcon = this.#elements.docsModalTitle?.querySelector<HTMLElement>(".header-icon") ?? null;
    this.#elements.docsModalTitleText = this.#elements.docsModalTitle?.querySelector<HTMLElement>(".header-title") ?? null;
    this.#elements.modalTocSidebar = query("modalTocSidebar") as HTMLElement;
    this.#elements.modalDocsContent = query("modalDocsContent") as HTMLElement;
    this.#elements.modalContent = query("modalContent") as HTMLElement;
    this.#elements.modalTocList = query("modalTocList") as HTMLElement;
    this.#elements.modalTocControls = query("modalTocControls") as HTMLElement;
    this.#elements.docsModalScrollableContent = query("docsModalScrollableContent") as HTMLElement;
  }

  #verifyElements(calledFrom: string): boolean {
    const required: Array<keyof DocsModalElements> = [
      "docsModal", "docsCloseButton", "docsModalTitle", "modalTocSidebar",
      "modalDocsContent", "modalContent", "modalTocList", "modalTocControls", 
      "docsModalScrollableContent",
    ];
    for (const key of required) {
      if (!this.#elements[key]) {
        console.error(`[DocsModalManager Verify from ${calledFrom}] Missing critical element: '${key}'`);
        return false;
      }
    }
    return true;
  }

  #attachEventListeners(): void {
    this.#elements.docsCloseButton?.addEventListener("click", this.closeModal);
    pubsub.subscribe(DOCS_MODAL_EVENTS.REQUEST_CLOSE, this.closeModal);
    pubsub.subscribe(DOCS_MODAL_EVENTS.REQUEST_OPEN, (docKey?: unknown) => this.openModal(docKey as string | null));
  }

  public handleLanguageChangeForDocs = (): void => {
    this.applyTranslations();
    if (this.#currentDocKey) {
      this.#loadAndRenderDocument(this.#currentDocKey, true);
    }
  };

  #loadAndRenderDocument = async (
    docKey: string,
    forceReload = false
  ): Promise<void> => {
    const { modalContent: contentArticle, docsModalScrollableContent: scrollContainer, modalTocControls, modalTocList } = this.#elements;
    if (!contentArticle || !scrollContainer || !modalTocControls || !modalTocList || !this.#uiControllerRef.appStore) return;

    const targetDocPath = `docs/${docKey.toUpperCase()}.md`;
    if (!forceReload && this.#currentDocKey === docKey.toUpperCase()) {
      scrollContainer.scrollTop = 0;
      return;
    }

    this.#currentDocKey = docKey.toUpperCase();
    contentArticle.innerHTML = `<p>Loading ${this.#currentDocKey}...</p>`;
    modalTocList.innerHTML = "<li>Loading...</li>";

    modalTocControls.querySelectorAll<HTMLButtonElement>("button").forEach((btn) => {
        btn.classList.toggle("active", btn.id.includes(docKey.replace("_", "")));
    });

    try {
      const currentLang = this.#uiControllerRef.appStore.getState().languagePreference as LanguageCode;
      contentArticle.innerHTML = await this.#contentLoader.fetchAndProcess(targetDocPath, currentLang);
      requestAnimationFrame(() => {
        this.#tocManager.generate(contentArticle);
        this.#tocManager.manageLanguageSelector(this.#currentDocKey);
      });
      scrollContainer.scrollTop = 0;
    } catch (error) {
      console.error(`Error loading document ${docKey}:`, error);
      contentArticle.innerHTML = `<p style="color: var(--error);">${translate("errorLoadingDoc")}</p>`;
      modalTocList.innerHTML = `<li>Error</li>`;
      this.#currentDocKey = "";
    }
  };

  public openModal = async (docKey: string | null = "ABOUT"): Promise<void> => {
    pubsub.publish(UI_EVENTS.REQUEST_CLOSE_ALL_PANELS_EXCEPT, "docs");
    this.#elements.docsModal!.classList.add("visible");
    document.body.classList.add("modal-open", "modal-docs-open");
    pubsub.publish(UI_EVENTS.MODAL_VISIBILITY_CHANGED, { modalId: "docs", isVisible: true });
    this.applyTranslations();
    await this.#loadAndRenderDocument(docKey || "ABOUT");
  };

  public closeModal = (): void => {
    this.#tocManager.cleanup();
    this.#elements.docsModal?.classList.remove("visible");
    document.body.classList.remove("modal-open");
    pubsub.publish(UI_EVENTS.MODAL_VISIBILITY_CHANGED, { modalId: "docs", isVisible: false });
    pubsub.publish(UI_EVENTS.REQUEST_MODAL_BLUR_UPDATE);
    this.#currentDocKey = "";
  };

  #renderTocControls = (): void => {
    const container = this.#elements.modalTocControls;
    if (!container) return;
    container.innerHTML = '';
    const controls = [
      { docKey: 'ABOUT', labelKey: 'docsAboutButton' },
      { docKey: 'GUIDES', labelKey: 'docsGuidesButton' },
      { docKey: 'DEVELOPMENT', labelKey: 'docsDevButton' },
      { docKey: 'PLUGIN_DEV', labelKey: 'docsPluginDevButton' },
      { docKey: 'PRODUCTION', labelKey: 'docsProdButton' },
    ];
    controls.forEach(control => {
      const button = document.createElement('button');
      button.className = 'btn btn-secondary !text-xs !px-1 desktop:!px-4';
      button.textContent = translate(control.labelKey, { defaultValue: control.docKey });
      button.addEventListener('click', () => this.#loadAndRenderDocument(control.docKey));
      container.appendChild(button);
    });
  }

  public applyTranslations = (): void => {
    this.#renderTocControls();
    const itemsToTranslate: TranslationConfigItem[] = [
      { element: this.#elements.docsModalTitleText, config: "documentationTitle" },
      { element: this.#elements.docsCloseButton, config: { key: "close", attribute: "title" } },
    ];
    updateTranslationsForComponent(itemsToTranslate);
    setIcon(this.#elements.docsModalIcon, "UI_DOCS");
    this.#tocManager.syncMovedLanguageSelectorUI();
  };
}