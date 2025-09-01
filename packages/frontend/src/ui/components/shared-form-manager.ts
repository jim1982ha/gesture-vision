/* FILE: packages/frontend/src/ui/components/shared-form-manager.ts */
import { setElementVisibility } from '#frontend/ui/helpers/index.js';

interface SharedFormManagerConfig {
  formContainer: HTMLElement;
  listContainer: HTMLElement;
  addNewButton: HTMLElement;
  onEnterAddMode: () => void;
  onEnterEditMode: (index: number) => void;
  onSave: () => Promise<boolean> | boolean;
  onCancel: () => void;
}

export class SharedFormManager {
  #config: SharedFormManagerConfig;
  #isFormVisible = false;
  #editingIndex: number | null = null;

  constructor(config: SharedFormManagerConfig) {
    this.#config = config;
    this.#toggleFormVisibility(false); // Initial state
  }

  public startNew(): void {
    this.#editingIndex = null;
    this.#toggleFormVisibility(true);
    this.#config.onEnterAddMode();
  }

  public startEdit(index: number): void {
    this.#editingIndex = index;
    this.#toggleFormVisibility(true);
    this.#config.onEnterEditMode(index);
  }

  public async save(): Promise<void> {
    const success = await Promise.resolve(this.#config.onSave());
    if (success) {
      this.cancel();
    }
  }

  public cancel(): void {
    this.#editingIndex = null;
    this.#toggleFormVisibility(false);
    this.#config.onCancel();
  }

  #toggleFormVisibility(show: boolean): void {
    this.#isFormVisible = show;
    setElementVisibility(this.#config.formContainer, show);
    setElementVisibility(this.#config.listContainer, !show, 'grid');
    setElementVisibility(this.#config.addNewButton, !show, 'flex');
  }

  public isEditing(): boolean {
    return this.#isFormVisible;
  }

  public getEditingIndex(): number | null {
    return this.#editingIndex;
  }
}