/* FILE: packages/frontend/src/ui/tabs/rtsp-settings-tab.ts */
import type { AppStore, FrontendFullState } from '#frontend/core/state/app-store.js';
import type { UIController } from '#frontend/ui/ui-controller-core.js';
import { createButton } from '#frontend/ui/utils/card-utils.js';
import { BaseSettingsTab, type TabElements } from "#frontend/ui/base-settings-tab.js";
import { SharedFormManager } from '../components/shared-form-manager.js';
import { RtspFormManager } from '../components/rtsp/rtsp-form-manager.js';
import { createRtspSourceCard } from '../components/rtsp/rtsp-source-card.js';

import { UI_EVENTS, pubsub } from "#shared/index.js";
import { normalizeNameForMtx } from "#shared/utils/index.js";
import type { RtspSourceConfig, FullConfiguration } from "#shared/index.js";

type HTMLElementOrNull = HTMLElement | null;
export interface RtspSettingsTabElements extends TabElements {
    container?: HTMLElementOrNull;
    rtspSourceListContainer?: HTMLElementOrNull;
    rtspListPlaceholder?: HTMLElementOrNull;
    rtspListActionsContainer?: HTMLElementOrNull; 
    rtspAddEditFormContainer?: HTMLElementOrNull;
}

export class RtspSettingsTab extends BaseSettingsTab<RtspSettingsTabElements> {
  #uiControllerRef: UIController;
  #listManager: SharedFormManager | null = null;
  #formManager: RtspFormManager | null = null;

  constructor(appStore: AppStore, uiControllerRef: UIController) {
    super(appStore, uiControllerRef, { container: '[data-tab-content="rtsp"]' });
    if (!uiControllerRef) throw new Error("RtspSettingsTab requires a UIController reference.");
    this.#uiControllerRef = uiControllerRef;
    this.#renderLayout();
  }

  protected async _additionalInitializationChecks(): Promise<void> {
    this.#formManager = new RtspFormManager(this._elements.rtspAddEditFormContainer!, this.#uiControllerRef);
    
    this.#listManager = new SharedFormManager({
      formContainer: this._elements.rtspAddEditFormContainer!,
      listContainer: this._elements.container!.querySelector('#rtsp-list-view')!,
      addNewButton: this._elements.rtspListActionsContainer!,
      onEnterAddMode: () => this.#handleEnterAddMode(),
      onEnterEditMode: (index) => this.#handleEnterEditMode(index),
      onSave: this.#handleSaveSource,
      onCancel: () => this.#uiControllerRef.setEditingRtspSourceIndex(null),
    });
  }
  
  protected _doesConfigUpdateAffectThisTab(newState: FrontendFullState, oldState: FrontendFullState): boolean {
    return newState.rtspSources !== oldState.rtspSources;
  }
  
  protected _initializeSpecificEventListeners(): void {
    this._elements.rtspListActionsContainer?.addEventListener("click", (e) => {
        if ((e.target as HTMLElement).closest('#rtspAddNewButton')) {
            this.#listManager?.startNew();
        }
    });

    this._elements.rtspSourceListContainer?.addEventListener("click", this.#handleSourceListClick);
  }

  public getSettingsToSave(): Partial<FullConfiguration> { return {}; }

  #handleEnterAddMode(): void {
    this.#formManager?.render();
    this.#formManager?.populate(null);
    this.#attachFormEventListeners();
  }

  #handleEnterEditMode(index: number): void {
    this.#formManager?.render();
    this.#formManager?.populate(this._appStore.getState().rtspSources[index]);
    this.#attachFormEventListeners();
  }

  #attachFormEventListeners(): void {
    this.#formManager?.getSaveButton()?.addEventListener('click', () => this.#listManager?.save());
    this.#formManager?.getCancelButton()?.addEventListener('click', () => this.#listManager?.cancel());
  }

  #handleSourceListClick = (event: MouseEvent): void => {
    const target = event.target as HTMLElement;
    const cardItem = target.closest<HTMLDivElement>('.rtsp-source-item');
    if (!cardItem || cardItem.dataset.index === undefined) return;
    
    const index = parseInt(cardItem.dataset.index, 10);
    if (isNaN(index)) return;

    if (target.closest('.delete-rtsp-btn')) {
        this.#handleDeleteSourceClick(index);
    } else if (cardItem.classList.contains('card-item-clickable')) {
        this.#listManager?.startEdit(index);
    }
  };

  #handleDeleteSourceClick = (index: number): void => {
    const sources = this._appStore.getState().rtspSources;
    if (index < 0 || index >= sources.length) return;
    const sourceToDelete = sources[index];
    const confirmationManager = this.#uiControllerRef._confirmationModalMgr;
    
    if (confirmationManager?.isReady()) {
        confirmationManager.show({ messageKey: "confirmDeleteMessage", messageSubstitutions: {item: sourceToDelete.name }, confirmTextKey: 'delete', onConfirm: () => this.#proceedWithDelete(sources, index) });
    } else if (window.confirm(this._translate("confirmDeleteMessage", { item: sourceToDelete.name }))) {
        this.#proceedWithDelete(sources, index);
    }
  };

  #proceedWithDelete = (sources: RtspSourceConfig[], index: number): void => {
    const updatedSources = sources.filter((_: RtspSourceConfig, i: number) => i !== index);
    this._appStore.getState().actions.requestBackendPatch({ rtspSources: updatedSources });
  };

  #handleSaveSource = async (): Promise<boolean> => {
    const newSource = this.#formManager?.getFormData();
    if (!newSource) return false;

    const sources = this._appStore.getState().rtspSources;
    const editingIndex = this.#listManager?.getEditingIndex() ?? null;
    
    const isNameDuplicate = sources.some((source, index) => normalizeNameForMtx(source.name) === normalizeNameForMtx(newSource.name) && index !== editingIndex);
    if (isNameDuplicate) {
        pubsub.publish(UI_EVENTS.SHOW_ERROR, { messageKey: "configExists", substitutions: { name: newSource.name } }); 
        return false;
    }
    
    const updatedSources = editingIndex !== null ? sources.map((s, i) => (i === editingIndex ? newSource : s)) : [...sources, newSource];
    await this._appStore.getState().actions.requestBackendPatch({ rtspSources: updatedSources });
    return true;
  };
  
  public loadSettings(): void {
    const sources = this._appStore.getState().rtspSources;
    const { rtspSourceListContainer: container, rtspListPlaceholder: placeholder } = this._elements;
    if (!container || !placeholder) return;
    container.innerHTML = "";
    if (sources.length === 0) {
      placeholder.textContent = this._translate("noRtspSourcesConfigured");
      placeholder.style.display = "block";
    } else {
      placeholder.style.display = "none";
      sources.forEach((s, i) => container.appendChild(createRtspSourceCard(s, i, this.#uiControllerRef.getEditingRtspSourceIndex() === i, this._translate)));
    }
    if (this.#uiControllerRef.getEditingRtspSourceIndex() === null && this.#listManager?.isEditing()) {
      this.#listManager.cancel();
    }
  }

  public applyTranslations(): void {
    // Re-render only the button with translated text, not the whole layout.
    const actionsContainer = this._elements.rtspListActionsContainer;
    if (actionsContainer) {
        actionsContainer.innerHTML = '';
        const addButton = createButton({
            id: 'rtspAddNewButton',
            textKey: 'add',
            titleKey: 'addTooltip',
            titleSubstitutions: { item: this._translate("rtspSourcesTitle") },
            iconKey: 'UI_ADD',
            extraClasses: ['btn-primary'],
            translate: this._translate
        });
        actionsContainer.appendChild(addButton);
    }
    // Re-render the list of cards which also contains translated text.
    this.loadSettings();
  }
  
  #renderLayout(): void {
    const container = this._elements.container;
    if (!container) return;
    
    container.innerHTML = `
      <div id="rtsp-list-view">
        <div id="rtspSourceListContainer" class="mb-4 grid grid-cols-1 gap-3"></div>
        <p id="rtspListPlaceholder" class="list-placeholder"></p>
        <div id="rtspListActionsContainer" class="flex justify-end mb-4"></div>
      </div>
      <div id="rtspAddEditFormContainer" class="hidden mt-4 border border-dashed border-border p-4 rounded-lg bg-background"></div>
    `;

    this._elements.rtspSourceListContainer = container.querySelector('#rtspSourceListContainer');
    this._elements.rtspListPlaceholder = container.querySelector('#rtspListPlaceholder');
    this._elements.rtspListActionsContainer = container.querySelector('#rtspListActionsContainer');
    this._elements.rtspAddEditFormContainer = container.querySelector('#rtspAddEditFormContainer');
  }
}