/* FILE: packages/frontend/src/ui/components/searchable-dropdown.ts */
// Generic utility for creating and managing a searchable dropdown.
import type { TranslationService } from '#frontend/services/translation.service.js';

interface DropdownItem {
    value: string;
    label: string;
    disabled?: boolean;
}

interface SearchableDropdownConfig {
    inputElement: HTMLInputElement;
    listElement: HTMLElement; 
    valueElement: HTMLInputElement; 
    fetchItemsFn: (filterText: string) => Promise<DropdownItem[]>;
    onItemSelectFn: (value: string, label: string) => void;
    translationService: TranslationService;
    inputPlaceholder?: string;
    disabledPlaceholder?: string;
}

export interface SearchableDropdown {
    refresh: () => Promise<void>;
    setDisabled: (isDisabled: boolean, newPlaceholderText?: string) => void;
    applyTranslations?: () => void;
}

function renderDropdownListItems(
    listElement: HTMLElement, 
    items: DropdownItem[], 
    onItemSelectCallback: (value: string, label: string) => void,
    inputToBlurOnSelect: HTMLInputElement,
    translationService: TranslationService
): void {
  if (!listElement) return;
  listElement.innerHTML = ""; 

  if (!items || items.length === 0) {
    const placeholderDiv = document.createElement("div");
    placeholderDiv.textContent = translationService.translate("noItemsToDisplay");
    placeholderDiv.classList.add("dropdown-list-item", "disabled");
    listElement.appendChild(placeholderDiv);
    return;
  }

  items.forEach((item) => {
    const itemButton = document.createElement("button");
    itemButton.type = "button";
    itemButton.textContent = item.label;
    itemButton.dataset.value = item.value;
    itemButton.className = "btn btn-secondary w-full justify-start";
    
    if (item.disabled) {
      itemButton.disabled = true;
      itemButton.setAttribute("aria-disabled", "true");
    } else {
      itemButton.setAttribute("role", "option");
      itemButton.addEventListener("mousedown", (e: MouseEvent) => {
        e.preventDefault(); 
        onItemSelectCallback(item.value, item.label);
        inputToBlurOnSelect.blur(); 
      });
    }
    listElement.appendChild(itemButton);
  });
}

function showDropdown(listElement: HTMLElement | null, show: boolean): void {
  if (listElement) {
    listElement.classList.toggle("visible", show);
    listElement.setAttribute("aria-hidden", String(!show));
  }
}

export function createSearchableDropdown(config: SearchableDropdownConfig): SearchableDropdown {
  const { inputElement, listElement, valueElement, fetchItemsFn, onItemSelectFn, translationService, inputPlaceholder = "filterPlaceholder", disabledPlaceholder = "Not available" } = config;
  const currentInputPlaceholderKey = inputPlaceholder;
  let currentDisabledPlaceholderKey = disabledPlaceholder;

  const refreshList = async (): Promise<void> => {
    const filterText = inputElement.value.trim().toLowerCase();
    try {
      const items = await fetchItemsFn(filterText);
      renderDropdownListItems(listElement, items, (value, label) => { 
        inputElement.value = label; 
        valueElement.value = value; 
        showDropdown(listElement, false); 
        onItemSelectFn(value, label); 
      }, inputElement, translationService); 
    } catch (error: unknown) {
      console.error("[SearchableDropdown] Error fetching items:", error);
      renderDropdownListItems(listElement, [{ value: "", label: translationService.translate("errorGeneric"), disabled: true }], () => {}, inputElement, translationService);
    }
  };

  const applyCurrentTranslations = () => { inputElement.placeholder = inputElement.disabled ? translationService.translate(currentDisabledPlaceholderKey) : translationService.translate(currentInputPlaceholderKey); };
  applyCurrentTranslations(); 

  inputElement.addEventListener("mousedown", async () => {
    if (inputElement.disabled) return;
    if (!listElement.classList.contains("visible")) {
        await refreshList();
        showDropdown(listElement, true);
    }
  });

  inputElement.addEventListener("input", async () => { 
    if (inputElement.disabled) return; 
    valueElement.value = ""; 
    await refreshList();
    showDropdown(listElement, true);
  });

  inputElement.addEventListener("blur", () => { 
    setTimeout(() => { 
      if (document.activeElement !== listElement && !listElement.contains(document.activeElement)) { 
        showDropdown(listElement, false); 
        const currentActualValue = valueElement.value; 
        if (!currentActualValue) { 
          inputElement.value = ""; 
          onItemSelectFn("", ""); 
        } 
        applyCurrentTranslations(); 
      } 
    }, 150); 
  });

  return {
    refresh: () => refreshList(),
    setDisabled: (isDisabled: boolean, newDisabledPlaceholderKey?: string) => {
      inputElement.disabled = isDisabled;
      if(newDisabledPlaceholderKey) currentDisabledPlaceholderKey = newDisabledPlaceholderKey;
      applyCurrentTranslations();
      if (isDisabled) { 
        inputElement.value = ""; 
        valueElement.value = ""; 
        renderDropdownListItems(listElement, [{ value: "", label: translationService.translate(currentDisabledPlaceholderKey), disabled: true }], () => {}, inputElement, translationService); 
        showDropdown(listElement, false); 
      }
    },
    applyTranslations: () => { applyCurrentTranslations(); if (listElement.classList.contains('visible')) refreshList(); }
  };
}