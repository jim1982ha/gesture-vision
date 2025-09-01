/* FILE: packages/frontend/src/ui/components/gesture-form/gesture-config-form.ts */
import type { UIController } from '#frontend/ui/ui-controller-core.js';
import {
  DEFAULT_GESTURE_CONFIDENCE,
  DEFAULT_GESTURE_DURATION_S,
} from '#frontend/constants/app-defaults.js';
import { UI_EVENTS, pubsub, translate, type GestureConfig, type PoseConfig, type ActionConfig } from '#shared/index.js';
import { setIcon, setElementVisibility } from '#frontend/ui/helpers/index.js';
import { GestureSelectManager } from './gesture-select-manager.js';
import { ActionPluginUIManager } from './action-plugin-ui-manager.js';
import type { GestureConfigModalManager } from '#frontend/ui/modals/gesture-config-modal-manager.js';
import type { FrontendFullState } from '#frontend/core/state/app-store.js';

export class GestureConfigForm {
  #uiControllerRef: UIController;
  #gestureSelectManager: GestureSelectManager | null = null;
  #actionPluginUIManager: ActionPluginUIManager | null = null;
  #unsubscribeStore: () => void;
  #isInitialized = false;

  constructor(_modalManagerRef: GestureConfigModalManager, uiControllerRef: UIController) {
    this.#uiControllerRef = uiControllerRef;
    this.#unsubscribeStore = this.#uiControllerRef.appStore.subscribe(
      (state: FrontendFullState, prevState: FrontendFullState) => {
        if (!this.#isInitialized) return;
        if (state.pluginManifests !== prevState.pluginManifests) this.populateAllDropdowns();
        if (state.languagePreference !== prevState.languagePreference) this.applyTranslations();
      }
    );
  }

  public initialize(): void {
    if (this.#isInitialized) return;

    const select = document.getElementById('gestureSelect') as HTMLSelectElement;
    const actionSelect = document.getElementById('actionTypeSelect') as HTMLSelectElement;
    const actionContainer = document.getElementById('actionFieldsContainer') as HTMLElement;

    this.#gestureSelectManager = new GestureSelectManager(select, this.#uiControllerRef.appStore);
    this.#actionPluginUIManager = new ActionPluginUIManager(actionSelect, actionContainer, this.#uiControllerRef, this.#handleFormInputChange);
    
    this.#attachEventListeners();
    this.populateAllDropdowns();
    this.#isInitialized = true;
  }

  destroy(): void {
    this.#unsubscribeStore();
    this.#gestureSelectManager?.destroy();
  }

  #attachEventListeners(): void {
    const modal = document.getElementById("gestureConfigModal");
    
    modal?.addEventListener('input', (e) => {
      const targetId = (e.target as HTMLElement).id;
      if (['configConfidenceInput', 'configDurationInput'].includes(targetId)) {
        this.#handleFormInputChange();
      }
    });

    modal?.addEventListener('change', (e) => {
      const targetId = (e.target as HTMLElement).id;
      if (['gestureSelect', 'actionTypeSelect'].includes(targetId)) {
          if (targetId === 'actionTypeSelect') this.#actionPluginUIManager?.handleActionTypeChange(e);
          else this.#handleFormInputChange();
      }
    });
  }

  #handleFormInputChange = (): void => {
    this.#toggleDependentFields();
  };

  public populateAllDropdowns(): void {
    this.#gestureSelectManager?.render();
    this.#actionPluginUIManager?.populateActionTypeSelect();
    this.#toggleDependentFields();
  }

  public async populateForm(config: GestureConfig | PoseConfig | null, isEditing: boolean): Promise<void> {
    const gestureName = isEditing && config ? ('gesture' in config ? config.gesture : config.pose) : null;
    this.#gestureSelectManager?.setEditingGestureName(gestureName);
    this.clearConfigInputs();

    if (isEditing && config) {
        this.#gestureSelectManager?.setValue(gestureName);
        const confidenceInput = document.getElementById('configConfidenceInput') as HTMLInputElement;
        const durationInput = document.getElementById('configDurationInput') as HTMLInputElement;
        if(confidenceInput) confidenceInput.value = String(config.confidence ?? DEFAULT_GESTURE_CONFIDENCE);
        if(durationInput) durationInput.value = String(config.duration ?? DEFAULT_GESTURE_DURATION_S);

        const actionConfig = config.actionConfig;
        await this.#actionPluginUIManager?.loadPluginUI(actionConfig?.pluginId ?? null, actionConfig?.settings as Record<string, unknown> | null);
    }

    this.#updateModalUI(isEditing);
    this.#toggleDependentFields();
  }
  
  public validateAndGetData(): { isValid: boolean; configData: (GestureConfig | PoseConfig) | null; errors: string[] } {
    const errors: string[] = [];
    const modal = document.getElementById("gestureConfigModal");
    if (!modal) return { isValid: false, configData: null, errors: ["Modal not found"] };

    const gestureSelect = modal.querySelector('#gestureSelect') as HTMLSelectElement;
    const confidenceInput = modal.querySelector('#configConfidenceInput') as HTMLInputElement;
    const durationInput = modal.querySelector('#configDurationInput') as HTMLInputElement;

    const selectedGesture = this.#gestureSelectManager?.getSelectedValue();
    if (!selectedGesture) { errors.push(translate('selectGesture')); gestureSelect?.setAttribute('aria-invalid', 'true'); }
    else { gestureSelect?.removeAttribute('aria-invalid'); }

    const confidence = parseFloat(confidenceInput?.value || 'NaN');
    if (isNaN(confidence) || confidence < 0 || confidence > 100) { errors.push(translate('confidenceLabel') + ' (0-100).'); confidenceInput?.setAttribute('aria-invalid', 'true'); }
    else { confidenceInput?.removeAttribute('aria-invalid'); }

    const duration = parseFloat(durationInput?.value || 'NaN');
    if (isNaN(duration) || duration <= 0) { errors.push(translate('durationLabel')); durationInput?.setAttribute('aria-invalid', 'true'); }
    else { durationInput?.removeAttribute('aria-invalid'); }

    const pluginValidation = this.#actionPluginUIManager?.validate();
    if (pluginValidation && !pluginValidation.isValid) errors.push(...(pluginValidation.errors || []));

    if (errors.length > 0) {
      pubsub.publish(UI_EVENTS.SHOW_ERROR, { message: `${translate('correctErrors')}\n- ${errors.join('\n- ')}` });
      return { isValid: false, configData: null, errors };
    }

    const actionSettings = this.#actionPluginUIManager?.getSettingsToSave();
    const actionConfig: ActionConfig | null = actionSettings ? { pluginId: actionSettings.pluginId, settings: actionSettings.settings } : null;

    const finalConfigData: Partial<GestureConfig & PoseConfig> = { duration, actionConfig, confidence };
    if (selectedGesture?.type === 'CUSTOM_POSE') (finalConfigData as PoseConfig).pose = selectedGesture.name;
    else (finalConfigData as GestureConfig).gesture = selectedGesture!.name;

    return { isValid: true, configData: finalConfigData as (GestureConfig | PoseConfig), errors: [] };
  }

  #updateModalUI(isEditing: boolean): void {
    const modal = document.getElementById("gestureConfigModal");
    if (!modal) return;

    const modalTitle = modal.querySelector("#gestureConfigModalTitle") as HTMLElement;
    const modalIcon = modal.querySelector(".header-icon") as HTMLElement;
    const addBtn = modal.querySelector("#addGestureConfig") as HTMLButtonElement;
    const cancelBtn = modal.querySelector("#cancelEditButton") as HTMLButtonElement;
    const addBtnLabel = addBtn?.querySelector('.btn-text-span') as HTMLElement;
    const cancelBtnLabel = cancelBtn?.querySelector('.btn-text-span') as HTMLElement;

    if (!modalTitle || !modalIcon || !addBtn || !cancelBtn || !addBtnLabel || !cancelBtnLabel) return;
    
    const titleKey = isEditing ? "editXTitle" : "addXTitle";
    modalTitle.textContent = translate(titleKey, { item: translate('action') });
    setIcon(modalIcon, 'UI_TUNE');
  
    addBtnLabel.textContent = translate(isEditing ? 'update' : 'add');
    cancelBtnLabel.textContent = translate('cancel');
  
    setIcon(addBtn, isEditing ? 'UI_SAVE' : 'UI_ADD');
    setIcon(cancelBtn, 'UI_CANCEL');
  }

  clearConfigInputs(): void {
    this.#gestureSelectManager?.setValue(null);
    const modal = document.getElementById("gestureConfigModal");
    if (!modal) return;
    (modal.querySelector('#configConfidenceInput') as HTMLInputElement).value = String(DEFAULT_GESTURE_CONFIDENCE);
    (modal.querySelector('#configDurationInput') as HTMLInputElement).value = String(DEFAULT_GESTURE_DURATION_S);
    this.#actionPluginUIManager?.loadPluginUI(null, null).catch((e) => console.error(e));
    modal.querySelectorAll('[aria-invalid]').forEach(el => el.removeAttribute('aria-invalid'));
    this.populateAllDropdowns();
  }

  #toggleDependentFields(): void {
    const modal = document.getElementById("gestureConfigModal");
    if (!modal) return;
    
    const confidenceInput = modal.querySelector('#configConfidenceInput') as HTMLInputElement;
    const durationInput = modal.querySelector('#configDurationInput') as HTMLInputElement;
    const actionTypeSelect = modal.querySelector('#actionTypeSelect') as HTMLSelectElement;
    const actionFieldsContainer = modal.querySelector('#actionFieldsContainer') as HTMLElement;
    
    const showFields = this.#gestureSelectManager?.getSelectedValue() !== null;
    [confidenceInput, durationInput, actionTypeSelect].forEach((el) =>
      el?.closest('.form-group')?.classList.toggle('hidden', !showFields)
    );
    if (actionFieldsContainer) {
      setElementVisibility(actionFieldsContainer, showFields && actionTypeSelect?.value !== 'none');
    }
  }

  public applyTranslations(): void {
    const modal = document.getElementById("gestureConfigModal");
    if (!modal) return;
    (modal.querySelector('#gestureLabel') as HTMLElement).textContent = translate('gestures');
    (modal.querySelector('#confidenceLabel') as HTMLElement).textContent = translate('confidenceLabel');
    (modal.querySelector('#durationLabel') as HTMLElement).textContent = translate('durationLabel');
    (modal.querySelector('#actionTypeLabel') as HTMLElement).textContent = translate('actionTypeLabel');
    (modal.querySelector('#configConfidenceInput') as HTMLInputElement).title = translate('confidenceThresholdTooltip');
    (modal.querySelector('#configDurationInput') as HTMLInputElement).title = translate('holdDurationTooltip');
    
    this.populateAllDropdowns();
    this.#updateModalUI(this.#uiControllerRef.getEditingConfigIndex() !== null);
  }
}