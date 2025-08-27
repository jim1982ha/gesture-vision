/* FILE: packages/frontend/src/ui/renderers/theme-tab-renderer.ts */
import type { ThemeSettingsTabElements } from "#frontend/ui/tabs/theme-settings-tab.js";
 
import { translate } from "#shared/services/translations.js"; 

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
  const currentBaseThemeId = themeMgr.getBaseTheme();

  themeListContainer.innerHTML = ""; 

  if (!availableBaseThemes || availableBaseThemes.length === 0) {
    themeListContainer.innerHTML = `<div class="list-placeholder">No themes available.</div>`;
    return;
  }

  availableBaseThemes.forEach((theme: ThemeInfo) => {
    const button = document.createElement("button");
    button.classList.add("btn", "btn-secondary", "theme-item-btn"); 
    button.dataset.themeId = theme.id;
    button.setAttribute("role", "radio"); 
    button.setAttribute("aria-checked", String(theme.id === currentBaseThemeId));

    const iconSpan = document.createElement("span");
    iconSpan.classList.add("material-icons");
    iconSpan.textContent = theme.icon || "palette"; 
    iconSpan.setAttribute("aria-hidden", "true"); 

    const nameSpan = document.createElement("span");
    nameSpan.classList.add("theme-name", "toggle-button-text"); 
    nameSpan.textContent = translate(theme.nameKey, { defaultValue: theme.id }); 

    button.appendChild(iconSpan);
    button.appendChild(nameSpan);

    if (theme.id === currentBaseThemeId) {
      button.classList.add("active", "btn-primary");
      button.classList.remove("btn-secondary");
    } else {
      button.classList.remove("btn-primary", "active");
    }
    themeListContainer.appendChild(button);
  });
}