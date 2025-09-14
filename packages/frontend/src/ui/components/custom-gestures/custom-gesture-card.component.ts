/* FILE: packages/frontend/src/ui/components/custom-gestures/custom-gesture-card.component.ts */
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

    constructor(
        definition: CustomGestureMetadata,
        context: PluginUIContext,
        isEditing: boolean
    ) {
        this.context = context;
        this.#definition = definition;

        const actionButtons: ActionButtonConfig[] = isEditing ? [] : [{
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
        
        if (isEditing) {
            this.cardElement.classList.add('is-editing-highlight');
            this.renderForm();
        } else {
            this.renderView();
        }
    }
    
    public getElement = (): HTMLElement => this.cardElement;

    public applyTranslations(): void {
        const translate = this.context.services.translationService.translate;
        
        // Update title and tooltip which are part of the card shell
        const titleEl = this.cardElement.querySelector('.card-title');
        if (titleEl) titleEl.textContent = this.#definition.name;
        this.cardElement.title = translate('editTooltip', { item: this.#definition.name });

        if (this.cardElement.querySelector('form')) {
            // In edit mode, update form labels and buttons
            const nameLabel = this.cardElement.querySelector('label[for$="-name"]');
            if (nameLabel) nameLabel.textContent = translate('nameLabel');
            
            const descLabel = this.cardElement.querySelector('label[for$="-desc"]');
            if (descLabel) descLabel.textContent = translate('descriptionOptionalLabel');

            const cancelBtnText = this.cardElement.querySelector('.cancel-edit-btn span:not(.material-icons)');
            if (cancelBtnText) cancelBtnText.textContent = translate('cancel');
            
            const saveBtnText = this.cardElement.querySelector('.save-edit-btn span:not(.material-icons)');
            if (saveBtnText) saveBtnText.textContent = translate('save');
        } else {
            // In view mode, update the description (if it's rendered)
            this.renderView(); // Easiest way to re-translate the description part
        }

        // Always update action buttons
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
}