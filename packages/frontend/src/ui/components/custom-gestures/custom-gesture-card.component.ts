/* FILE: extensions/plugins/gesture-vision-plugin-gesture-studio/frontend/ui/components/custom-gestures/custom-gesture-card.component.ts */
import { getGestureCategoryIconDetails, setIcon } from '#frontend/ui/helpers/index.js';
import { createCardElement, type ActionButtonConfig } from '#frontend/ui/helpers/card-utils.js';
import type { CustomGestureMetadata } from '#shared/index.js';
import type { PluginUIContext } from '#frontend/types/index.js';

/**
 * A component that renders a single card for a custom gesture.
 * It can render in either a "view" or "edit" state, determined by the parent.
 */
export class CustomGestureCardComponent {
    public cardElement: HTMLDivElement;
    protected context: PluginUIContext;
    #definition: CustomGestureMetadata;
    #isEditing = false;

    constructor(
        definition: CustomGestureMetadata,
        context: PluginUIContext,
        isEditing: boolean
    ) {
        this.context = context;
        this.#definition = definition;
        this.#isEditing = isEditing;

        const actionButtons: ActionButtonConfig[] = [{
            action: 'delete', titleKey: 'deleteTooltip', iconKey: 'UI_DELETE_FOREVER',
            extraClasses: ['btn-icon-danger', 'delete-btn'], translate: context.services.translationService.translate
        }];

        this.cardElement = createCardElement({
            title: definition.name,
            ...getGestureCategoryIconDetails(definition.type === 'pose' ? 'CUSTOM_POSE' : 'CUSTOM_HAND'),
            itemClasses: 'config-item card-item-clickable custom-gesture-card',
            datasetAttributes: { gestureId: definition.id, gestureName: definition.name },
            titleAttribute: context.services.translationService.translate('editTooltip', { item: definition.name }),
            actionButtons: actionButtons,
            translate: context.services.translationService.translate
        });
        this.cardElement.id = `custom-gesture-card-${definition.id}`;
        
        // FIX: The component now manages its own state from creation.
        if (this.#isEditing) {
            this.switchToEditMode();
        } else {
            this.switchToViewMode(); // This will call renderView()
        }
    }
    
    public getElement = (): HTMLElement => this.cardElement;
    
    public isEditing = (): boolean => this.#isEditing;

    public applyTranslations(): void {
        const translate = this.context.services.translationService.translate;
        
        const titleEl = this.cardElement.querySelector('.card-title');
        if (titleEl) titleEl.textContent = this.#definition.name;
        this.cardElement.title = translate('editTooltip', { item: this.#definition.name });

        if (this.#isEditing) {
            this.renderForm();
        } else {
            this.renderView();
        }

        const deleteBtn = this.cardElement.querySelector<HTMLButtonElement>('.delete-btn');
        if (deleteBtn) deleteBtn.title = translate('deleteTooltip', { item: this.#definition.name });
    }

    private renderView(): void {
        const detailsContainer = this.cardElement.querySelector('.card-details');
        if (!detailsContainer) return;
        
        const descIcon = document.createElement('span');
        setIcon(descIcon, 'UI_NOTES');
        descIcon.className = 'material-icons card-detail-icon';
        detailsContainer.innerHTML = `<div class="card-detail-line">${descIcon.outerHTML}<span class="card-detail-value allow-wrap">${this.#definition.description || ''}</span></div>`;
    }

    private renderForm(): void {
        const detailsContainer = this.cardElement.querySelector('.card-details');
        if (!detailsContainer) return;

        detailsContainer.innerHTML = `
            <form class="plugin-global-settings-form">
                <div class="form-group">
                    <label for="${this.cardElement.id}-name" class="form-label">${this.context.services.translationService.translate('nameLabel')}</label>
                    <input type="text" id="${this.cardElement.id}-name" class="form-control" value="${this.#definition.name}">
                </div>
                <div class="form-group">
                    <label for="${this.cardElement.id}-desc" class="form-label">${this.context.services.translationService.translate('descriptionOptionalLabel')}</label>
                    <textarea id="${this.cardElement.id}-desc" class="form-control" rows="2">${this.#definition.description || ''}</textarea>
                </div>
                <div class="mt-4 flex justify-end gap-2">
                    <button type="button" class="btn btn-secondary cancel-edit-btn">
                        <span class="material-icons"></span><span>${this.context.services.translationService.translate('cancel')}</span>
                    </button>
                    <button type="button" class="btn btn-primary save-edit-btn">
                        <span class="material-icons"></span><span>${this.context.services.translationService.translate('save')}</span>
                    </button>
                </div>
            </form>
        `;
        setIcon(detailsContainer.querySelector('.cancel-edit-btn'), 'UI_CANCEL');
        setIcon(detailsContainer.querySelector('.save-edit-btn'), 'UI_SAVE');
    }
    
    public switchToEditMode(): void {
        if (this.#isEditing) return;
        this.#isEditing = true;
        this.cardElement.classList.add("is-editing-highlight");
        this.renderForm();
        const firstInput = this.cardElement.querySelector<HTMLInputElement>('input, textarea');
        firstInput?.focus();
    }

    public switchToViewMode(): void {
        this.#isEditing = false; // Always update state regardless of previous state
        this.cardElement.classList.remove("is-editing-highlight");
        this.renderView();
    }
}