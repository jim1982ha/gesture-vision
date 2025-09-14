/* FILE: packages/frontend/src/ui/components/base-editable-card.component.ts */
import type { PluginUIContext } from '#frontend/types/index.js';
import { EditableCard } from './editable-card.js';
import { createCardElement, createButton, type CardFooterConfig, type ActionButtonConfig } from '#frontend/ui/utils/card-utils.js';
import type { Substitutions } from '#shared/services/translations.js';
import { pubsub, UI_EVENTS } from '#shared/index.js';

type TranslateFn = (key: string, substitutions?: Substitutions) => string;

/**
 * An abstract base class for creating card components with view and edit modes.
 * It handles the common DOM structure, state management via EditableCard utility,
 * and provides abstract methods for subclasses to implement specific content and logic.
 */
export abstract class BaseEditableCardComponent<TConfig extends object> {
    protected cardElement: HTMLDivElement;
    protected viewWrapper!: HTMLDivElement;
    protected formElement!: HTMLFormElement;
    protected formFieldsContainer!: HTMLDivElement;
    public editableCard: EditableCard;

    protected context: PluginUIContext;
    protected translate: TranslateFn;
    protected initialConfig: TConfig | null = null;
    protected onEditStateChange: (isEditing: boolean) => void;
    
    constructor(
        context: PluginUIContext,
        cardShellContent: {
            id: string,
            title: string,
            iconName: string,
            iconType?: 'material-icons' | 'mdi',
            itemClasses?: string,
            titleAttribute?: string,
            datasetAttributes?: Record<string, string>,
            actionButtons?: ActionButtonConfig[],
            footerConfig?: CardFooterConfig
        },
        onEditStateChange: (isEditing: boolean) => void = () => {}
    ) {
        this.context = context;
        this.translate = context.services.translationService.translate;
        this.onEditStateChange = onEditStateChange;

        this.cardElement = createCardElement({
            ...cardShellContent,
            detailsHtml: '', // Details will be populated programmatically.
            translate: this.translate
        });
        this.cardElement.id = cardShellContent.id;

        this.setupCardInternals();
        
        this.editableCard = new EditableCard({
            cardElement: this.cardElement,
            viewElementsContainer: this.viewWrapper,
            formElement: this.formElement,
            saveButton: this.formElement.querySelector('.save-btn'),
            cancelButton: this.formElement.querySelector('.cancel-btn'),
            onEnterEditMode: () => {
                this.populateForm(this.initialConfig);
                this.onEditStateChange(true);
            },
            onSave: this.handleSave,
            onCancel: this.handleCancel
        });
    }

    private setupCardInternals(): void {
        const detailsContainer = this.cardElement.querySelector('.card-details');
        if (!detailsContainer) {
            throw new Error(`[BaseEditableCard] Could not find .card-details in created card shell for ID: ${this.cardElement.id}`);
        }

        this.viewWrapper = document.createElement('div');
        this.viewWrapper.className = 'plugin-view-content-wrapper';

        this.formElement = document.createElement('form');
        this.formElement.className = 'plugin-global-settings-form hidden';
        this.formElement.onsubmit = () => false;

        const saveButton = createButton({ action: 'save', textKey: 'save', iconKey: 'UI_SAVE', extraClasses: ['btn-primary', 'save-btn'], translate: this.translate });
        const cancelButton = createButton({ action: 'cancel', textKey: 'cancel', iconKey: 'UI_CANCEL', extraClasses: ['btn-secondary', 'cancel-btn'], translate: this.translate });
        
        this.formElement.innerHTML = `
            <div class="form-fields-container"></div>
            <div class="mt-4 flex justify-end gap-2">${cancelButton.outerHTML}${saveButton.outerHTML}</div>
        `;

        detailsContainer.appendChild(this.viewWrapper);
        detailsContainer.appendChild(this.formElement);

        this.formFieldsContainer = this.formElement.querySelector('.form-fields-container') as HTMLDivElement;
    }

    protected handleSave = async (): Promise<boolean> => {
        const success = true; // Default success, subclasses should override with actual save logic.
        if (success) {
            this.onEditStateChange(false);
        }
        return success;
    };

    protected handleCancel = (): void => {
        this.populateForm(this.initialConfig);
        pubsub.publish(UI_EVENTS.SHOW_NOTIFICATION, { messageKey: "changesDiscarded", type: "info", duration: 2000 });
        this.onEditStateChange(false);
    };

    public getElement = (): HTMLElement => this.cardElement;
    
    public destroy(): void {
        this.cardElement.remove();
    }

    // --- Abstract methods for subclasses to implement ---
    protected abstract renderViewContent(): void;
    protected abstract renderFormFields(): void;
    protected abstract getFormValues(): TConfig;
    protected abstract populateForm(config: TConfig | null): void;
    public abstract applyTranslations(): void;
    public abstract update(config: TConfig | null, context: PluginUIContext, extraState: { isEditing?: boolean }): void;
}