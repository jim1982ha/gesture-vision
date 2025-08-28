/* FILE: packages/frontend/src/ui/ui-docs-modal-manager.ts */
import {
  UI_EVENTS,
  DOCS_MODAL_EVENTS,
} from "#shared/constants/index.js";
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
  modalLoadProdBtn: HTMLButtonElement | null;
  modalLoadDevBtn: HTMLButtonElement | null;
  modalLoadPluginDevBtn: HTMLButtonElement | null;
  modalLoadGuidesBtn: HTMLButtonElement | null;
  modalLoadAboutBtn: HTMLButtonElement | null;
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
  }
  
  destroy(): void {
    this.#unsubscribeStore();
  }

  #queryElements(): void {
    const allAppElements = this.#uiControllerRef?._elements;
    if (!allAppElements) return;
    const query = (id: string) => document.getElementById(id);

    this.#elements.docsModal =
      (allAppElements.docsModal as HTMLElement) ?? query("docsModal");
    this.#elements.docsCloseButton =
      (allAppElements.docsCloseButton as HTMLButtonElement) ??
      (query("docsCloseButton") as HTMLButtonElement);
    this.#elements.docsModalTitle =
      (allAppElements.docsModalTitle as HTMLElement) ?? query("docsModalTitle");
    this.#elements.docsModalIcon =
      this.#elements.docsModalTitle?.querySelector<HTMLElement>(
        ".header-icon"
      ) ?? null;
    this.#elements.docsModalTitleText =
      this.#elements.docsModalTitle?.querySelector<HTMLElement>(
        ".header-title"
      ) ?? null;
    this.#elements.modalTocSidebar =
      (allAppElements.modalTocSidebar as HTMLElement) ??
      query("modalTocSidebar");
    this.#elements.modalDocsContent =
      (allAppElements.modalDocsContent as HTMLElement) ??
      query("modalDocsContent");
    this.#elements.modalContent =
      (allAppElements.modalContent as HTMLElement | null) ??
      (query("modalContent") as HTMLElement);
    this.#elements.modalTocList =
      (allAppElements.modalTocList as HTMLElement) ?? query("modalTocList");
    this.#elements.modalLoadProdBtn =
      (allAppElements.modalLoadProdBtn as HTMLButtonElement) ??
      (query("modalLoadProdBtn") as HTMLButtonElement);
    this.#elements.modalLoadDevBtn =
      (allAppElements.modalLoadDevBtn as HTMLButtonElement) ??
      (query("modalLoadDevBtn") as HTMLButtonElement);
    this.#elements.modalLoadPluginDevBtn =
      (query("modalLoadPluginDevBtn") as HTMLButtonElement);
    this.#elements.modalLoadGuidesBtn =
      (allAppElements.modalLoadGuidesBtn as HTMLButtonElement) ??
      (query("modalLoadGuidesBtn") as HTMLButtonElement);
    this.#elements.modalLoadAboutBtn =
      (allAppElements.modalLoadAboutBtn as HTMLButtonElement) ??
      (query("modalLoadAboutBtn") as HTMLButtonElement);
    this.#elements.modalTocControls =
      (allAppElements.modalTocControls as HTMLElement) ??
      query("modalTocControls");
    this.#elements.docsModalScrollableContent =
      (allAppElements.docsModalScrollableContent as HTMLElement) ??
      query("docsModalScrollableContent");
  }

  #verifyElements(calledFrom: string): boolean {
    const required: Array<keyof DocsModalElements> = [
      "docsModal", "docsCloseButton", "docsModalTitle", "modalTocSidebar",
      "modalDocsContent", "modalContent", "modalTocList", "modalLoadProdBtn",
      "modalLoadDevBtn", "modalLoadPluginDevBtn", "modalLoadGuidesBtn",
      "modalLoadAboutBtn", "modalTocControls", "docsModalScrollableContent",
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
    const loadDoc = (docKey: string) => this.#loadAndRenderDocument(docKey);
    this.#elements.modalLoadProdBtn?.addEventListener("click", () => loadDoc("PRODUCTION"));
    this.#elements.modalLoadDevBtn?.addEventListener("click", () => loadDoc("DEVELOPMENT"));
    this.#elements.modalLoadPluginDevBtn?.addEventListener("click", () => loadDoc("PLUGIN_DEV"));
    this.#elements.modalLoadGuidesBtn?.addEventListener("click", () => loadDoc("GUIDES"));
    this.#elements.modalLoadAboutBtn?.addEventListener("click", () => loadDoc("ABOUT"));
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
        // FIX: Pass the current docKey to the manageLanguageSelector method.
        this.#tocManager.manageLanguageSelector(this.#currentDocKey);
      });
      scrollContainer.scrollTop = 0;
    } catch (error) {
      console.error(`Error loading document ${docKey}:`, error);
      contentArticle.innerHTML = `<p style="color: var(--error);">Error loading document.</p>`;
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

  public applyTranslations = (): void => {
    const titleTextElement = this.#elements.docsModalTitleText;
    const itemsToTranslate: TranslationConfigItem[] = [
      { element: titleTextElement, config: "documentationTitle" },
      { element: this.#elements.modalLoadAboutBtn, config: { key: "docsAboutButton", defaultValue: "ABOUT" } },
      { element: this.#elements.modalLoadDevBtn, config: { key: "docsDevButton", defaultValue: "DEV" } },
      { element: this.#elements.modalLoadPluginDevBtn, config: { key: "docsPluginDevButton", defaultValue: "SDK" } },
      { element: this.#elements.modalLoadProdBtn, config: { key: "docsProdButton", defaultValue: "PROD" } },
      { element: this.#elements.modalLoadGuidesBtn, config: { key: "docsGuidesButton", defaultValue: "GUIDES" } },
      { element: this.#elements.docsCloseButton, config: { key: "close", attribute: "title" } },
    ];
    updateTranslationsForComponent(itemsToTranslate);
    setIcon(this.#elements.docsModalIcon, "UI_DOCS");
    this.#tocManager.updateClonedLangSelectorUI();
  };
}