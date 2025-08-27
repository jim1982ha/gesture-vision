/* FILE: packages/frontend/src/ui/components/gesture-form/gesture-config-form.ts */
import type { UIController } from '#frontend/ui/ui-controller-core.js';
import {
  DEFAULT_GESTURE_CONFIDENCE,
  DEFAULT_GESTURE_DURATION_S,
} from '#frontend/constants/app-defaults.js';
import { UI_EVENTS } from '#shared/constants/index.js';
import { pubsub } from '#shared/core/pubsub.js';
import { translate } from '#shared/services/translations.js';
import { setIcon, setElementVisibility } from '#frontend/ui/helpers/index.js';
import { GestureSelectManager } from './gesture-select-manager.js';
import { ActionPluginUIManager } from './action-plugin-ui-manager.js';

import type {
  GestureConfig,
  PoseConfig,
  ActionConfig,
} from '#shared/types/index.js';

export interface FormElements {
  gestureSelect: HTMLSelectElement | null;
  configConfidenceInput: HTMLInputElement | null;
  configDurationInput: HTMLInputElement | null;
  actionTypeSelect: HTMLSelectElement | null;
  actionFieldsContainer: HTMLElement | null;
  addGestureConfig: HTMLButtonElement | null;
  cancelEditButton: HTMLButtonElement | null;
  cancelEditButtonLabel: HTMLElement | null;
  addConfigButtonLabel?: HTMLElement | null;
  gestureLabel?: HTMLElement | null;
  confidenceLabel?: HTMLElement | null;
  durationLabel?: HTMLElement | null;
  actionTypeLabel?: HTMLElement | null;
  [key: string]: HTMLElement | HTMLInputElement | null | undefined;
}
interface ValidationResult {
  isValid: boolean;
  configData: Partial<GestureConfig & PoseConfig> | null;
  errors: string[];
}

export class GestureConfigForm {
  _elements: FormElements;
  _uiControllerRef: UIController;
  #gestureSelectManager: GestureSelectManager;
  #actionPluginUIManager: ActionPluginUIManager;
  #isDirtyForNew = false;
  #unsubscribeStore: () => void;

  constructor(uiControllerRef: UIController) {
    this._uiControllerRef = uiControllerRef;
    this._elements = this.#queryFormElements();
    this.#gestureSelectManager = new GestureSelectManager(
      this._elements.gestureSelect,
      uiControllerRef.appStore
    );
    this.#actionPluginUIManager = new ActionPluginUIManager(
      this._elements.actionTypeSelect,
      this._elements.actionFieldsContainer,
      uiControllerRef,
      this.#handleFormInputChange
    );
    this.#unsubscribeStore = this._uiControllerRef.appStore.subscribe(
      (state, prevState) => {
        if (this._uiControllerRef.getEditingConfigIndex() === null) {
          this.#clearAndResetEditingHighlights();
          this.#updateConfigButtonsUI(false, this.#isDirtyForNew);
        }
        if (
          state.pluginManifests !== prevState.pluginManifests ||
          state.languagePreference !== prevState.languagePreference
        ) {
          this.populateAllDropdowns();
        }
      }
    );
    this.#initialize();
  }

  destroy(): void {
    this.#unsubscribeStore();
    this.#gestureSelectManager.destroy();
  }

  #initialize(): void {
    this.#attachEventListeners();
    this.populateAllDropdowns();
    this.cancelEditMode();
  }

  #queryFormElements = (): FormElements => ({
    gestureSelect: document.getElementById('gestureSelect') as HTMLSelectElement,
    configConfidenceInput: document.getElementById(
      'configConfidenceInput'
    ) as HTMLInputElement,
    configDurationInput: document.getElementById(
      'configDurationInput'
    ) as HTMLInputElement,
    actionTypeSelect: document.getElementById(
      'actionTypeSelect'
    ) as HTMLSelectElement,
    actionFieldsContainer: document.getElementById(
      'actionFieldsContainer'
    ) as HTMLElement,
    addGestureConfig: document.getElementById(
      'addGestureConfig'
    ) as HTMLButtonElement,
    cancelEditButton: document.getElementById(
      'cancelEditButton'
    ) as HTMLButtonElement,
    cancelEditButtonLabel: document.getElementById(
      'cancelEditButtonLabel'
    ) as HTMLElement,
    addConfigButtonLabel: document.getElementById(
      'addConfigButtonLabel'
    ) as HTMLElement,
    gestureLabel: document.getElementById('gestureLabel') as HTMLElement,
    confidenceLabel: document.getElementById('confidenceLabel') as HTMLElement,
    durationLabel: document.getElementById('durationLabel') as HTMLElement,
    actionTypeLabel: document.getElementById('actionTypeLabel') as HTMLElement,
  });

  #attachEventListeners(): void {
    this._elements.addGestureConfig?.addEventListener('click', () =>
      this.#handleAddOrUpdateClick()
    );
    this._elements.cancelEditButton?.addEventListener('click', () =>
      this.cancelEditMode()
    );
    this._elements.gestureSelect?.addEventListener('change', () =>
      this.#handleFormInputChange()
    );
    this._elements.actionTypeSelect?.addEventListener('change', (e) =>
      this.#actionPluginUIManager.handleActionTypeChange(e)
    );
    [
      this._elements.configConfidenceInput,
      this._elements.configDurationInput,
    ].forEach((el) => el?.addEventListener('input', () => this.#handleFormInputChange()));
  }

  #handleFormInputChange = (): void => {
    const gestureValue = this.#gestureSelectManager.getSelectedValue()?.name;
    if (
      this._uiControllerRef.getEditingConfigIndex() === null &&
      !this.#isDirtyForNew &&
      gestureValue
    ) {
      this.#isDirtyForNew = true;
      this.#updateConfigButtonsUI(false, true);
    }
    this.#toggleDependentFields();
  };

  public populateAllDropdowns(): void {
    this.#gestureSelectManager.render();
    this.#actionPluginUIManager.populateActionTypeSelect();
    this.#toggleDependentFields();
  }

  public async startEdit(index: number): Promise<void> {
    this.#isDirtyForNew = false;
    const configs = this._uiControllerRef.getGestureConfigsSnapshot();
    if (index < 0 || index >= configs.length) {
      this.cancelEditMode(false);
      return;
    }

    this.#clearAndResetEditingHighlights();
    const config = configs[index];
    const gestureNameForCard = 'gesture' in config ? config.gesture : config.pose;
    this._uiControllerRef.setEditingConfigIndex(index, gestureNameForCard);

    this.#gestureSelectManager.setEditingGestureName(gestureNameForCard);

    if (gestureNameForCard) {
      const card = this.#findCardByGestureName(gestureNameForCard);
      card?.classList.add('is-editing-highlight');
      if (
        this._uiControllerRef.sidebarManager &&
        !this._uiControllerRef.sidebarManager.isMobile
      )
        card?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    this.#gestureSelectManager.setValue(gestureNameForCard);

    if (this._elements.configConfidenceInput)
      this._elements.configConfidenceInput.value = String(
        config.confidence ?? DEFAULT_GESTURE_CONFIDENCE
      );
    if (this._elements.configDurationInput)
      this._elements.configDurationInput.value = String(
        config.duration ?? DEFAULT_GESTURE_DURATION_S
      );

    const actionConfig = config.actionConfig;
    await this.#actionPluginUIManager.loadPluginUI(
      actionConfig?.pluginId ?? null,
      actionConfig?.settings as Record<string, unknown> | null
    );

    this.#updateConfigButtonsUI(true, false);
    this.#toggleDependentFields();
  }

  #findCardByGestureName = (name: string): HTMLElement | null => {
    const { configListDiv, inactiveConfigListDiv } = this._uiControllerRef._elements;
    const selector = `.card-item[data-gesture-name="${CSS.escape(name)}"]`;
    return (
      (configListDiv?.querySelector<HTMLElement>(selector) ??
        inactiveConfigListDiv?.querySelector<HTMLElement>(selector)) ||
      null
    );
  };

  public cancelEditMode(closePanel = true): void {
    const wasEditing = this._uiControllerRef.getEditingConfigIndex() !== null;
    if (closePanel && (wasEditing || this.#isDirtyForNew))
      this._uiControllerRef.sidebarManager?.closeConfigSidebar();

    this._uiControllerRef.setEditingConfigIndex(null);
    this.#gestureSelectManager.setEditingGestureName(null);
    this.#clearAndResetEditingHighlights();
    this.clearConfigInputs();
    this.#isDirtyForNew = false;
  }

  public async applyTranslations(): Promise<void> {
    const isEditing = this._uiControllerRef.getEditingConfigIndex() !== null;
    if (this._elements.gestureLabel)
      this._elements.gestureLabel.textContent = translate('gestures');
    if (this._elements.confidenceLabel)
      this._elements.confidenceLabel.textContent = translate('confidenceLabel');
    if (this._elements.durationLabel)
      this._elements.durationLabel.textContent = translate('durationLabel');
    if (this._elements.actionTypeLabel)
      this._elements.actionTypeLabel.textContent = translate('actionTypeLabel');

    if (this._elements.addConfigButtonLabel) {
      this._elements.addConfigButtonLabel.textContent = isEditing
        ? translate('update')
        : translate('add');
    }

    if (this._elements.cancelEditButton)
      this._elements.cancelEditButton.title = translate('cancelTooltip');

    if (this._elements.cancelEditButtonLabel) {
      this._elements.cancelEditButtonLabel.textContent = translate('cancel');
    }

    this.populateAllDropdowns();
  }

  async #handleAddOrUpdateClick(): Promise<void> {
    const validationResult = this.#validateConfigInputs();
    if (!validationResult.isValid || !validationResult.configData) return;
    await this.#saveConfiguration(
      validationResult.configData as GestureConfig | PoseConfig,
      this._uiControllerRef.getEditingConfigIndex()
    );
  }

  async #saveConfiguration(
    configData: GestureConfig | PoseConfig,
    editingIndex: number | null
  ): Promise<void> {
    const currentConfigs = this._uiControllerRef.getGestureConfigsSnapshot();
    const updatedConfigs =
      editingIndex !== null
        ? currentConfigs.map((c, i) => (i === editingIndex ? configData : c))
        : [...currentConfigs, configData];

    await this._uiControllerRef.updateGestureConfigs(updatedConfigs);

    this.cancelEditMode(editingIndex === null);
    pubsub.publish(UI_EVENTS.SHOW_NOTIFICATION, {
      messageKey:
        editingIndex !== null
          ? 'notificationItemUpdated'
          : 'notificationItemAdded',
      substitutions: { item: 'Configuration' },
      type: 'success',
    });
  }

  #validateConfigInputs(): ValidationResult {
    const errors: string[] = [];
    const { configConfidenceInput, configDurationInput } = this._elements;

    const selectedGesture = this.#gestureSelectManager.getSelectedValue();
    if (!selectedGesture) {
      errors.push(translate('selectGesture'));
      this._elements.gestureSelect?.setAttribute('aria-invalid', 'true');
    } else {
      this._elements.gestureSelect?.removeAttribute('aria-invalid');
    }

    const confidence = parseFloat(configConfidenceInput?.value || 'NaN');
    if (isNaN(confidence) || confidence < 0 || confidence > 100) {
      errors.push(translate('confidenceLabel') + ' (0-100).');
      configConfidenceInput?.setAttribute('aria-invalid', 'true');
    } else {
      configConfidenceInput?.removeAttribute('aria-invalid');
    }

    const duration = parseFloat(configDurationInput?.value || 'NaN');
    if (isNaN(duration) || duration <= 0) {
      errors.push(translate('durationLabel'));
      configDurationInput?.setAttribute('aria-invalid', 'true');
    } else {
      configDurationInput?.removeAttribute('aria-invalid');
    }

    const pluginValidation = this.#actionPluginUIManager.validate();
    if (!pluginValidation.isValid)
      errors.push(...(pluginValidation.errors || []));

    if (errors.length > 0) {
      pubsub.publish(UI_EVENTS.SHOW_ERROR, {
        messageKey: 'correctErrors',
        substitutions: { errors: '\n- ' + errors.join('\n- ') },
      });
      return { isValid: false, configData: null, errors };
    }

    const actionSettings = this.#actionPluginUIManager.getSettingsToSave();
    const actionConfig: ActionConfig | null = actionSettings
      ? { pluginId: actionSettings.pluginId, settings: actionSettings.settings }
      : null;

    const finalConfigData: Partial<GestureConfig & PoseConfig> = {
      duration,
      actionConfig,
      confidence,
    };
    if (selectedGesture?.type === 'CUSTOM_POSE')
      (finalConfigData as PoseConfig).pose = selectedGesture.name;
    else (finalConfigData as GestureConfig).gesture = selectedGesture!.name;

    return { isValid: true, configData: finalConfigData, errors: [] };
  }

  #updateConfigButtonsUI(isEditing: boolean, isDirtyForNew: boolean): void {
    const { addGestureConfig: addButton, cancelEditButton: cancelButton } =
      this._elements;
    if (!addButton || !cancelButton) return;
    const addConfigButtonLabel = addButton.querySelector(
      'span:not(.material-icons)'
    ) as HTMLElement | null;

    const showTwoButtons = isEditing || isDirtyForNew;
    addButton.parentElement?.classList.toggle('two-button-layout', showTwoButtons);
    setElementVisibility(cancelButton, showTwoButtons, 'inline-flex');
    if (addConfigButtonLabel)
      addConfigButtonLabel.textContent = translate(isEditing ? 'update' : 'add');
    addButton.title = translate(isEditing ? 'saveTooltip' : 'addTooltip', {
      item: translate('gestures'),
    });
    setIcon(addButton, isEditing ? 'UI_SAVE' : 'UI_ADD');
    setIcon(cancelButton, 'UI_CANCEL');
  }

  #clearAndResetEditingHighlights(): void {
    document
      .querySelectorAll('.is-editing-highlight')
      .forEach((el) => el.classList.remove('is-editing-highlight'));
  }

  clearConfigInputs(): void {
    this.#gestureSelectManager.setValue(null);
    if (this._elements.configConfidenceInput)
      this._elements.configConfidenceInput.value = String(
        DEFAULT_GESTURE_CONFIDENCE
      );
    if (this._elements.configDurationInput)
      this._elements.configDurationInput.value = String(
        DEFAULT_GESTURE_DURATION_S
      );
    this.#actionPluginUIManager
      .loadPluginUI(null, null)
      .catch((e) => console.error(e));

    this._elements.gestureSelect?.removeAttribute('aria-invalid');
    this._elements.configConfidenceInput?.removeAttribute('aria-invalid');
    this._elements.configDurationInput?.removeAttribute('aria-invalid');

    this.populateAllDropdowns();
    this.#isDirtyForNew = false;
    this.#updateConfigButtonsUI(false, false);
  }

  #toggleDependentFields(): void {
    const showFields = this.#gestureSelectManager.getSelectedValue() !== null;
    [
      this._elements.configConfidenceInput,
      this._elements.configDurationInput,
      this._elements.actionTypeSelect,
    ].forEach((el) =>
      el?.closest('.form-group')?.classList.toggle('hidden', !showFields)
    );
    if (this._elements.actionFieldsContainer) {
      this._elements.actionFieldsContainer.classList.toggle(
        'hidden',
        !showFields || this._elements.actionTypeSelect?.value === 'none'
      );
    }
  }
}