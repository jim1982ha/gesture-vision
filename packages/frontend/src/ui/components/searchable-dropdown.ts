/* FILE: packages/frontend/src/ui/components/searchable-dropdown.ts */
// Generic utility for creating and managing a searchable dropdown.
import { translate } from "#shared/services/translations.js"; 

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
    inputPlaceholder?: string;
    disabledPlaceholder?: string;
}

export interface SearchableDropdown {
    refresh: (showAfterRefresh?: boolean) => Promise<void>;
    setDisabled: (isDisabled: boolean, newPlaceholderText?: string) => void;
    applyTranslations?: () => void;
}

function renderDropdownListItems(
    listElement: HTMLElement, 
    items: DropdownItem[], 
    onItemSelectCallback: (value: string, label: string) => void,
    inputToBlurOnSelect: HTMLInputElement
): void {
  if (!listElement) return;
  listElement.innerHTML = ""; 

  if (!items || items.length === 0) {
    const placeholderDiv = document.createElement("div");
    placeholderDiv.textContent = translate("noItemsToDisplay");
    placeholderDiv.classList.add("dropdown-list-item", "disabled");
    listElement.appendChild(placeholderDiv);
    return;
  }

  items.forEach((item) => {
    const itemDiv = document.createElement("div");
    itemDiv.textContent = item.label;
    itemDiv.dataset.value = item.value;
    itemDiv.classList.add("dropdown-list-item");

    if (item.disabled) {
      itemDiv.classList.add("disabled");
      itemDiv.setAttribute("aria-disabled", "true");
    } else {
      itemDiv.setAttribute("role", "option");
      itemDiv.tabIndex = -1; 
      itemDiv.addEventListener("mousedown", (e: MouseEvent) => {
        e.preventDefault(); 
        onItemSelectCallback(item.value, item.label);
        inputToBlurOnSelect.blur(); 
      });
      itemDiv.addEventListener("keydown", (e: KeyboardEvent) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onItemSelectCallback(item.value, item.label);
          inputToBlurOnSelect.blur();
        }
      });
    }
    listElement.appendChild(itemDiv);
  });
}

function showDropdown(listElement: HTMLElement | null, show: boolean): void {
  if (listElement) {
    listElement.classList.toggle("visible", show);
    listElement.setAttribute("aria-hidden", String(!show));
  }
}

export function createSearchableDropdown(config: SearchableDropdownConfig): SearchableDropdown {
  const {
    inputElement,
    listElement,
    valueElement,
    fetchItemsFn,
    onItemSelectFn,
    inputPlaceholder = "Filter...",
    disabledPlaceholder = "Not available",
  } = config;

  if (
    !inputElement ||
    !listElement ||
    !valueElement ||
    typeof fetchItemsFn !== "function" ||
    typeof onItemSelectFn !== "function"
  ) {
    console.error("[SearchableDropdown] Invalid configuration provided.", config);
    return { refresh: async () => {}, setDisabled: () => {}, applyTranslations: () => {} }; 
  }

  const currentInputPlaceholderKey = inputPlaceholder;
  let currentDisabledPlaceholderKey = disabledPlaceholder;

  const refreshList = async (forceShowList = false): Promise<void> => {
    const filterText = inputElement.value.trim().toLowerCase();
    try {
      const items = await fetchItemsFn(filterText);
      renderDropdownListItems(listElement, items, (value, label) => {
        inputElement.value = label; 
        valueElement.value = value; 
        showDropdown(listElement, false); 
        onItemSelectFn(value, label); 
      }, inputElement); 
      
      const shouldShow = forceShowList || (document.activeElement === inputElement && (items.length > 0 || filterText.length > 0));
      showDropdown(listElement, shouldShow);
    } catch (error: unknown) {
      console.error("[SearchableDropdown] Error fetching items:", error);
      renderDropdownListItems(
        listElement,
        [{ value: "", label: translate("errorGeneric", {defaultValue: "Error loading items"}), disabled: true }],
        () => {},
        inputElement 
      );
      if (forceShowList || document.activeElement === inputElement) showDropdown(listElement, true);
    }
  };

  const applyCurrentTranslations = () => {
    inputElement.placeholder = inputElement.disabled 
        ? translate(currentDisabledPlaceholderKey) 
        : translate(currentInputPlaceholderKey);
  };

  applyCurrentTranslations(); 


  inputElement.addEventListener("input", () => {
    if (inputElement.disabled) return;
    valueElement.value = ""; 
    refreshList(true);
  });

  inputElement.addEventListener("focus", () => {
    if (inputElement.disabled) return;
    inputElement.placeholder = translate(currentInputPlaceholderKey); 
    refreshList(true);
  });

  inputElement.addEventListener("blur", () => {
    setTimeout(() => {
        if (document.activeElement !== listElement && !listElement.contains(document.activeElement)) {
            showDropdown(listElement, false);
            
            const currentDisplayValue = inputElement.value;
            const currentActualValue = valueElement.value;
            let validDisplayFound = false;

            if (currentActualValue) {
                const itemsArray = Array.from(listElement.querySelectorAll<HTMLDivElement>(".dropdown-list-item:not(.disabled)"));
                for (const item of itemsArray) { 
                    if (item.dataset.value === currentActualValue) {
                        inputElement.value = item.textContent || "";
                        validDisplayFound = true;
                        break;
                    }
                }
                if (!validDisplayFound && itemsArray.length > 0 && itemsArray[0].dataset.value) {
                    if(!itemsArray.some(item => item.textContent === currentDisplayValue)){
                         inputElement.value = ""; 
                    }
                } else if (!validDisplayFound) {
                    inputElement.value = "";
                    valueElement.value = "";
                    onItemSelectFn("", ""); // Notify of deselection/clear
                }
            } else if (!currentDisplayValue) { // If both actual value and display value are empty
                valueElement.value = "";
                onItemSelectFn("", ""); 
            }
            
            applyCurrentTranslations();
        }
    }, 150); 
  });

  return {
    refresh: (showAfterRefresh = false) => refreshList(showAfterRefresh),
    setDisabled: (isDisabled: boolean, newDisabledPlaceholderKey?: string) => {
      inputElement.disabled = isDisabled;
      if(newDisabledPlaceholderKey) currentDisabledPlaceholderKey = newDisabledPlaceholderKey;
      applyCurrentTranslations();

      if (isDisabled) {
        inputElement.value = ""; 
        valueElement.value = ""; 
        renderDropdownListItems(listElement, [{ value: "", label: translate(currentDisabledPlaceholderKey), disabled: true }], () => {}, inputElement);
        showDropdown(listElement, false);
      }
    },
    applyTranslations: () => {
        applyCurrentTranslations();
        if (listElement.classList.contains('visible')) {
            refreshList(true);
        }
    }
  };
}