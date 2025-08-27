/* FILE: packages/frontend/src/ui/components/gesture-form/gesture-select-manager.ts */
import type { AppStore } from '#frontend/core/state/app-store.js';
import { DEFAULT_GESTURE_SELECT_VALUE } from '#frontend/constants/app-defaults.js';
import {
  BUILT_IN_HAND_GESTURES,
  type GestureCategoryIconType,
} from '#shared/constants/index.js';
import { translate } from '#shared/services/translations.js';
import {
  formatGestureNameForDisplay,
  getGestureCategoryIconDetails,
} from '#frontend/ui/helpers/index.js';

import type { GestureConfig, PoseConfig } from '#shared/types/index.js';

interface OptionData {
  name: string;
  type: GestureCategoryIconType;
}

export class GestureSelectManager {
  #selectElement: HTMLSelectElement | null;
  #appStore: AppStore;
  #unsubscribeStore: () => void;
  #editingGestureName: string | null = null;

  constructor(selectElement: HTMLSelectElement | null, appStore: AppStore) {
    this.#selectElement = selectElement;
    this.#appStore = appStore;

    this.#unsubscribeStore = this.#appStore.subscribe(() => this.render());
    this.render();
  }

  public destroy(): void {
    this.#unsubscribeStore();
  }

  public setEditingGestureName(name: string | null): void {
    this.#editingGestureName = name;
    this.render();
  }

  public render(): void {
    const select = this.#selectElement;
    if (!select) return;

    const state = this.#appStore.getState();
    const currentConfigs = state.gestureConfigs || [];
    const isEditing = !!this.#editingGestureName;

    const usedGestureNames = new Set<string>(
      currentConfigs
        .map((c: GestureConfig | PoseConfig) =>
          'gesture' in c ? c.gesture : c.pose
        )
        .filter(Boolean) as string[]
    );

    const availableOptions = this.#gatherAvailableOptions(
      usedGestureNames,
      isEditing,
      this.#editingGestureName
    );
    this.#renderOptions(
      select,
      availableOptions,
      isEditing,
      this.#editingGestureName
    );
  }

  #gatherAvailableOptions(
    usedNames: Set<string>,
    isEditing: boolean,
    nameBeingEdited: string | null
  ): OptionData[] {
    const options: OptionData[] = [];
    const state = this.#appStore.getState();

    const addOption = (name: string, type: GestureCategoryIconType) => {
      if (name === nameBeingEdited || !usedNames.has(name)) {
        options.push({ name, type });
      }
    };

    if (
      state.enableBuiltInHandGestures ||
      (isEditing &&
        nameBeingEdited &&
        (BUILT_IN_HAND_GESTURES as readonly string[]).includes(nameBeingEdited))
    ) {
      BUILT_IN_HAND_GESTURES.forEach((name: string) => {
        if (
          name !== 'NONE' &&
          (state.enableBuiltInHandGestures || name === nameBeingEdited)
        )
          addOption(name, 'BUILT_IN_HAND');
      });
    }

    const customMeta = state.customGestureMetadataList || [];
    customMeta.forEach((meta) => {
      if (meta.type === 'pose') {
        if (state.enablePoseProcessing || meta.name === nameBeingEdited)
          addOption(meta.name, 'CUSTOM_POSE');
      } else {
        if (state.enableCustomHandGestures || meta.name === nameBeingEdited)
          addOption(meta.name, 'CUSTOM_HAND');
      }
    });

    return options.sort((a, b) => a.name.localeCompare(b.name));
  }

  #renderOptions(
    select: HTMLSelectElement,
    options: OptionData[],
    isEditing: boolean,
    nameBeingEdited: string | null
  ): void {
    const state = this.#appStore.getState();
    const valueToPreserve = isEditing ? nameBeingEdited : select.value;
    select.innerHTML = '';

    const placeholderKey =
      options.length === 0 && !isEditing
        ? !state.enableBuiltInHandGestures &&
          !state.enableCustomHandGestures &&
          !state.enablePoseProcessing
          ? 'selectFeaturePlaceholder'
          : 'allGesturesConfiguredPlaceholder'
        : 'selectGesture';

    const placeholder = document.createElement('option');
    placeholder.value = DEFAULT_GESTURE_SELECT_VALUE;
    placeholder.textContent = translate(placeholderKey);
    placeholder.disabled = true;
    select.appendChild(placeholder);

    options.forEach((opt) => {
      const optionEl = document.createElement('option');
      const iconDetails = getGestureCategoryIconDetails(opt.type);
      const formattedName = formatGestureNameForDisplay(opt.name);
      const displayName = translate(formattedName, { defaultValue: formattedName });

      optionEl.value = opt.name;
      optionEl.dataset.gestureType = opt.type;
      optionEl.textContent = `${iconDetails.defaultEmoji} ${displayName}`;
      select.appendChild(optionEl);
    });

    const finalValue = [
      valueToPreserve,
      nameBeingEdited,
      DEFAULT_GESTURE_SELECT_VALUE,
    ].find((val) => val && select.querySelector(`option[value="${CSS.escape(val)}"]`));
    select.value = finalValue || DEFAULT_GESTURE_SELECT_VALUE;
    if (select.value === DEFAULT_GESTURE_SELECT_VALUE)
      placeholder.selected = true;
  }

  public getSelectedValue(): { name: string; type?: GestureCategoryIconType } | null {
    if (
      !this.#selectElement ||
      this.#selectElement.value === DEFAULT_GESTURE_SELECT_VALUE
    )
      return null;
    const selectedOption =
      this.#selectElement.options[this.#selectElement.selectedIndex];
    return {
      name: selectedOption.value,
      type: selectedOption.dataset.gestureType as
        | GestureCategoryIconType
        | undefined,
    };
  }

  public setValue(name: string | null): void {
    if (this.#selectElement) {
      this.#selectElement.value = name || DEFAULT_GESTURE_SELECT_VALUE;
    }
  }
}