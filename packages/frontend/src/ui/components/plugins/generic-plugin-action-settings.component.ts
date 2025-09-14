/* FILE: packages/frontend/src/ui/components/plugins/generic-plugin-action-settings.component.ts */
import type {
  ActionSettingFieldDescriptor,
  ActionSettingFieldOption,
} from '#shared/index.js';
import type {
  IPluginActionSettingsComponent,
  PluginUIContext,
} from '#frontend/types/index.js';
import { renderFormFields } from '#frontend/ui/helpers/index.js';

// Define the expected function signature for clarity and type safety.
type OptionsSourceFn = (
  context: PluginUIContext,
  currentSettings?: Record<string, unknown>,
  filterText?: string
) => Promise<ActionSettingFieldOption[]>;

export class GenericPluginActionSettingsComponent
  implements IPluginActionSettingsComponent
{
  #pluginId: string;
  #uiContainer: HTMLDivElement;
  #fieldDescriptors: ActionSettingFieldDescriptor[];
  #context: PluginUIContext;
  #formElements: Record<string, HTMLElement> = {};
  #dependencyMap = new Map<string, string[]>();
  #currentSettings: Record<string, unknown> | null = null;

  constructor(
    pluginId: string,
    fieldDescriptors:
      | ActionSettingFieldDescriptor[]
      | ((context: PluginUIContext) => ActionSettingFieldDescriptor[]),
    context: PluginUIContext
  ) {
    this.#pluginId = pluginId;
    this.#context = context;
    this.#fieldDescriptors =
      typeof fieldDescriptors === 'function'
        ? fieldDescriptors(context)
        : fieldDescriptors;
    this.#uiContainer = document.createElement('div');
    this.#uiContainer.className = `plugin-action-settings-form generic-settings-form generic-${pluginId}-settings`;
    this.#buildDependencyMap();
  }

  render(
    currentActionSpecificSettings: Record<string, unknown> | null
  ): HTMLElement {
    this.#currentSettings = currentActionSpecificSettings;
    
    // Use the new FormRenderer utility
    this.#formElements = renderFormFields(this.#uiContainer, this.#fieldDescriptors, this.#pluginId, this.#context);

    // Populate and attach listeners after rendering
    this.#fieldDescriptors.forEach((field) => {
      const element = this.#formElements[field.id];
      const value = this.#getNestedValue(this.#currentSettings || {}, field.id);
      
      if (element instanceof HTMLInputElement && element.type === 'checkbox') {
        element.checked = !!value;
      } else if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
        element.value = (typeof value === 'string' || typeof value === 'number') ? String(value) : '';
      } else if (element instanceof HTMLSelectElement) {
        this.#populateSelectOptions(element, field.optionsSource, value);
        element.addEventListener('change', () => this.#handleDependencyChange(field.id));
      }
    });

    return this.#uiContainer;
  }

  #buildDependencyMap(): void {
    this.#dependencyMap.clear();
    for (const field of this.#fieldDescriptors) {
      if (field.dependsOn) {
        for (const dependencyId of field.dependsOn) {
          if (!this.#dependencyMap.has(dependencyId)) {
            this.#dependencyMap.set(dependencyId, []);
          }
          this.#dependencyMap.get(dependencyId)!.push(field.id);
        }
      }
    }
  }

  #getNestedValue = (obj: Record<string, unknown>, path: string): unknown => {
    return path
      .split('.')
      .reduce(
        (acc: unknown, part: string) =>
          acc && typeof acc === 'object'
            ? (acc as Record<string, unknown>)[part]
            : undefined,
        obj
      );
  };
  
  async #populateSelectOptions(
    select: HTMLSelectElement,
    optionsSource: ActionSettingFieldDescriptor['optionsSource'],
    selectedValue: unknown
  ): Promise<void> {
    if (typeof optionsSource !== 'function') return;

    const translate = this.#context.services.translationService.translate;
    select.innerHTML = `<option disabled>${translate('loading')}...</option>`;
    select.disabled = true;

    try {
      // FIX: Assert the type of the function to guide the TypeScript compiler.
      const typedOptionsSource = optionsSource as OptionsSourceFn;
      const options = await typedOptionsSource(
        this.#context,
        this.getActionSettingsToSave() || {},
        undefined
      );

      select.innerHTML = '';
      let valueFound = false;
      let isFirstOption = true;

      if (options.length === 0 || (options.length === 1 && options[0].disabled)) {
        const placeholder = document.createElement('option');
        placeholder.textContent = options[0]?.label || translate('noItemsToDisplay');
        placeholder.disabled = true;
        placeholder.selected = true;
        select.appendChild(placeholder);
      } else {
        options.forEach((opt) => {
          const optionEl = document.createElement('option');
          optionEl.value = opt.value;
          optionEl.textContent = opt.label;
          optionEl.disabled = opt.disabled || false;
          if (String(opt.value) === String(selectedValue)) {
            optionEl.selected = true;
            valueFound = true;
          } else if (!selectedValue && isFirstOption && !opt.disabled) {
            optionEl.selected = true;
            valueFound = true;
          }
          if (!opt.disabled) isFirstOption = false;
          select.appendChild(optionEl);
        });
      }

      if (valueFound) {
        select.dispatchEvent(new Event('change'));
      }
    } catch (e) {
      console.error(`Error populating select options for ${select.id}:`, e);
      select.innerHTML = `<option disabled selected>${translate(
        'errorGeneric'
      )}</option>`;
    } finally {
      select.disabled = false;
    }
  }


  #handleDependencyChange(changedFieldId: string): void {
    const dependents = this.#dependencyMap.get(changedFieldId);
    if (dependents) {
      dependents.forEach((dependentId) => {
        this.#refreshFieldOptions(dependentId);
      });
    }
  }

  async #refreshFieldOptions(fieldId: string): Promise<void> {
    const field = this.#fieldDescriptors.find(f => f.id === fieldId);
    const element = this.#formElements[fieldId];
    if (!field || !element) return;
    
    if (element instanceof HTMLSelectElement && field.optionsSource) {
        const savedValueForDependent = this.#getNestedValue(this.#currentSettings || {}, field.id);
        await this.#populateSelectOptions(element, field.optionsSource, savedValueForDependent);
    }
  }

  getActionSettingsToSave(): Record<string, unknown> | null {
    const settings: Record<string, unknown> = {};
    const setNestedValue = (
      obj: Record<string, unknown>,
      path: string,
      value: unknown
    ) => {
      const keys = path.split('.');
      keys.reduce(
        (acc: Record<string, unknown>, key: string, index: number) => {
          if (index === keys.length - 1) acc[key] = value;
          else if (!acc[key] || typeof acc[key] !== 'object') acc[key] = {};
          return acc[key] as Record<string, unknown>;
        },
        obj
      );
    };
    for (const field of this.#fieldDescriptors) {
      const element = this.#formElements[field.id];
      if (element instanceof HTMLInputElement && field.type === 'checkbox')
        setNestedValue(settings, field.id, element.checked);
      else if (
        element instanceof HTMLInputElement ||
        element instanceof HTMLSelectElement ||
        element instanceof HTMLTextAreaElement
      ) {
        let value: string | number | boolean = element.value;
        if (field.type === 'select' && field.optionsSource && !field.searchable) {
          const selectedOption = (element as HTMLSelectElement).options[
            (element as HTMLSelectElement).selectedIndex
          ];
          if (selectedOption?.dataset.type === 'number') value = Number(value);
          else if (selectedOption?.dataset.type === 'boolean')
            value = value === 'true';
        }
        setNestedValue(settings, field.id, value);
      }
    }
    return settings;
  }

  validate(): { isValid: boolean; errors?: string[] } {
    const errors: string[] = [];
    const translate = this.#context.services.translationService.translate;
    for (const field of this.#fieldDescriptors) {
      if (field.required) {
        const element = this.#formElements[field.id] as
          | HTMLInputElement
          | HTMLSelectElement
          | HTMLTextAreaElement;
        if (element && !element.value.trim())
          errors.push(`${translate(field.labelKey)} is required.`);
      }
    }
    return { isValid: errors.length === 0, errors };
  }

  applyTranslations(): void {
    if (!this.#uiContainer.isConnected) return;
    const translate = this.#context.services.translationService.translate;
    
    this.#fieldDescriptors.forEach(field => {
        const formGroup = this.#uiContainer.querySelector(`[data-field-id="${field.id}"]`);
        if (!formGroup) return;

        const label = formGroup.querySelector<HTMLLabelElement>('label');
        if (label) label.textContent = translate(field.labelKey);

        const input = this.#formElements[field.id] as HTMLInputElement | HTMLTextAreaElement | undefined;
        if (input && field.placeholderKey) {
            input.placeholder = translate(field.placeholderKey);
        }

        const helpTextEl = formGroup.querySelector<HTMLElement>('.form-help-text');
        if (helpTextEl && field.helpTextKey) {
            helpTextEl.textContent = translate(field.helpTextKey);
        }

        if (field.type === 'select' && field.optionsSource) {
            const selectEl = this.#formElements[field.id] as HTMLSelectElement;
            const currentValue = selectEl.value;
            this.#populateSelectOptions(selectEl, field.optionsSource, currentValue);
        }
    });
  }

  destroy(): void {
    this.#uiContainer.innerHTML = '';
  }
}