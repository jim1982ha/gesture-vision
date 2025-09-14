/* FILE: packages/frontend/src/ui/helpers/form-renderer.ts */
import { createFromTemplate } from '#frontend/ui/helpers/template-renderer.js';
import type { ActionSettingFieldDescriptor } from '#shared/index.js';
import type { PluginUIContext } from '#frontend/types/index.js';
import type { TranslationService } from '#frontend/services/translation.service.js';

/**
 * Creates a single form group element from a field descriptor.
 * @param field - The descriptor for the form field.
 * @param pluginId - A unique ID prefix for element IDs.
 * @param translate - The translation function.
 * @returns An HTMLElement representing the form group.
 */
export function createFormField(
  field: ActionSettingFieldDescriptor,
  pluginId: string,
  translate: TranslationService['translate']
): HTMLElement {
  const isCheckbox = field.type === 'checkbox';
  const controlId = `${pluginId}-${field.id.replace(/\./g, '-')}`;

  const labelHtml = `<label for="${controlId}" class="form-label">${translate(field.labelKey)}</label>`;
  
  let controlHtml: string;
  const placeholder = field.placeholderKey ? `placeholder="${translate(field.placeholderKey)}"` : '';
  const autocomplete = field.autocomplete || 'off';

  if (isCheckbox) {
    controlHtml = `<input type="checkbox" id="${controlId}" class="form-checkbox">`;
  } else if (field.type === 'select') {
    controlHtml = `<select id="${controlId}" class="form-control"></select>`;
  } else if (field.type === 'textarea') {
    const rows = field.rows || 3;
    controlHtml = `<textarea id="${controlId}" class="form-control" rows="${rows}" ${placeholder}></textarea>`;
  } else {
    // Default to a standard input for types like 'text', 'url', 'password', etc.
    controlHtml = `<input type="${field.type}" id="${controlId}" class="form-control" ${placeholder} autocomplete="${autocomplete}">`;
  }

  const helpTextHtml = field.helpTextKey ? `<small class="form-help-text">${translate(field.helpTextKey)}</small>` : '';
  const baseClasses = isCheckbox ? 'form-group form-group-checkbox-inline' : 'form-group';
  
  const finalHtml = isCheckbox
    ? `<div class="${baseClasses}" data-field-id="${field.id}">${controlHtml}${labelHtml}</div>`
    : `<div class="${baseClasses}" data-field-id="${field.id}">${labelHtml}${controlHtml}${helpTextHtml}</div>`;

  return createFromTemplate(finalHtml, {})!;
}

/**
 * Renders a full set of form fields into a container based on descriptors.
 * Handles special layouts like two-column rows.
 * @param container - The parent element to render the fields into.
 * @param fieldDescriptors - An array of field descriptors.
 * @param pluginId - A unique ID prefix.
 * @param context - The plugin UI context.
 * @returns A map of field IDs to their corresponding HTML Elements.
 */
export function renderFormFields(
    container: HTMLElement,
    fieldDescriptors: ActionSettingFieldDescriptor[],
    pluginId: string,
    context: PluginUIContext
): Record<string, HTMLElement> {
    container.innerHTML = '';
    const formElements: Record<string, HTMLElement> = {};
    const translate = context.services.translationService.translate;

    let i = 0;
    while (i < fieldDescriptors.length) {
        const field = fieldDescriptors[i];
        const nextField = fieldDescriptors[i + 1];

        if (field.id.includes('username') && nextField?.id.includes('password')) {
            const row = document.createElement('div');
            row.className = 'form-row';
            row.appendChild(createFormField(field, pluginId, translate));
            row.appendChild(createFormField(nextField, pluginId, translate));
            container.appendChild(row);
            i += 2;
        } else {
            container.appendChild(createFormField(field, pluginId, translate));
            i++;
        }
    }

    fieldDescriptors.forEach(field => {
        const controlId = `${pluginId}-${field.id.replace(/\./g, '-')}`;
        const element = container.querySelector<HTMLElement>(`#${controlId}`);
        if (element) {
            formElements[field.id] = element;
        }
    });

    return formElements;
}