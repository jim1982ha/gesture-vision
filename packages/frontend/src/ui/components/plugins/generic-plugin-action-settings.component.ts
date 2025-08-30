/* FILE: packages/frontend/src/ui/components/plugins/generic-plugin-action-settings.component.ts */
import { translate } from '#shared/services/translations.js';
import type {
  ActionSettingFieldDescriptor,
  ActionSettingFieldOption,
} from '#shared/index.js';
import type {
  IPluginActionSettingsComponent,
  PluginUIContext,
  CreateSearchableDropdownFn,
} from '#frontend/types/index.js';
import type { SearchableDropdown } from '../searchable-dropdown.js';

export class GenericPluginActionSettingsComponent
  implements IPluginActionSettingsComponent
{
  #pluginId: string;
  #uiContainer: HTMLDivElement;
  #fieldDescriptors: ActionSettingFieldDescriptor[];
  #context: PluginUIContext;
  #formElements: Record<string, HTMLElement> = {};
  #searchableDropdowns = new Map<string, SearchableDropdown>();
  #dependencyMap = new Map<string, string[]>();

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
    this.#uiContainer.innerHTML = '';
    this.#formElements = {};
    this.#searchableDropdowns.clear();
    const settings = currentActionSpecificSettings || {};

    this.#fieldDescriptors.forEach((field) => {
      const value = this.#getNestedValue(settings, field.id);
      const formGroup = this.#createFormGroup(field, value);
      if (formGroup) this.#uiContainer.appendChild(formGroup);
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

  #createFormGroup(
    field: ActionSettingFieldDescriptor,
    value: unknown
  ): HTMLElement | null {
    const formGroup = document.createElement('div');
    const isCheckbox = field.type === 'checkbox';
    formGroup.className = isCheckbox
      ? 'form-group form-group-checkbox-inline'
      : 'form-group';
    const label = document.createElement('label');
    label.htmlFor = `${this.#pluginId}-${field.id}`;
    label.textContent = translate(field.labelKey, { defaultValue: field.labelKey });

    if (field.type === 'select' && field.searchable) {
      formGroup.appendChild(label);
      const dropdownGroup = document.createElement('div');
      dropdownGroup.className = 'searchable-dropdown-group';
      const searchInput = document.createElement('input');
      searchInput.type = 'text';
      searchInput.id = `${this.#pluginId}-${field.id}-search`;
      searchInput.className = 'searchable-dropdown-input';
      searchInput.placeholder = translate(
        field.placeholderKey || 'filterPlaceholder'
      );
      searchInput.autocomplete = 'off';
      const valueInput = document.createElement('input');
      valueInput.type = 'hidden';
      valueInput.id = `${this.#pluginId}-${field.id}`;
      const listElement = document.createElement('div');
      listElement.className = 'dropdown-list';
      dropdownGroup.append(searchInput, valueInput, listElement);
      formGroup.appendChild(dropdownGroup);
      this.#formElements[field.id] = valueInput;

      const dropdownInstance = (
        this.#context.uiComponents
          .createSearchableDropdown as CreateSearchableDropdownFn
      )({
        inputElement: searchInput,
        listElement,
        valueElement: valueInput,
        fetchItemsFn: (filter: string) =>
          field.optionsSource
            ? field.optionsSource(
                this.#context,
                this.getActionSettingsToSave() || {},
                filter
              )
            : Promise.resolve([]),
        onItemSelectFn: () => this.#handleDependencyChange(field.id),
      });
      this.#searchableDropdowns.set(field.id, dropdownInstance);
      this.#populateInitialSearchableDropdown(
        field,
        value,
        searchInput,
        valueInput,
        dropdownInstance
      );
    } else {
      let inputElement: HTMLElement;
      switch (field.type) {
        case 'checkbox': {
          const checkbox = document.createElement('input');
          checkbox.type = 'checkbox';
          checkbox.id = `${this.#pluginId}-${field.id}`;
          checkbox.checked = !!value;
          this.#formElements[field.id] = checkbox;
          inputElement = checkbox;
          formGroup.appendChild(inputElement);
          formGroup.appendChild(label);
          break;
        }
        case 'select': {
          formGroup.appendChild(label);
          const selectWrapper = document.createElement('div');
          selectWrapper.className = 'select-wrapper';
          const select = document.createElement('select');
          select.id = `${this.#pluginId}-${field.id}`;
          select.className = 'form-control';
          this.#formElements[field.id] = select;

          if (field.optionsSource && typeof field.optionsSource === 'function') {
            field.optionsSource(this.#context, this.getActionSettingsToSave() || {})
              .then((options: ActionSettingFieldOption[]) => {
                options.forEach((opt) => {
                  const optionEl = document.createElement('option');
                  optionEl.value = opt.value;
                  optionEl.textContent = opt.label;
                  optionEl.disabled = opt.disabled || false;
                  if (String(opt.value) === String(value)) optionEl.selected = true;
                  select.appendChild(optionEl);
                });
              })
              .catch((e: Error) =>
                console.error(`Error fetching options for ${field.id}:`, e)
              );
          }
          selectWrapper.appendChild(select);
          inputElement = selectWrapper;
          formGroup.appendChild(inputElement);
          break;
        }
        case 'textarea': {
          formGroup.appendChild(label);
          const textarea = document.createElement('textarea');
          textarea.id = `${this.#pluginId}-${field.id}`;
          textarea.className = 'form-control';
          textarea.rows = field.rows || 3;
          textarea.placeholder = field.placeholderKey
            ? translate(field.placeholderKey)
            : '';
          textarea.value = typeof value === 'string' ? value : '';
          this.#formElements[field.id] = textarea;
          inputElement = textarea;
          formGroup.appendChild(inputElement);
          break;
        }
        default: {
          // text, url, password
          formGroup.appendChild(label);
          const input = document.createElement('input');
          input.type = field.type;
          input.id = `${this.#pluginId}-${field.id}`;
          input.className = 'form-control';
          input.placeholder = field.placeholderKey
            ? translate(field.placeholderKey)
            : '';
          input.value =
            typeof value === 'string' || typeof value === 'number'
              ? String(value)
              : '';
          if (field.type === 'password') input.autocomplete = 'new-password';
          this.#formElements[field.id] = input;
          inputElement = input;
          formGroup.appendChild(inputElement);
        }
      }
    }

    if (field.helpTextKey) {
      const helpText = document.createElement('small');
      helpText.textContent = translate(field.helpTextKey);
      formGroup.appendChild(helpText);
    }
    return formGroup;
  }

  async #populateInitialSearchableDropdown(
    field: ActionSettingFieldDescriptor,
    value: unknown,
    searchInput: HTMLInputElement,
    valueInput: HTMLInputElement,
    dropdown: SearchableDropdown
  ): Promise<void> {
    if (value === null || value === undefined) {
      dropdown.refresh();
      return;
    }
    valueInput.value = String(value);
    const options = field.optionsSource
      ? await field.optionsSource(
          this.#context,
          this.getActionSettingsToSave() || {},
          ''
        )
      : [];
    const selectedOption = options.find((opt: ActionSettingFieldOption) => opt.value === value);
    if (selectedOption) searchInput.value = selectedOption.label;
    dropdown.refresh();
  }

  #handleDependencyChange(changedFieldId: string): void {
    const dependents = this.#dependencyMap.get(changedFieldId);
    if (dependents) {
      dependents.forEach((dependentId) => {
        const dropdown = this.#searchableDropdowns.get(dependentId);
        const valueInput = this.#formElements[dependentId] as HTMLInputElement;
        const searchInput =
          this.#uiContainer.querySelector<HTMLInputElement>(
            `#${this.#pluginId}-${dependentId}-search`
          );
        if (dropdown && valueInput && searchInput) {
          valueInput.value = '';
          searchInput.value = '';
          dropdown.refresh(false);
        }
      });
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
    this.#fieldDescriptors.forEach((field) => {
      const label = this.#uiContainer.querySelector<HTMLLabelElement>(
        `label[for="${this.#pluginId}-${field.id}"]`
      );
      if (label) label.textContent = translate(field.labelKey);

      let elToUpdate: HTMLElement | null | undefined = this.#formElements[field.id];
      if (this.#searchableDropdowns.has(field.id)) {
        this.#searchableDropdowns.get(field.id)?.applyTranslations?.();
        return;
      }
      if (elToUpdate?.classList.contains('select-wrapper'))
        elToUpdate = elToUpdate.querySelector('select');
      const input = elToUpdate as
        | HTMLInputElement
        | HTMLTextAreaElement
        | undefined;
      if (input && field.placeholderKey)
        input.placeholder = translate(field.placeholderKey);

      const helpTextEl = this.#uiContainer.querySelector<HTMLElement>(
        `#${this.#pluginId}-${field.id} ~ small`
      );
      if (helpTextEl && field.helpTextKey)
        helpTextEl.textContent = translate(field.helpTextKey);
    });
  }

  destroy(): void {
    this.#uiContainer.innerHTML = '';
  }
}