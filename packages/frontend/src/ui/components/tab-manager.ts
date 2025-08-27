/* FILE: packages/frontend/src/ui/components/tab-manager.ts */
// Generic utility for managing tabbed interfaces.

interface TabManagerConfig {
  tabsContainer: HTMLElement;
  contentContainer: HTMLElement;
  defaultTabKey: string;
  onTabChange?: (activeTabKey: string) => void;
}

interface TabManagerAPI {
  activateTab: (tabKey: string, forceCallback?: boolean) => void; 
  getCurrentTab: () => string | null;
}

export function initializeTabs({
  tabsContainer,
  contentContainer,
  defaultTabKey,
  onTabChange,
}: TabManagerConfig): TabManagerAPI {
  if (!tabsContainer || !contentContainer) {
    console.error(
      "[TabManager] Tabs container or content container not provided."
    );
    return { activateTab: () => {}, getCurrentTab: () => null };
  }

  const tabButtons = Array.from(
    tabsContainer.querySelectorAll<HTMLButtonElement>(".modal-tab-button[data-tab]") 
  );
  const tabContents = Array.from(
    contentContainer.querySelectorAll<HTMLElement>(".settings-tab-content[data-tab-content]") 
  );
  let currentActiveTabKey: string | null = null;

  function activateTab(tabKey: string, forceCallback = false): void {
    const previousActiveTabKeyForCallback = currentActiveTabKey; 
    let newlyDeterminedActiveKey: string | null = null;

    const targetButton = tabButtons.find(button => button.dataset.tab === tabKey && !button.classList.contains("hidden"));
    
    if (targetButton) {
        newlyDeterminedActiveKey = tabKey;
    } else {
      const defaultButtonInstance = tabsContainer.querySelector<HTMLButtonElement>(
          `.modal-tab-button[data-tab="${defaultTabKey}"]:not(.hidden)`
      );
      if (defaultButtonInstance && defaultButtonInstance.dataset.tab) {
          newlyDeterminedActiveKey = defaultButtonInstance.dataset.tab;
      } else {
          const firstVisibleButton = tabsContainer.querySelector<HTMLButtonElement>(
              ".modal-tab-button:not(.hidden)"
          );
          if (firstVisibleButton && firstVisibleButton.dataset.tab) {
              newlyDeterminedActiveKey = firstVisibleButton.dataset.tab;
          } else {
              console.error("[TabManager] No visible tabs found to activate as fallback.");
              return; 
          }
      }
    }
    
    currentActiveTabKey = newlyDeterminedActiveKey; 

    tabButtons.forEach((button) => {
      const isActive = button.dataset.tab === currentActiveTabKey;
      button.classList.toggle("active", isActive);
    });

    tabContents.forEach((content) => {
      const isActiveContent = content.dataset.tabContent === currentActiveTabKey;
      content.classList.toggle("active", isActiveContent);
      content.style.display = isActiveContent ? "block" : "none";
    });

    if (
      currentActiveTabKey && 
      typeof onTabChange === "function" &&
      (currentActiveTabKey !== previousActiveTabKeyForCallback || forceCallback) 
    ) {
      onTabChange(currentActiveTabKey);
    }
  }

  tabsContainer.addEventListener("click", (event: MouseEvent) => { 
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>(".modal-tab-button[data-tab]");
    if (button instanceof HTMLButtonElement && button.dataset.tab) {
      if (!button.classList.contains("hidden")) {
        activateTab(button.dataset.tab, false); 
      }
    }
  });
  
  activateTab(defaultTabKey, true); 

  return {
    activateTab, 
    getCurrentTab: () => currentActiveTabKey,
  };
}