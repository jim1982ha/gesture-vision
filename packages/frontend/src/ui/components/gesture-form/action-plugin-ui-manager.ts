/* FILE: packages/frontend/src/ui/components/gesture-form/action-plugin-ui-manager.ts */
import type { UIController } from '#frontend/ui/ui-controller-core.js';
import { setElementVisibility } from '#frontend/ui/helpers/index.js';
import { DEFAULT_ACTION_PLUGIN_ID_NONE } from '#frontend/constants/app-defaults.js';
import { translate } from '#shared/services/translations.js';
import type { PluginManifest } from '#shared/index.js';
import type { IPluginActionSettingsComponent } from '#frontend/types/index.js';

export class ActionPluginUIManager {
  #actionTypeSelect: HTMLSelectElement | null;
  #actionFieldsContainer: HTMLElement | null;
  #uiControllerRef: UIController;
  #currentPluginComponent: IPluginActionSettingsComponent | null = null;
  #currentPluginId: string | null = null;
  #onActionTypeChange: () => void;

  constructor(
    actionTypeSelect: HTMLSelectElement | null,
    actionFieldsContainer: HTMLElement | null,
    uiControllerRef: UIController,
    onActionTypeChange: () => void
  ) {
    this.#actionTypeSelect = actionTypeSelect;
    this.#actionFieldsContainer = actionFieldsContainer;
    this.#uiControllerRef = uiControllerRef;
    this.#onActionTypeChange = onActionTypeChange;
  }

  public populateActionTypeSelect(): void {
    const selectEl = this.#actionTypeSelect;
    const pluginUIService = this.#uiControllerRef.pluginUIService;
    if (!selectEl || !pluginUIService) return;

    const currentVal = selectEl.value;
    selectEl.innerHTML = '';
    const noneOption = document.createElement('option');
    noneOption.value = DEFAULT_ACTION_PLUGIN_ID_NONE;
    noneOption.textContent = translate('actionTypeNone');
    selectEl.appendChild(noneOption);

    const actionPlugins = pluginUIService.getAvailableActionPlugins();
    actionPlugins.forEach((pluginManifest: PluginManifest) => {
      const option = document.createElement('option');
      option.value = pluginManifest.id;
      option.textContent = translate(pluginManifest.nameKey, {
        defaultValue: pluginManifest.id,
      });
      selectEl.appendChild(option);
    });
    
    // Check if the previously selected value is still a valid, available plugin.
    const stillValid = actionPlugins.some((p: PluginManifest) => p.id === currentVal);
    selectEl.value = stillValid ? currentVal : DEFAULT_ACTION_PLUGIN_ID_NONE;
    
    // If the value was reset to 'none', we need to trigger a UI update.
    if (!stillValid && currentVal !== DEFAULT_ACTION_PLUGIN_ID_NONE) {
        this.loadPluginUI(DEFAULT_ACTION_PLUGIN_ID_NONE, null);
    }
  }

  public async handleActionTypeChange(event: Event): Promise<void> {
    const selectedPluginId = (event.target as HTMLSelectElement).value;
    const editingIndex = this.#uiControllerRef.getEditingConfigIndex();
    
    let currentSettings: Record<string, unknown> | null = null;
    if (editingIndex !== null) {
        const gestureConfig = this.#uiControllerRef.getGestureConfigsSnapshot()[editingIndex];
        // Only provide settings if the plugin ID matches the one being edited
        if (gestureConfig?.actionConfig?.pluginId === selectedPluginId) {
            currentSettings = gestureConfig.actionConfig.settings as Record<string, unknown> | null;
        }
    }

    await this.loadPluginUI(selectedPluginId, currentSettings);
    this.#onActionTypeChange();
  }

  public async loadPluginUI(
    pluginId: string | null,
    settings: Record<string, unknown> | null
  ): Promise<void> {
    this.#cleanupCurrentComponent();
    this.#currentPluginId =
      pluginId && pluginId !== DEFAULT_ACTION_PLUGIN_ID_NONE ? pluginId : null;

    if (this.#actionTypeSelect)
      this.#actionTypeSelect.value =
        this.#currentPluginId || DEFAULT_ACTION_PLUGIN_ID_NONE;

    if (this.#currentPluginId && this.#uiControllerRef.pluginUIService) {
      const component =
        await this.#uiControllerRef.pluginUIService.createActionSettingsComponent(
          this.#currentPluginId,
          settings
        );
      if (component && this.#actionFieldsContainer) {
        this.#currentPluginComponent = component;
        this.#actionFieldsContainer.appendChild(
          component.render(
            settings,
            this.#uiControllerRef.pluginUIService.getPluginUIContext(
              this.#currentPluginId
            )
          )
        );
        setElementVisibility(this.#actionFieldsContainer, true);
      } else {
        // This case handles if a plugin is selected but fails to create a component.
        setElementVisibility(this.#actionFieldsContainer, false);
      }
    } else {
      setElementVisibility(this.#actionFieldsContainer, false);
    }
  }

  #cleanupCurrentComponent(): void {
    if (this.#actionFieldsContainer) this.#actionFieldsContainer.innerHTML = '';
    this.#currentPluginComponent?.destroy?.();
    this.#currentPluginComponent = null;
    this.#currentPluginId = null;
  }

  public getSettingsToSave(): { pluginId: string; settings: unknown } | null {
    if (!this.#currentPluginId || !this.#currentPluginComponent) return null;
    return {
      pluginId: this.#currentPluginId,
      settings: this.#currentPluginComponent.getActionSettingsToSave(),
    };
  }

  public validate(): { isValid: boolean; errors?: string[] } {
    if (!this.#currentPluginComponent) return { isValid: true };
    return this.#currentPluginComponent.validate?.() || { isValid: true };
  }

  public destroy(): void {
    this.#cleanupCurrentComponent();
  }
}