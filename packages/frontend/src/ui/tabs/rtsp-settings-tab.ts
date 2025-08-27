/* FILE: packages/frontend/src/ui/tabs/rtsp-settings-tab.ts */
// Manages the UI and logic for configuring RTSP camera sources.
import type { AppStore, FrontendFullState } from "#frontend/core/state/app-store.js";
import type { UIController } from "#frontend/ui/ui-controller-core.js";
import { type TranslationConfigItem, type MultiTranslationConfigItem } from "#frontend/ui/ui-translation-updater.js";
import { createCardElement } from "#frontend/ui/utils/card-utils.js";
import { setIcon } from "#frontend/ui/helpers/icon-helpers.js";
import { BaseSettingsTab, type TabElements } from "#frontend/ui/base-settings-tab.js";

import { UI_EVENTS } from "#shared/constants/index.js";
import { pubsub } from "#shared/core/pubsub.js";
import { translate } from "#shared/services/translations.js";
import { normalizeNameForMtx } from "#shared/utils/index.js";

import type { RtspSourceConfig, RoiConfig, FullConfiguration } from "#shared/types/index.js";

type HTMLElementOrNull = HTMLElement | null;
export interface RtspSettingsTabElements extends TabElements {
    rtspSourceListContainer?: HTMLElementOrNull;
    rtspListPlaceholder?: HTMLElementOrNull;
    rtspAddNewButton?: HTMLButtonElement | null;
    rtspAddNewButtonLabel?: HTMLElementOrNull;
    rtspAddEditFormContainer?: HTMLElement | null;
    rtspFormTitle?: HTMLElementOrNull;
    rtspEditIndex?: HTMLInputElement | null;
    rtspSourceName?: HTMLInputElement | null;
    rtspSourceUrl?: HTMLInputElement | null;
    rtspNameLabel?: HTMLElementOrNull;
    rtspUrlLabel?: HTMLElementOrNull;
    rtspUrlHelp?: HTMLElementOrNull;
    rtspSaveSourceButton?: HTMLButtonElement | null;
    rtspSaveButtonLabel?: HTMLElementOrNull;
    rtspCancelEditButton?: HTMLButtonElement | null;
    rtspSourceOnDemand?: HTMLInputElement | null;
    rtspSourceOnDemandLabel?: HTMLElementOrNull;
    rtspRoiSettingsLabel?: HTMLElementOrNull;
    rtspRoiX?: HTMLInputElement | null;
    rtspRoiY?: HTMLInputElement | null;
    rtspRoiWidth?: HTMLInputElement | null;
    rtspRoiHeight?: HTMLInputElement | null;
    rtspRoiXLabel?: HTMLElementOrNull;
    rtspRoiYLabel?: HTMLElementOrNull;
    rtspRoiWidthLabel?: HTMLElementOrNull;
    rtspRoiHeightLabel?: HTMLElementOrNull;
    rtspRoiHelp?: HTMLElementOrNull;
    rtspListActionsContainer?: HTMLElementOrNull; 
}

const DEFAULT_ROI_FORM_VALUES: RoiConfig = { x: 0, y: 0, width: 100, height: 100 };

export class RtspSettingsTab extends BaseSettingsTab<RtspSettingsTabElements> {
  #uiControllerRef: UIController;

  constructor(elements: RtspSettingsTabElements, appStore: AppStore, uiControllerRef: UIController) {
    super(elements, appStore);
    if (!uiControllerRef) throw new Error("RtspSettingsTab requires a UIController reference.");
    this.#uiControllerRef = uiControllerRef;
  }

  protected _doesConfigUpdateAffectThisTab(newState: FrontendFullState, oldState: FrontendFullState): boolean {
    return newState.rtspSources !== oldState.rtspSources;
  }
  
  protected _initializeSpecificEventListeners(): void {
    this._addEventListenerHelper("rtspAddNewButton", "click", this.#handleAddNewSourceClick);
    this._addEventListenerHelper("rtspSourceListContainer", "click", this.#handleSourceListClick);
    this._addEventListenerHelper("rtspSaveSourceButton", "click", this.#handleSaveSourceClick);
    this._addEventListenerHelper("rtspCancelEditButton", "click", this.#handleCancelEditClick);
  }

  public getSettingsToSave(): Partial<FullConfiguration> {
    return {};
  }

  #handleAddNewSourceClick = (): void => {
    this.#uiControllerRef.setEditingRtspSourceIndex(null); 
    this.#populateRtspForm(null);
    this.#toggleRtspFormVisibility(true);
  };

  #handleSourceListClick = (event: MouseEvent): void => {
    const target = event.target as HTMLElement;
    const cardItem = target.closest<HTMLDivElement>('.rtsp-source-item');
    if (!cardItem || cardItem.dataset.index === undefined) return;
    
    const index = parseInt(cardItem.dataset.index, 10);
    if (isNaN(index)) return;

    if (target.closest('.delete-rtsp-btn')) {
        this.#handleDeleteSourceClick(index);
    } else if (cardItem.classList.contains('card-item-clickable')) {
        this.#handleEditSourceClick(index);
    }
  };

  #handleEditSourceClick = (index: number): void => {
    const sources = this._appStore.getState().rtspSources;
    if (index >= 0 && index < sources.length) {
      this.#uiControllerRef.setEditingRtspSourceIndex(index);
      this.#populateRtspForm(sources[index]);
      this.#toggleRtspFormVisibility(true);
    }
  };

  #handleDeleteSourceClick = (index: number): void => {
    const sources = this._appStore.getState().rtspSources;
    if (index < 0 || index >= sources.length) return;
    const sourceToDelete = sources[index];
    const confirmationManager = this.#uiControllerRef._confirmationModalMgr;
    if (confirmationManager?.isReady()) {
        confirmationManager.show({ messageKey: "confirmDeleteMessage", messageSubstitutions: {item: sourceToDelete.name }, confirmTextKey: 'delete', onConfirm: () => this.#proceedWithDelete(sources, index) });
    } else if (window.confirm(translate("confirmDeleteMessage", { item: sourceToDelete.name }))) {
        this.#proceedWithDelete(sources, index);
    }
  };

  #proceedWithDelete = (sources: RtspSourceConfig[], index: number): void => {
    const updatedSources = sources.filter((_: RtspSourceConfig, i: number) => i !== index);
    this._appStore.getState().actions.requestBackendPatch({ rtspSources: updatedSources });
  };

  #handleSaveSourceClick = (): void => {
    const newSource = this.#getRtspFormData();
    if (!newSource) return;
    const sources = this._appStore.getState().rtspSources;
    const editingIndex = this.#uiControllerRef.getEditingRtspSourceIndex();
    const isNameDuplicate = sources.some((source: RtspSourceConfig, index: number) => normalizeNameForMtx(source.name) === normalizeNameForMtx(newSource.name) && index !== editingIndex);
    if (isNameDuplicate) {
        pubsub.publish(UI_EVENTS.SHOW_ERROR, { messageKey: "configExists", substitutions: { name: newSource.name } }); 
        this._getElement<HTMLInputElement>("rtspSourceName")?.setAttribute("aria-invalid", "true"); return;
    }
    this._getElement<HTMLInputElement>("rtspSourceName")?.removeAttribute("aria-invalid");
    const updatedSources = editingIndex !== null ? sources.map((s: RtspSourceConfig, i: number) => (i === editingIndex ? newSource : s)) : [...sources, newSource];
    this._appStore.getState().actions.requestBackendPatch({ rtspSources: updatedSources })
      .then(() => {
          this.#toggleRtspFormVisibility(false); 
          this.#uiControllerRef.setEditingRtspSourceIndex(null); 
      });
  };

  #handleCancelEditClick = (): void => {
    this.#toggleRtspFormVisibility(false);
    this.#uiControllerRef.setEditingRtspSourceIndex(null);
  };

  #toggleRtspFormVisibility(show: boolean): void {
    const { rtspAddEditFormContainer, rtspSourceListContainer, rtspListActionsContainer, rtspCancelEditButton } = this._elements;
    if (rtspAddEditFormContainer) rtspAddEditFormContainer.classList.toggle('hidden', !show);
    if (rtspSourceListContainer) rtspSourceListContainer.style.display = show ? 'none' : 'grid';
    if (rtspListActionsContainer) rtspListActionsContainer.style.display = show ? 'none' : 'flex';
    if (rtspCancelEditButton) rtspCancelEditButton.style.display = show ? 'inline-flex' : 'none';
  }

  #populateRtspForm(source: RtspSourceConfig | null): void {
    const el = this._elements;
    const editingIndex = this.#uiControllerRef.getEditingRtspSourceIndex();
    const isEditing = editingIndex !== null;
    if (el.rtspFormTitle) el.rtspFormTitle.textContent = translate(isEditing ? "editXTitle" : "addXTitle", { item: "RTSP Source" });
    if (el.rtspSourceName) el.rtspSourceName.value = source?.name || "";
    if (el.rtspSourceUrl) el.rtspSourceUrl.value = source?.url || ""; 
    if (el.rtspSourceOnDemand) el.rtspSourceOnDemand.checked = source?.sourceOnDemand ?? false;
    const roi = source?.roi || DEFAULT_ROI_FORM_VALUES;
    if (el.rtspRoiX) el.rtspRoiX.value = String(roi.x);
    if (el.rtspRoiY) el.rtspRoiY.value = String(roi.y);
    if (el.rtspRoiWidth) el.rtspRoiWidth.value = String(roi.width);
    if (el.rtspRoiHeight) el.rtspRoiHeight.value = String(roi.height);
    if (el.rtspSaveButtonLabel) el.rtspSaveButtonLabel.textContent = translate(isEditing ? "update" : "add");
    setIcon(el.rtspSaveSourceButton, isEditing ? "UI_SAVE" : "UI_ADD");
    if (el.rtspCancelEditButton) el.rtspCancelEditButton.style.display = 'inline-flex';
  }

  #getRtspFormData(): RtspSourceConfig | null {
    const el = this._elements;
    const name = el.rtspSourceName?.value.trim()||"";
    const url = el.rtspSourceUrl?.value.trim()||"";
    let valid=true;
    if(!name){el.rtspSourceName?.setAttribute("aria-invalid","true");valid=false;}else{el.rtspSourceName?.removeAttribute("aria-invalid");}
    if(!url||!url.toLowerCase().startsWith("rtsp://")){el.rtspSourceUrl?.setAttribute("aria-invalid","true");valid=false;}else{el.rtspSourceUrl?.removeAttribute("aria-invalid");}
    if(!valid){pubsub.publish(UI_EVENTS.SHOW_ERROR,{messageKey:"rtspNameUrlRequired"});return null;} 
    const onDemand=el.rtspSourceOnDemand?.checked??false;
    let roi:RoiConfig={...DEFAULT_ROI_FORM_VALUES};
    const { rtspRoiX, rtspRoiY, rtspRoiWidth, rtspRoiHeight } = el;
    if(rtspRoiX && rtspRoiY && rtspRoiWidth && rtspRoiHeight){
      const x=parseFloat(rtspRoiX.value||""+DEFAULT_ROI_FORM_VALUES.x), y=parseFloat(rtspRoiY.value||""+DEFAULT_ROI_FORM_VALUES.y);
      const w=parseFloat(rtspRoiWidth.value||""+DEFAULT_ROI_FORM_VALUES.width), h=parseFloat(rtspRoiHeight.value||""+DEFAULT_ROI_FORM_VALUES.height);
      roi={x:isNaN(x)?0:Math.max(0,Math.min(100,x)),y:isNaN(y)?0:Math.max(0,Math.min(100,y)),width:isNaN(w)?100:Math.max(1,Math.min(100,w)),height:isNaN(h)?100:Math.max(1,Math.min(100,h))};
      if(roi.x+roi.width>100)roi.width=100-roi.x;
      if(roi.y+roi.height>100)roi.height=100-roi.y;
      roi.width=Math.max(1,roi.width); roi.height=Math.max(1,roi.height);
    }
    return {name,url,sourceOnDemand:onDemand,roi};
  }

  public loadSettings(): void {
    const sources = this._appStore.getState().rtspSources;
    const { rtspSourceListContainer: container, rtspListPlaceholder: placeholder } = this._elements;
    if (!container || !placeholder) return;
    container.innerHTML = "";
    if (sources.length === 0) {
      placeholder.textContent = translate("noRtspSourcesConfigured");
      placeholder.style.display = "block";
    } else {
      placeholder.style.display = "none";
      sources.forEach((s: RtspSourceConfig, i: number) => container.appendChild(this.#createRtspListItem(s, i)));
    }
    if (this.#uiControllerRef.getEditingRtspSourceIndex() === null) {
      this.#toggleRtspFormVisibility(false);
    }
  }

  #maskRtspUrlPassword = (url: string): string => url ? url.replace(/(rtsp:\/\/(?:[^:@/]+:)?)([^:@/]+)(@)/, "$1********$3") : "";

  #createRtspListItem(source: RtspSourceConfig, index: number): HTMLDivElement {
    const editingIndex = this.#uiControllerRef.getEditingRtspSourceIndex();
    const onDemandText = source.sourceOnDemand ? ` (${translate("rtspOnDemandIndicator")})` : "";
    const roi = source.roi;
    const hasCustomRoi = roi && (roi.x !== 0 || roi.y !== 0 || roi.width !== 100 || roi.height !== 100);
    const roiText = hasCustomRoi ? `<div class="card-detail-line"><span class="material-icons">crop</span><span class="card-detail-value">ROI: X:${roi.x}, Y:${roi.y}, W:${roi.width}, H:${roi.height}</span></div>` : "";
    let itemClasses = "rtsp-source-item card-item-clickable";
    if (editingIndex === index) {
      itemClasses += " is-editing-highlight";
    }

    const card = createCardElement({
        iconName: 'router', title: `${source.name}${onDemandText}`,
        actionButtonsHtml: `<button type="button" class="btn btn-icon btn-icon-danger delete-rtsp-btn" title="${translate('deleteTooltip',{item:source.name})}" data-index="${index}"><span class="material-icons"></span></button>`,
        detailsHtml: `<div class="card-detail-line"><span class="material-icons">link</span><span class="card-detail-value rtsp-url-display">${this.#maskRtspUrlPassword(source.url)}</span></div>${roiText}`,
        itemClasses: itemClasses, datasetAttributes: { index: String(index) }
    });

    setIcon(card.querySelector('.delete-rtsp-btn'), 'UI_DELETE');
    return card;
  }

  public applyTranslations(): void {
    const editingIndex = this.#uiControllerRef.getEditingRtspSourceIndex();
    const isEditing = editingIndex !== null;
    const itemsToTranslate: Array<TranslationConfigItem | MultiTranslationConfigItem>= [
        { element: this._elements.rtspAddNewButtonLabel, config: "add" },
        { element: this._elements.rtspAddNewButton, config: { key: "addTooltip", substitutions: { item: translate("rtspSourcesTitle") }, attribute: "title" } },
        { element: this._elements.rtspNameLabel, config: "nameLabel" },
        { element: this._elements.rtspSourceName as HTMLInputElement | null, config: { key: "rtspNamePlaceholder", attribute: "placeholder" } },
        { element: this._elements.rtspUrlLabel, config: "urlLabel" },
        { element: this._elements.rtspSourceUrl as HTMLInputElement | null, config: { key: "rtspUrlPlaceholder", attribute: "placeholder" } },
        { element: this._elements.rtspUrlHelp, config: "rtspUrlHelp" },
        { element: this._elements.rtspSourceOnDemandLabel, config: "rtspSourceOnDemandLabel" },
        { element: this._elements.rtspRoiSettingsLabel, config: "rtspRoiSettingsLabel" },
        { element: this._elements.rtspRoiXLabel, config: "roiLeftOffsetLabel" },
        { element: this._elements.rtspRoiYLabel, config: "roiTopOffsetLabel" },
        { element: this._elements.rtspRoiWidthLabel, config: "roiWidthLabel" },
        { element: this._elements.rtspRoiHeightLabel, config: "roiHeightLabel" },
        { element: this._elements.rtspRoiHelp, config: "rtspRoiHelpUpdated" },
        { element: this._elements.rtspSaveButtonLabel, config: isEditing ? "update" : "add" },
        { element: this._elements.rtspCancelEditButton?.querySelector<HTMLElement>('span:not(.material-icons)'), config: "cancel" },
        { element: this._elements.rtspCancelEditButton, config: { key: "cancelTooltip", attribute: "title" } },
    ];
    this._applyTranslationsHelper(itemsToTranslate);
    
    setIcon(this._elements.rtspAddNewButton, 'UI_ADD');
    setIcon(this._elements.rtspSaveSourceButton, isEditing ? "UI_SAVE" : "UI_ADD");
    setIcon(this._elements.rtspCancelEditButton, 'UI_CANCEL');

    if (this._elements.rtspFormTitle) this._elements.rtspFormTitle.textContent = translate(isEditing ? "editXTitle" : "addXTitle", {item: translate("rtspSourcesTitle")});
    this.loadSettings();
  }
}
