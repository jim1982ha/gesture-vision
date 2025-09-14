/* FILE: packages/frontend/src/ui/components/custom-gestures/custom-gesture-card.component.ts */
import { pubsub, UI_EVENTS, WEBSOCKET_EVENTS, type CustomGestureMetadata, type UpdateCustomGesturePayload, type UpdateCustomGestureAckPayload } from '#shared/index.js';
import type { PluginUIContext } from '#frontend/types/index.js';
import { getGestureCategoryIconDetails, setIcon } from '#frontend/ui/helpers/index.js';
import { webSocketService } from '#frontend/services/websocket-service.js';
import { BaseEditableCardComponent } from '../base-editable-card.component.js';

/**
 * A component that renders and manages a single editable card for a custom gesture.
 * It encapsulates its own view and edit states.
 */
export class CustomGestureCardComponent extends BaseEditableCardComponent<CustomGestureMetadata> {
    #definition: CustomGestureMetadata;

    constructor(
        definition: CustomGestureMetadata,
        context: PluginUIContext,
        onDelete: () => void,
        onEditStateChange: (isEditing: boolean) => void
    ) {
        super(context, {
            id: `custom-gesture-card-${definition.id}`,
            title: definition.name,
            ...getGestureCategoryIconDetails(definition.type === 'pose' ? 'CUSTOM_POSE' : 'CUSTOM_HAND'),
            itemClasses: 'config-item card-item-clickable custom-gesture-card',
            datasetAttributes: { gestureId: definition.id, gestureName: definition.name },
            titleAttribute: context.services.translationService.translate('editTooltip', { item: definition.name }),
            actionButtons: [{
                action: 'delete', titleKey: 'deleteTooltip', iconKey: 'UI_DELETE',
                extraClasses: ['btn-icon-danger', 'delete-btn'], translate: context.services.translationService.translate
            }]
        }, onEditStateChange);

        this.#definition = definition;
        this.initialConfig = definition;

        this.cardElement.querySelector('.delete-btn')?.addEventListener('click', (e) => {
            e.stopPropagation();
            onDelete();
        });

        this.renderFormFields();
        this.renderViewContent();
    }
    
    public update(config: CustomGestureMetadata | null, context: PluginUIContext, extraState: { isEditing?: boolean }): void {
        this.context = context;
        if (JSON.stringify(this.initialConfig) !== JSON.stringify(config)) {
            this.initialConfig = config;
            if (config) this.#definition = config;
        }

        if (this.editableCard) {
            if (extraState.isEditing) {
                this.editableCard.switchToEditMode();
            } else {
                this.editableCard.switchToViewMode();
            }
        }
    }

    protected renderViewContent(): void {
        const descIcon = document.createElement('span');
        setIcon(descIcon, 'UI_NOTES');
        descIcon.className = 'material-icons card-detail-icon';
        this.viewWrapper.innerHTML = `<div class="card-detail-line">${descIcon.outerHTML}<span class="card-detail-value allow-wrap">${this.#definition.description || ''}</span></div>`;
    }

    protected renderFormFields(): void {
        this.formFieldsContainer.innerHTML = `
            <div class="form-group">
                <label for="${this.cardElement.id}-name" class="form-label">${this.translate('nameLabel')}</label>
                <input type="text" id="${this.cardElement.id}-name" class="form-control" value="${this.#definition.name}">
            </div>
            <div class="form-group">
                <label for="${this.cardElement.id}-desc" class="form-label">${this.translate('descriptionOptionalLabel')}</label>
                <textarea id="${this.cardElement.id}-desc" class="form-control" rows="2">${this.#definition.description || ''}</textarea>
            </div>
        `;
    }

    protected getFormValues(): CustomGestureMetadata {
        const newName = (this.formElement.querySelector<HTMLInputElement>(`#${this.cardElement.id}-name`)?.value || '').trim();
        const newDescription = (this.formElement.querySelector<HTMLTextAreaElement>(`#${this.cardElement.id}-desc`)?.value || '').trim();
        return { ...this.#definition, name: newName, description: newDescription };
    }

    protected populateForm(config: CustomGestureMetadata | null): void {
        const nameInput = this.formElement.querySelector<HTMLInputElement>(`#${this.cardElement.id}-name`);
        const descTextarea = this.formElement.querySelector<HTMLTextAreaElement>(`#${this.cardElement.id}-desc`);
        if (nameInput) nameInput.value = config?.name || '';
        if (descTextarea) descTextarea.value = config?.description || '';
    }

    protected handleSave = async (): Promise<boolean> => {
        const newValues = this.getFormValues();
        if (!newValues.name) {
            pubsub.publish(UI_EVENTS.SHOW_ERROR, { messageKey: "customGestureNameReq" });
            return false;
        }
        const payload: UpdateCustomGesturePayload = { id: this.#definition.id, oldName: this.#definition.name, newName: newValues.name, newDescription: newValues.description || '' };
        const result = await webSocketService.request<UpdateCustomGestureAckPayload>(WEBSOCKET_EVENTS.UPDATE_CUSTOM_GESTURE, payload);
        
        if (result.success && result.updatedDefinition) {
            this.#definition = result.updatedDefinition;
            this.initialConfig = result.updatedDefinition;
            this.renderViewContent();
            this.onEditStateChange(false); // Notify parent that edit is complete
        }
        return result.success;
    };

    public applyTranslations(): void {
        const titleEl = this.cardElement.querySelector<HTMLElement>('.card-title');
        if (titleEl) titleEl.textContent = this.#definition.name; // Name is not translatable
        this.renderFormFields();
        this.renderViewContent();
    }
}