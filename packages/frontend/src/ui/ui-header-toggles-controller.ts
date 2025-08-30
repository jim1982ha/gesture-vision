/* FILE: packages/frontend/src/ui/ui-header-toggles-controller.ts */
import { type GestureCategoryIconType, translate, type FullConfiguration } from '#shared/index.js';
import { updateButtonGroupActiveState, updateButtonToggleActiveState, setIcon } from './helpers/index.js';

import type { UIController } from '#frontend/ui/ui-controller-core.js';
import type { AppStore } from '../core/state/app-store.js';

type FeatureConfigKey = Extract<
  keyof FullConfiguration,
  | 'enableBuiltInHandGestures'
  | 'enableCustomHandGestures'
  | 'enablePoseProcessing'
>;
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
  configKey?: FeatureConfigKey;
}
interface MobileDropdownConfig {
  type: string;
  triggerIconKey: GestureCategoryIconType;
  titleKey: string;
  items: PanelItemConfig[];
}

export class HeaderTogglesController {
  #elements: HeaderToggleElements = {};
  #appStore: AppStore;
  #activeDropdown: {
    type: string;
    panel: HTMLElement;
    button: HTMLButtonElement;
  } | null = null;

  constructor(
    elements: HeaderToggleElements,
    appStore: AppStore,
    _ui: UIController
  ) {
    this.#elements = elements;
    this.#appStore = appStore;
    this.#ensureCriticalElementsExist();
    this.#createMobileDropdowns();
    this.#attachDOMEventListeners();
    this.#subscribeToCoreState();
    this.updateAllButtonStates();
    this.applyTranslations();
  }
  destroy(): void {
    document.removeEventListener('click', this.#handleClickOutside);
  }

  #ensureCriticalElementsExist(): void {
    const toEnsure: Array<{ key: keyof HeaderToggleElements; id: string }> = [
      { key: 'builtInHandBtnDesktop', id: 'headerToggleBuiltInHand' },
      {
        key: 'customHandGesturesBtnDesktop',
        id: 'headerToggleCustomHandGestures',
      },
      { key: 'poseProcessingBtnDesktop', id: 'headerTogglePoseDetection' },
      { key: 'handLandmarksBtnDesktop', id: 'headerToggleHandLandmarks' },
      { key: 'numHands1BtnDesktop', id: 'headerToggleNumHands1' },
      { key: 'numHands2BtnDesktop', id: 'headerToggleNumHands2' },
      { key: 'poseLandmarksBtnDesktop', id: 'headerTogglePoseLandmarks' },
    ];
    toEnsure.forEach((item) => {
      if (!this.#elements[item.key])
        this.#elements[item.key] = document.getElementById(item.id) as
          | HTMLElement
          | HTMLButtonElement
          | null;
    });
  }

  #createMobileDropdowns(): void {
    // FIX: Add idempotency check. If controls are already built, do nothing.
    // This prevents wiping out UI contributions from plugins like the Dashboard.
    if (document.getElementById('mobile-controls-container')) {
      return;
    }

    const navControls = document.querySelector('.nav-controls');
    if (!navControls) {
      console.error('[HeaderTogglesCtrl] .nav-controls not found for mobile triggers.');
      return;
    }
  
    const mobileContainer = document.createElement('div');
    mobileContainer.id = 'mobile-controls-container';
    mobileContainer.className = 'mobile-header-controls-container mobile-only-inline-flex';
    const pluginSlot = navControls.querySelector('#header-plugin-contribution-slot');
    navControls.insertBefore(mobileContainer, pluginSlot || navControls.firstChild);
    
    this.#elements.mobileControlsContainer = mobileContainer;

    const dropdownConfigs: MobileDropdownConfig[] = [
      {
        type: 'features',
        triggerIconKey: 'UI_FEATURES_DROPDOWN_TRIGGER',
        titleKey: 'desktopFeaturesDropdownTitle',
        items: [
          { id: 'itemToggleBuiltInHand', iconKey: 'BUILT_IN_HAND', labelKey: 'toggleBuiltInHandGesturesTitle', handler: () => this.#handleFeatureToggleClick('enableBuiltInHandGestures'), configKey: 'enableBuiltInHandGestures' },
          { id: 'itemToggleCustomHandGestures', iconKey: 'CUSTOM_HAND', labelKey: 'toggleCustomHandGesturesTitle', handler: () => this.#handleFeatureToggleClick('enableCustomHandGestures'), configKey: 'enableCustomHandGestures' },
          { id: 'itemTogglePoseProcessing', iconKey: 'CUSTOM_POSE', labelKey: 'togglePoseProcessingTitle', handler: () => this.#handleFeatureToggleClick('enablePoseProcessing'), configKey: 'enablePoseProcessing' },
        ],
      },
      {
        type: 'handsAndLandmarks',
        triggerIconKey: 'UI_HANDS_LANDMARKS_DROPDOWN_TRIGGER',
        titleKey: 'desktopHandsDropdownTitle',
        items: [
          { id: 'itemToggleHandLandmarks', value: '0', iconKey: 'UI_HAND_LANDMARK_HIDE', labelKey: 'toggleHandLandmarksTitle', handler: () => this.#handleHandsAndLandmarksSelection(0) },
          { id: 'itemToggleNumHands1', value: '1', iconKey: 'UI_HAND_DETECT_ONE', labelKey: 'detect1HandTitle', handler: () => this.#handleHandsAndLandmarksSelection(1) },
          { id: 'itemToggleNumHands2', value: '2', iconKey: 'UI_HAND_DETECT_TWO', labelKey: 'detect2HandsTitle', handler: () => this.#handleHandsAndLandmarksSelection(2) },
          { id: 'itemTogglePoseLandmarks', iconKey: 'UI_POSE_LANDMARK_TOGGLE', labelKey: 'togglePoseLandmarksTitle', handler: () => this.#handleLandmarkToggleClick('pose') },
        ],
      },
    ];

    dropdownConfigs.forEach(({ type, triggerIconKey, items }) => {
        const wrapper = document.createElement('div');
        wrapper.className = 'dropdown-container';

        const trigger = document.createElement('button');
        trigger.className = 'btn btn-secondary header-dropdown-trigger';
        trigger.id = `mobile${type}DropdownTrigger`;
        const triggerIconSpan = document.createElement('span');
        trigger.appendChild(triggerIconSpan);
        setIcon(triggerIconSpan, triggerIconKey);

        const panel = document.createElement('div');
        panel.id = `mobile${type}DropdownPanel`;
        panel.className = 'header-dropdown-panel hidden';
        panel.setAttribute('role', 'menu');

        items.forEach((item) => {
          const button = document.createElement('button');
          button.type = 'button';
          button.className = 'btn btn-secondary';
          button.id = item.id;
          if (item.value) button.dataset.value = item.value;
          if (item.configKey) button.dataset.configKey = item.configKey;
          button.addEventListener('click', () => { item.handler(); this.#closeActiveDropdown(); });

          const iconSpan = document.createElement('span');
          setIcon(iconSpan, item.iconKey);
          const textSpan = document.createElement('span');
          textSpan.textContent = translate(item.labelKey);

          button.appendChild(iconSpan);
          button.appendChild(textSpan);
          panel.appendChild(button);
          this.#elements[item.id] = button;
        });
        
        trigger.addEventListener('click', () => this.#toggleDropdown(type, trigger, panel));
        
        wrapper.appendChild(trigger);
        wrapper.appendChild(panel); 
        mobileContainer.appendChild(wrapper);
      }
    );

    // FIX: Create and append the mobile plugin slot *after* other controls for right-side placement.
    const mobilePluginSlot = document.createElement('div');
    mobilePluginSlot.id = 'header-plugin-contribution-slot-mobile';
    mobilePluginSlot.className = 'header-plugin-controls';
    mobileContainer.appendChild(mobilePluginSlot);
  }

  #attachDOMEventListeners(): void {
    document.addEventListener('click', this.#handleClickOutside);
    this.#elements.builtInHandBtnDesktop?.addEventListener('click', () =>
      this.#handleFeatureToggleClick('enableBuiltInHandGestures')
    );
    this.#elements.customHandGesturesBtnDesktop?.addEventListener('click', () =>
      this.#handleFeatureToggleClick('enableCustomHandGestures')
    );
    this.#elements.poseProcessingBtnDesktop?.addEventListener('click', () =>
      this.#handleFeatureToggleClick('enablePoseProcessing')
    );
    this.#elements.handLandmarksBtnDesktop?.parentElement?.addEventListener(
      'click',
      (e) => {
        const btn = (e.target as HTMLElement).closest<HTMLButtonElement>(
          'button[data-value]'
        );
        if (btn?.dataset.value !== undefined)
          this.#handleHandsAndLandmarksSelection(
            parseInt(btn.dataset.value, 10)
          );
      }
    );
    this.#elements.poseLandmarksBtnDesktop?.addEventListener('click', () =>
      this.#handleLandmarkToggleClick('pose')
    );
  }
  #subscribeToCoreState(): void {
    this.#appStore.subscribe(() => {
      this.updateAllButtonStates();
      this.applyTranslations();
    });
  }

  #handleFeatureToggleClick = (configKey: FeatureConfigKey): void => {
    void this.#appStore.getState().actions.requestBackendPatch({
      [configKey]: !this.#appStore.getState()[configKey],
    });
  };
  #handleLandmarkToggleClick = (type: 'hand' | 'pose'): void => {
    const state = this.#appStore.getState();
    if (type === 'pose') {
      if (state.enablePoseProcessing)
        state.actions.setLocalPreference(
          'showPoseLandmarks',
          !state.showPoseLandmarks
        );
    } else {
      if (state.enableBuiltInHandGestures || state.enableCustomHandGestures)
        state.actions.setLocalPreference(
          'showHandLandmarks',
          !state.showHandLandmarks
        );
    }
  };
  #handleHandsAndLandmarksSelection = (value: number): void => {
    const { actions } = this.#appStore.getState();
    actions.setLocalPreference('showHandLandmarks', value !== 0);
    actions.setLocalPreference('numHandsPreference', value === 0 ? 1 : value);
  };

  #toggleDropdown = (
    type: string,
    button: HTMLButtonElement,
    panel: HTMLElement
  ): void => {
    if (button.disabled) {
      this.#closeActiveDropdown();
      return;
    }
    const isOpening =
      !this.#activeDropdown || this.#activeDropdown.type !== type;
    this.#closeActiveDropdown();
    if (isOpening) {
      panel.classList.remove('hidden');
      panel.classList.add('visible');
      button.setAttribute('aria-expanded', 'true');
      button.classList.add('active');
      this.#activeDropdown = { type, panel, button };
    }
  };
  #closeActiveDropdown = (): void => {
    if (!this.#activeDropdown) return;
    this.#activeDropdown.panel.classList.add('hidden');
    this.#activeDropdown.panel.classList.remove('visible');
    this.#activeDropdown.button.setAttribute('aria-expanded', 'false');
    this.#activeDropdown.button.classList.remove('active');
    this.#activeDropdown = null;
  };
  #handleClickOutside = (event: MouseEvent): void => {
    if (
      this.#activeDropdown &&
      !this.#activeDropdown.button.closest('.dropdown-container')?.contains(event.target as Node)
    )
      this.#closeActiveDropdown();
  };

  updateAllButtonStates = (): void => {
    const state = this.#appStore.getState();
    const {
      builtInHandBtnDesktop,
      customHandGesturesBtnDesktop,
      poseProcessingBtnDesktop,
      handLandmarksBtnDesktop,
      poseLandmarksBtnDesktop,
      itemToggleBuiltInHand,
      itemToggleCustomHandGestures,
      itemTogglePoseProcessing,
      itemToggleHandLandmarks,
      itemToggleNumHands1,
      itemToggleNumHands2,
      itemTogglePoseLandmarks,
    } = this.#elements;
    const builtInOn = state.enableBuiltInHandGestures,
      customHandOn = state.enableCustomHandGestures,
      poseOn = state.enablePoseProcessing;
    const anyHandOn = builtInOn || customHandOn;
    const showHandLm = state.showHandLandmarks,
      showPoseLm = state.showPoseLandmarks,
      numHands = state.numHandsPreference;

    updateButtonToggleActiveState(
      builtInHandBtnDesktop as HTMLButtonElementOrNull,
      builtInOn
    );
    updateButtonToggleActiveState(
      customHandGesturesBtnDesktop as HTMLButtonElementOrNull,
      customHandOn
    );
    updateButtonToggleActiveState(
      poseProcessingBtnDesktop as HTMLButtonElementOrNull,
      poseOn
    );
    updateButtonGroupActiveState(
      handLandmarksBtnDesktop?.parentElement,
      showHandLm ? String(numHands) : '0',
      !anyHandOn
    );
    updateButtonToggleActiveState(
      poseLandmarksBtnDesktop as HTMLButtonElementOrNull,
      showPoseLm,
      !poseOn
    );
    
    // Update mobile dropdown items
    updateButtonToggleActiveState(
      itemToggleBuiltInHand as HTMLButtonElementOrNull,
      builtInOn
    );
    updateButtonToggleActiveState(
      itemToggleCustomHandGestures as HTMLButtonElementOrNull,
      customHandOn
    );
    updateButtonToggleActiveState(
      itemTogglePoseProcessing as HTMLButtonElementOrNull,
      poseOn
    );
    updateButtonToggleActiveState(itemToggleHandLandmarks as HTMLButtonElement, !showHandLm, !anyHandOn);
    updateButtonToggleActiveState(itemToggleNumHands1 as HTMLButtonElement, showHandLm && numHands === 1, !anyHandOn);
    updateButtonToggleActiveState(itemToggleNumHands2 as HTMLButtonElement, showHandLm && numHands === 2, !anyHandOn);
    updateButtonToggleActiveState(
      itemTogglePoseLandmarks as HTMLButtonElementOrNull,
      showPoseLm,
      !poseOn
    );

    const mobileHandsAndLandmarksTrigger = document.getElementById(
      'mobilehandsAndLandmarksDropdownTrigger'
    );
    if (mobileHandsAndLandmarksTrigger)
      mobileHandsAndLandmarksTrigger.toggleAttribute('disabled', !anyHandOn && !poseOn);

    if (this.#activeDropdown?.type === 'handsAndLandmarks' && !anyHandOn && !poseOn)
      this.#closeActiveDropdown();
  };

  applyTranslations = (): void => {
    this.#createMobileDropdowns();
    const setTooltip = (el: Element | null | undefined, key: string) =>
      el?.setAttribute('title', translate(key));
    setTooltip(
      this.#elements.builtInHandBtnDesktop,
      'toggleBuiltInHandGesturesTitle'
    );
    setTooltip(
      this.#elements.customHandGesturesBtnDesktop,
      'toggleCustomHandGesturesTitle'
    );
    setTooltip(
      this.#elements.poseProcessingBtnDesktop,
      'togglePoseProcessingTitle'
    );
    setTooltip(
      this.#elements.handLandmarksBtnDesktop,
      'toggleHandLandmarksTitle'
    );
    setTooltip(this.#elements.numHands1BtnDesktop, 'detect1HandTitle');
    setTooltip(this.#elements.numHands2BtnDesktop, 'detect2HandsTitle');
    setTooltip(
      this.#elements.poseLandmarksBtnDesktop,
      'togglePoseLandmarksTitle'
    );
    setTooltip(
      document.getElementById('mobilehandsAndLandmarksDropdownTrigger'),
      'desktopHandsDropdownTitle'
    );
    setTooltip(
      document.getElementById('mobilefeaturesDropdownTrigger'),
      'desktopFeaturesDropdownTitle'
    );

    setIcon(this.#elements.builtInHandBtnDesktop, 'BUILT_IN_HAND');
    setIcon(this.#elements.customHandGesturesBtnDesktop, 'CUSTOM_HAND');
    setIcon(this.#elements.poseProcessingBtnDesktop, 'CUSTOM_POSE');
    setIcon(this.#elements.handLandmarksBtnDesktop, 'UI_HAND_LANDMARK_HIDE');
    setIcon(this.#elements.numHands1BtnDesktop, 'UI_HAND_DETECT_ONE');
    setIcon(this.#elements.numHands2BtnDesktop, 'UI_HAND_DETECT_TWO');
    setIcon(this.#elements.poseLandmarksBtnDesktop, 'UI_POSE_LANDMARK_TOGGLE');

    this.updateAllButtonStates();
  };
}