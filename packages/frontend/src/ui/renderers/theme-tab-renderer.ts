/* FILE: packages/frontend/src/ui/renderers/theme-tab-renderer.ts */
import type { ThemeSettingsTabElements } from '#frontend/ui/tabs/theme-settings-tab.js';
 
import { translate } from "#shared/services/translations.js"; 
import { setIcon } from "../helpers/index.js";

import type { UIController } from "../ui-controller-core.js"; 

interface ThemeInfo {
    id: string;
    nameKey: string;
    icon: string;
}

/**
 * Updates the UI elements in the Theme settings tab.
 * Renders the base theme selection buttons and updates the color mode toggle state.
 * @param {Partial<ThemeSettingsTabElements>} elements - UI elements reference.
 * @param {UIController | null} uiControllerRef - Reference to UIController instance.
 */
export function renderThemeSelectionTab(
    elements: Partial<ThemeSettingsTabElements>, 
    uiControllerRef: UIController | null
): void {
  const themeListContainer = elements.themeToggleGroup; 

  if (!uiControllerRef) {
    if (themeListContainer) themeListContainer.innerHTML = `<div class="list-placeholder">Error: UI Controller Missing</div>`;
    return;
  }

  const themeMgr = uiControllerRef._themeManager;

  if (!themeListContainer || !themeMgr) {
    if (themeListContainer) themeListContainer.innerHTML = `<div class="list-placeholder">Error loading themes (Mgr/Els missing).</div>`;
    return;
  }

  const availableBaseThemes = themeMgr.getAvailableBaseThemes();
  
  themeListContainer.innerHTML = ""; 

  if (!availableBaseThemes || availableBaseThemes.length === 0) {
    themeListContainer.innerHTML = `<div class="list-placeholder">No themes available.</div>`;
    return;
  }

  availableBaseThemes.forEach((theme: ThemeInfo) => {
    const button = document.createElement("button");
    button.classList.add("btn", "btn-secondary", "theme-item-btn"); 
    button.dataset.value = theme.id; // Use data-value for the helper
    button.dataset.themeId = theme.id;
    button.setAttribute("role", "radio"); 
    
    const iconSpan = document.createElement("span");
    iconSpan.classList.add("material-icons");
    iconSpan.setAttribute("aria-hidden", "true"); 
    setIcon(iconSpan, theme.icon);

    const nameSpan = document.createElement("span");
    nameSpan.classList.add("theme-name", "toggle-button-text"); 
    nameSpan.textContent = translate(theme.nameKey, { defaultValue: theme.id }); 

    button.appendChild(iconSpan);
    button.appendChild(nameSpan);

    themeListContainer.appendChild(button);
  });
}