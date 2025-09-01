/* FILE: packages/frontend/src/ui/docs/docs-toc-manager.ts */
import { updateButtonGroupActiveState } from '#frontend/ui/helpers/index.js';
import type { UIController } from '#frontend/ui/ui-controller-core.js';
import { translate } from '#shared/services/translations.js';

import { type LanguageCode } from '#shared/services/translations.js';

import { type DocsModalElements } from '../ui-docs-modal-manager.js';
import type { LanguageManager } from '#frontend/services/language-manager.js';

export class DocsTocManager {
  #elements: Partial<DocsModalElements>;
  #uiControllerRef: UIController;
  #languageManager: LanguageManager | null;

  #langSelectorOriginalParent: HTMLElement | null = null;
  #langSelectorOriginalNextSibling: Node | null = null;

  constructor(elements: Partial<DocsModalElements>, uiControllerRef: UIController) {
    this.#elements = elements;
    this.#uiControllerRef = uiControllerRef;
    this.#languageManager = this.#uiControllerRef._languageManager;
  }

  public generate(contentContainer: HTMLElement | null): void {
    const tocList = this.#elements.modalTocList;
    if (!tocList || !contentContainer) return;

    tocList.innerHTML = '';
    const headings = contentContainer.querySelectorAll<HTMLElement>('h1, h2, h3');
    if (headings.length === 0) {
      tocList.innerHTML = `<li>${translate('noSectionsFound')}</li>`;
      return;
    }

    headings.forEach((heading, index) => {
      const id = heading.id || this.#slugify(heading.textContent || `modal-section-${index}`);
      heading.id = id;
      const listItem = document.createElement('li');
      listItem.innerHTML = `<a href="#${id}" class="toc-${heading.tagName.toLowerCase()}">${heading.textContent}</a>`;
      listItem.firstElementChild?.addEventListener('click', (e: Event) =>
        this.#handleTocLinkClick(e, id, contentContainer)
      );
      tocList.appendChild(listItem);
    });
  }

  #handleTocLinkClick = (e: Event, id: string, contentContainer: HTMLElement): void => {
    e.preventDefault();
    const scrollContainer = this.#elements.docsModalScrollableContent;
    const targetElement = contentContainer.querySelector<HTMLElement>(`#${CSS.escape(id)}`);

    if (targetElement && scrollContainer) {
      const parentPaddingTop = scrollContainer.parentElement ? getComputedStyle(scrollContainer.parentElement).paddingTop : '0';
      scrollContainer.scrollTo({
        top: targetElement.offsetTop - parseInt(parentPaddingTop, 10),
        behavior: 'smooth',
      });
    }

    document.querySelectorAll<HTMLAnchorElement>('#modalTocList a.active').forEach((el) => el.classList.remove('active'));
    (e.currentTarget as HTMLAnchorElement).classList.add('active');
  };

  #slugify = (text: string): string =>
    text ? text.toLowerCase().replace(/[^\w\s-]/g, '').replace(/[\s_-]+/g, '-').replace(/^-+|-+$/g, '') : '';

  public manageLanguageSelector(docKey: string): void {
    const placeholder = document.getElementById('docs-lang-selector-placeholder');
    const originalLangContainer = document.querySelector('.language-selector-container');
    const isAboutDoc = docKey.toUpperCase() === 'ABOUT';
    
    if (placeholder && originalLangContainer && isAboutDoc) {
      if (!this.#langSelectorOriginalParent) {
        this.#langSelectorOriginalParent = originalLangContainer.parentElement as HTMLElement;
        this.#langSelectorOriginalNextSibling = originalLangContainer.nextSibling;
      }
      placeholder.appendChild(originalLangContainer);
    } else {
      this.#restoreLanguageSelector();
    }
  }

  #restoreLanguageSelector(): void {
    const originalLangContainer = document.querySelector('.language-selector-container');
    if (this.#langSelectorOriginalParent && originalLangContainer) {
      this.#langSelectorOriginalParent.insertBefore(originalLangContainer, this.#langSelectorOriginalNextSibling);
      this.#langSelectorOriginalParent = null;
      this.#langSelectorOriginalNextSibling = null;
    }
  }

  public syncMovedLanguageSelectorUI(): void {
    const langContainer = document.querySelector('.language-selector-container');
    if (!langContainer || !this.#uiControllerRef.appStore || !this.#languageManager) return;
    
    const panel = langContainer.querySelector<HTMLElement>('.header-dropdown-panel');
    const lang = this.#uiControllerRef.appStore.getState().languagePreference as LanguageCode;

    if (panel) {
        panel.classList.toggle('visible', this.#languageManager.isDropdownOpen());
        updateButtonGroupActiveState(panel, lang);
    }
  }

  public cleanup(): void {
    this.#restoreLanguageSelector();
  }
}