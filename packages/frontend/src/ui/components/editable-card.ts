/* FILE: packages/frontend/src/ui/components/editable-card.ts */
// Utility for managing cards with view and edit states.

interface EditableCardConfig {
  cardElement: HTMLElement | null;
  viewElementsContainer: HTMLElement | null;
  formElement: HTMLFormElement | null;
  saveButton: HTMLButtonElement | null;
  cancelButton: HTMLButtonElement | null;
  onEnterEditMode?: () => void;
  onSave: () => Promise<boolean> | boolean; // Can be async or sync
  onCancel?: () => void; 
}

/**
 * Manages the display state (view/edit) for a card-like UI component.
 */
export class EditableCard {
  #cardElement: HTMLElement;
  #viewElementsContainer: HTMLElement | null; 
  #formElement: HTMLFormElement | null; 
  #saveButton: HTMLButtonElement | null;
  #cancelButton: HTMLButtonElement | null;
  #isEditing = false;
  #onEnterEditMode?: () => void; 
  #onSave: () => Promise<boolean> | boolean; 
  #onCancel?: () => void; 

  constructor({
    cardElement,
    viewElementsContainer,
    formElement,
    saveButton,
    cancelButton,
    onEnterEditMode,
    onSave,
    onCancel,
  }: EditableCardConfig) { // Destructure config with type
    // Initialize properties to satisfy strictPropertyInitialization
    this.#cardElement = cardElement!;
    this.#viewElementsContainer = viewElementsContainer;
    this.#formElement = formElement;
    this.#saveButton = saveButton;
    this.#cancelButton = cancelButton;
    this.#onEnterEditMode = onEnterEditMode;
    this.#onSave = onSave;
    this.#onCancel = onCancel;
    
    if (
      !cardElement || !viewElementsContainer || !formElement || !saveButton || !cancelButton || typeof onSave !== "function"
    ) {
      console.error(
        "[EditableCard] Insufficient elements or missing onSave callback provided to constructor for card:",
        cardElement?.id
      );
      // Don't throw, but prevent event listeners from being attached.
      return;
    }

    this.#attachEventListeners();
    this.switchToViewMode(); 
  }

  #attachEventListeners(): void {
    if (this.#cardElement.classList.contains("card-item-clickable")) {
      this.#cardElement.addEventListener("click", (event: MouseEvent) => { 
        const target = event.target as HTMLElement;
        if (target.closest(".btn")) {
          return;
        }
        if (!this.#isEditing) {
          this.switchToEditMode();
        }
      });
    }

    this.#saveButton?.addEventListener("click", this.#handleSave);
    this.#cancelButton?.addEventListener("click", this.#handleCancel);
  }

  #handleSave = async (): Promise<void> => {
    let saveSuccessful = false;
    try {
      saveSuccessful = await Promise.resolve(this.#onSave()); // Ensure it works with sync/async onSave
    } catch (error: unknown) {
      console.error(
        `[EditableCard ${this.#cardElement.id}] Error during onSave callback:`,
        error
      );
      saveSuccessful = false;
    }

    if (saveSuccessful) {
      this.switchToViewMode();
    }
  };

  #handleCancel = (): void => {
    if (typeof this.#onCancel === "function") {
      this.#onCancel();
    }
    this.switchToViewMode();
  };

  switchToEditMode(): void {
    if (this.#isEditing || !this.#viewElementsContainer || !this.#formElement) return;
    this.#isEditing = true; 
    this.#cardElement.classList.add("is-editing-highlight");
    this.#viewElementsContainer.classList.add("hidden");
    this.#viewElementsContainer.style.display = "none";
    this.#formElement.classList.remove("hidden");
    this.#formElement.style.display = ""; // Or "" to revert to CSS default

    const firstInput = this.#formElement.querySelector<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(
      'input:not([type="hidden"]), select, textarea'
    );
    if (firstInput instanceof HTMLElement) {
      firstInput.focus();
    }
    if (typeof this.#onEnterEditMode === "function") {
      this.#onEnterEditMode();
    }
  }

  switchToViewMode(): void {
    if (!this.#viewElementsContainer || !this.#formElement) return;
    this.#isEditing = false;
    this.#cardElement.classList.remove("is-editing-highlight");
    this.#viewElementsContainer.classList.remove("hidden");
    this.#viewElementsContainer.style.display = ""; 
    this.#formElement.classList.add("hidden");
    this.#formElement.style.display = "none";
  }

  isEditing(): boolean {
    return this.#isEditing;
  }
}