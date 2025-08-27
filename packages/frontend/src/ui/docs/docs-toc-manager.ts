/* FILE: packages/frontend/src/ui/docs/docs-toc-manager.ts */
import { updateButtonGroupActiveState } from '#frontend/ui/helpers/index.js';
import type { UIController } from '#frontend/ui/ui-controller-core.js';

import { translate } from '#shared/services/translations.js';

import { type LanguageCode } from '#shared/services/translations.js';

import { type DocsModalElements } from '../ui-docs-modal-manager.js';

const TOC_LANG_SELECTOR_ID = 'toc-lang-selector-clone';

export class DocsTocManager {
  #elements: Partial<DocsModalElements>;
  #uiControllerRef: UIController;

  constructor(elements: Partial<DocsModalElements>, uiControllerRef: UIController) {
    this.#elements = elements;
    this.#uiControllerRef = uiControllerRef;
  }

  public generate(contentContainer: HTMLElement | null): void {
    const tocList = this.#elements.modalTocList;
    if (!tocList || !contentContainer) return;

    tocList.innerHTML = '';

    const headings =
      contentContainer.querySelectorAll<HTMLElement>('h1, h2, h3');
    if (headings.length === 0) {
      tocList.innerHTML = `<li>${translate('noSectionsFound')}</li>`;
      return;
    }

    headings.forEach((heading, index) => {
      const id =
        heading.id ||
        this.#slugify(heading.textContent || `modal-section-${index}`);
      heading.id = id;
      const listItem = document.createElement('li');
      listItem.innerHTML = `<a href="#${id}" class="toc-${heading.tagName.toLowerCase()}">${
        heading.textContent
      }</a>`;
      listItem.firstElementChild?.addEventListener('click', (e: Event) =>
        this.#handleTocLinkClick(e, id, contentContainer)
      );
      tocList.appendChild(listItem);
    });
  }

  #handleTocLinkClick = (
    e: Event,
    id: string,
    contentContainer: HTMLElement
  ): void => {
    e.preventDefault();
    const scrollContainer = this.#elements.docsModalScrollableContent;
    const targetElement = contentContainer.querySelector<HTMLElement>(
      `#${CSS.escape(id)}`
    );

    if (targetElement && scrollContainer) {
      const parentPaddingTop = scrollContainer.parentElement
        ? getComputedStyle(scrollContainer.parentElement).paddingTop
        : '0';
      scrollContainer.scrollTo({
        top: targetElement.offsetTop - parseInt(parentPaddingTop, 10),
        behavior: 'smooth',
      });
    }

    document
      .querySelectorAll<HTMLAnchorElement>('#modalTocList a.active')
      .forEach((el) => el.classList.remove('active'));
    (e.currentTarget as HTMLAnchorElement).classList.add('active');
  };

  #slugify = (text: string): string =>
    text
      ? text
          .toLowerCase()
          .replace(/[^\w\s-]/g, '')
          .replace(/[\s_-]+/g, '-')
          .replace(/^-+|-+$/g, '')
      : '';

  public manageLanguageSelector(): void {
    const tocSidebar = this.#elements.modalTocSidebar;
    const originalLangGroup = this.#uiControllerRef._elements
      .languageSelectGroupHeader as HTMLElement | null;

    this.#removeLanguageSelector();

    if (tocSidebar && originalLangGroup) {
      const clonedLangGroup = originalLangGroup.cloneNode(true) as HTMLElement;
      clonedLangGroup.id = TOC_LANG_SELECTOR_ID;
      clonedLangGroup.addEventListener('click', (event: MouseEvent) => {
        const btn = (event.target as HTMLElement).closest<HTMLButtonElement>(
          'button[data-value]'
        );
        if (btn?.dataset.value) {
          this.#uiControllerRef.appStore
            .getState()
            .actions.setLocalPreference(
              'languagePreference',
              btn.dataset.value as LanguageCode
            );
        }
      });
      tocSidebar.appendChild(clonedLangGroup);
      this.updateClonedLangSelectorUI();
    }
  }

  #removeLanguageSelector(): void {
    document.getElementById(TOC_LANG_SELECTOR_ID)?.remove();
  }

  public updateClonedLangSelectorUI = (): void => {
    const clonedLangGroup = document.getElementById(TOC_LANG_SELECTOR_ID);
    if (clonedLangGroup && this.#uiControllerRef.appStore) {
      updateButtonGroupActiveState(
        clonedLangGroup,
        this.#uiControllerRef.appStore.getState().languagePreference
      );
    }
  };

  public cleanup(): void {
    this.#removeLanguageSelector();
  }
}