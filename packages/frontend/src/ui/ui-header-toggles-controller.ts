/* FILE: packages/frontend/src/ui/ui-header-toggles-controller.ts */
import { type GestureCategoryIconType, type FullConfiguration } from '#shared/index.js';
import { updateButtonToggleActiveState, setIcon } from './helpers/index.js';
import type { UIController } from '#frontend/ui/ui-controller-core.js';
import type { AppStore } from '../core/state/app-store.js';
import { DEFAULT_NUM_HANDS_PREFERENCE } from '#frontend/constants/app-defaults.js';

type HTMLElementOrNull = HTMLElement | null;
type HTMLButtonElementOrNull = HTMLButtonElement | null;
export interface HeaderToggleElements {
  [key: string]: HTMLElementOrNull | HTMLButtonElementOrNull | undefined;
}

interface PanelItemConfig {
  id: string;
  iconKey: GestureCategoryIconType;
  labelKey: string;
  handler: () => void;
  value?: string;
}
interface DropdownConfig {
  type: string;
  triggerIconKey: GestureCategoryIconType;
  titleKey: string;
  items: PanelItemConfig[];
}

const FEATURE_OPTIONS: { value: keyof FullConfiguration; textKey: string; iconKey: GestureCategoryIconType }[] = [
    { value: 'enableBuiltInHandGestures', textKey: 'toggleBuiltInHandGesturesTitle', iconKey: 'BUILT_IN_HAND' },
    { value: 'enablePoseProcessing', textKey: 'togglePoseProcessingTitle', iconKey: 'CUSTOM_POSE' },
    { value: 'enableCustomHandGestures', textKey: 'toggleCustomHandGesturesTitle', iconKey: 'CUSTOM_HAND' },
];

export class HeaderTogglesController {
  #elements: HeaderToggleElements = {};
  #appStore: AppStore;
  #uiControllerRef: UIController;
  #activeDropdown: {
    type: string;
    panel: HTMLElement;
    button: HTMLButtonElement;
  } | null = null;

  constructor(
    appStore: AppStore,
    uiController: UIController
  ) {
    this.#appStore = appStore;
    this.#uiControllerRef = uiController;
    this.#createHeaderDropdowns();
    this.#attachDOMEventListeners();
    this.#subscribeToCoreState();
    this.updateAllButtonStates();
    this.applyTranslations();
  }
  
  destroy(): void {
    document.removeEventListener('click', this.#handleClickOutside);
  }

  #createHeaderDropdowns(): void {
    const container = document.getElementById('header-toggles-container');
    if (!container) return;
    const translate = this.#uiControllerRef.translationService.translate;
    
    container.innerHTML = '';
    this.#elements = {};

    const desktopGroup = document.createElement('div');
    desktopGroup.id = 'headerFeatureToggleGroupDesktop';
    desktopGroup.className = 'button-toggle-group hidden desktop:flex';
    FEATURE_OPTIONS.forEach(opt => {
      const button = document.createElement('button');
      button.className = 'btn btn-secondary';
      button.dataset.value = opt.value;
      button.innerHTML = `<span></span><span class="toggle-button-text">${translate(opt.textKey)}</span>`;
      setIcon(button.querySelector('span'), opt.iconKey);
      button.addEventListener('click', () => this.#handleFeatureToggleClick(opt.value));
      desktopGroup.appendChild(button);
      this.#elements[opt.value] = button;
    });
    container.appendChild(desktopGroup);

    const mobileDropdownConfig: DropdownConfig = {
        type: 'features',
        triggerIconKey: 'UI_FEATURES_DROPDOWN_TRIGGER',
        titleKey: 'desktopFeaturesDropdownTitle',
        items: FEATURE_OPTIONS.map(opt => ({
            id: `itemToggleFeature_${opt.value}`,
            iconKey: opt.iconKey,
            labelKey: opt.textKey,
            handler: () => this.#handleFeatureToggleClick(opt.value)
        }))
    };
    const mobileDropdown = this.#buildDropdown(mobileDropdownConfig);
    mobileDropdown.classList.add('desktop:hidden');
    container.appendChild(mobileDropdown);

    const landmarksDropdownConfig: DropdownConfig = {
      type: 'landmarks',
      triggerIconKey: 'UI_HANDS_LANDMARKS_DROPDOWN_TRIGGER',
      titleKey: 'desktopHandsDropdownTitle',
      items: [
        { id: 'itemToggleNumHands1', value: '1', iconKey: 'UI_HAND_DETECT_ONE', labelKey: 'detect1HandTitle', handler: () => this.#handleNumHandsSelection(1) },
        { id: 'itemToggleNumHands2', value: '2', iconKey: 'UI_HAND_DETECT_TWO', labelKey: 'detect2HandsTitle', handler: () => this.#handleNumHandsSelection(2) },
        { id: 'itemTogglePoseLandmarks', iconKey: 'UI_POSE_LANDMARK_TOGGLE', labelKey: 'togglePoseLandmarksTitle', handler: () => this.#handleLandmarkToggleClick('pose') },
      ],
    };
    const landmarksDropdown = this.#buildDropdown(landmarksDropdownConfig);
    landmarksDropdown.id = 'landmarksDropdownContainer';
    container.appendChild(landmarksDropdown);
  }

  #buildDropdown(config: DropdownConfig): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.className = 'dropdown-container relative';

    const trigger = document.createElement('button');
    trigger.className = 'btn btn-secondary btn-icon header-dropdown-trigger';
    trigger.id = `${config.type}DropdownTrigger`;
    const triggerIconSpan = document.createElement('span');
    trigger.appendChild(triggerIconSpan);
    setIcon(triggerIconSpan, config.triggerIconKey);
    this.#elements[trigger.id] = trigger;

    const panel = document.createElement('div');
    panel.id = `${config.type}DropdownPanel`;
    panel.className = 'header-dropdown-panel';
    panel.setAttribute('role', 'menu');

    config.items.forEach((item) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'btn btn-secondary w-full justify-start';
      button.id = item.id;
      if (item.value) button.dataset.value = item.value;
      button.addEventListener('click', () => { item.handler(); this.closeActiveDropdown(); });

      const iconSpan = document.createElement('span');
      setIcon(iconSpan, item.iconKey);
      const textSpan = document.createElement('span');
      button.appendChild(iconSpan);
      button.appendChild(textSpan);
      panel.appendChild(button);
      this.#elements[item.id] = button;
    });
    
    trigger.addEventListener('click', (e) => { e.stopPropagation(); this.#toggleDropdown(config.type, trigger, panel); });
    
    wrapper.appendChild(trigger);
    wrapper.appendChild(panel); 
    return wrapper;
  }

  #attachDOMEventListeners(): void {
    document.addEventListener('click', this.#handleClickOutside);
  }
  
  #subscribeToCoreState(): void {
    this.#appStore.subscribe((state, prevState) => {
      this.updateAllButtonStates();
      if(state.languagePreference !== prevState.languagePreference) {
        this.applyTranslations();
      }
    });
  }
  
  #handleFeatureToggleClick = (configKey: keyof FullConfiguration): void => {
      this.#appStore.getState().actions.requestBackendPatch({ [configKey]: !this.#appStore.getState()[configKey] });
  };

  #handleLandmarkToggleClick = (type: 'hand' | 'pose'): void => {
    const state = this.#appStore.getState();
    if (type === 'pose') {
      if (state.enablePoseProcessing) state.actions.setLocalPreference('showPoseLandmarks', !state.showPoseLandmarks);
    }
  };
  
  #handleNumHandsSelection = (numHands: number): void => {
    const state = this.#appStore.getState();
    const actions = state.actions;

    if (state.numHandsPreference === numHands && state.showHandLandmarks) {
        actions.setLocalPreference('showHandLandmarks', false);
    } else {
        actions.setLocalPreference('numHandsPreference', numHands);
        actions.setLocalPreference('showHandLandmarks', true);
    }
  };

  #toggleDropdown = (type: string, button: HTMLButtonElement, panel: HTMLElement): void => {
    if (button.disabled) { this.closeActiveDropdown(); return; }
    const isOpening = !this.#activeDropdown || this.#activeDropdown.type !== type;
    this.closeActiveDropdown();
    if (isOpening) {
      panel.classList.add('visible');
      button.setAttribute('aria-expanded', 'true');
      button.classList.add('active');
      this.#activeDropdown = { type, panel, button };
    }
  };

  public closeActiveDropdown = (): void => {
    if (!this.#activeDropdown) return;
    this.#activeDropdown.panel.classList.remove('visible');
    this.#activeDropdown.button.setAttribute('aria-expanded', 'false');
    this.#activeDropdown.button.classList.remove('active');
    this.#activeDropdown = null;
  };

  public isDropdownOpen = (): boolean => {
    return !!this.#activeDropdown;
  };

  #handleClickOutside = (event: MouseEvent): void => {
    if (this.#activeDropdown && !this.#activeDropdown.button.closest('.dropdown-container')?.contains(event.target as Node)) {
      this.closeActiveDropdown();
    }
  };

  updateAllButtonStates = (): void => {
    const state = this.#appStore.getState();
    const { itemTogglePoseLandmarks, landmarksDropdownTrigger, featuresDropdownTrigger } = this.#elements;
    
    const anyHandOn = state.enableBuiltInHandGestures || state.enableCustomHandGestures;
    const poseOn = state.enablePoseProcessing;
    const showHandLm = state.showHandLandmarks, showPoseLm = state.showPoseLandmarks, numHands = state.numHandsPreference;

    updateButtonToggleActiveState(this.#elements.itemToggleNumHands1 as HTMLButtonElement, showHandLm && numHands === 1, !anyHandOn);
    updateButtonToggleActiveState(this.#elements.itemToggleNumHands2 as HTMLButtonElement, showHandLm && numHands === 2, !anyHandOn);
    
    updateButtonToggleActiveState(itemTogglePoseLandmarks as HTMLButtonElement, showPoseLm, !poseOn);
    
    FEATURE_OPTIONS.forEach(opt => {
        updateButtonToggleActiveState(this.#elements[opt.value] as HTMLButtonElement, state[opt.value] as boolean);
        updateButtonToggleActiveState(this.#elements[`itemToggleFeature_${opt.value}`] as HTMLButtonElement, state[opt.value] as boolean);
    });

    const isLandmarksDropdownActive =
      (showHandLm && anyHandOn) ||
      (showPoseLm && poseOn) ||
      (numHands !== DEFAULT_NUM_HANDS_PREFERENCE && anyHandOn);
    updateButtonToggleActiveState(landmarksDropdownTrigger as HTMLButtonElement, isLandmarksDropdownActive, !anyHandOn && !poseOn);

    const isAnyFeatureOn = anyHandOn || poseOn;
    updateButtonToggleActiveState(featuresDropdownTrigger as HTMLButtonElement, isAnyFeatureOn);

    if (this.#activeDropdown?.type === 'landmarks' && !anyHandOn && !poseOn) this.closeActiveDropdown();
  };

  applyTranslations = (): void => {
    const translate = this.#uiControllerRef.translationService.translate;
    const setTooltip = (elId: string, key: string) => { const el = document.getElementById(elId); if(el) el.title = translate(key); };
    setTooltip('landmarksDropdownTrigger', 'desktopHandsDropdownTitle');
    setTooltip('featuresDropdownTrigger', 'desktopFeaturesDropdownTitle');
    
    FEATURE_OPTIONS.forEach(opt => {
        const desktopBtnText = (this.#elements[opt.value] as HTMLElement)?.querySelector('.toggle-button-text');
        if (desktopBtnText) desktopBtnText.textContent = translate(opt.textKey);
        const mobileBtnText = (this.#elements[`itemToggleFeature_${opt.value}`] as HTMLElement)?.querySelector('span:last-child');
        if (mobileBtnText) mobileBtnText.textContent = translate(opt.textKey);
    });

    const landmarksPanel = document.getElementById('landmarksDropdownPanel');
    if (landmarksPanel) {
        (landmarksPanel.querySelector('#itemToggleNumHands1 span:last-child') as HTMLElement).textContent = translate('detect1HandTitle');
        (landmarksPanel.querySelector('#itemToggleNumHands2 span:last-child') as HTMLElement).textContent = translate('detect2HandsTitle');
        (landmarksPanel.querySelector('#itemTogglePoseLandmarks span:last-child') as HTMLElement).textContent = translate('togglePoseLandmarksTitle');
    }
    
    this.updateAllButtonStates();
  };
}