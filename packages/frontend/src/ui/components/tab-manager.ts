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

  const getTabButtons = () => Array.from(
    tabsContainer.querySelectorAll<HTMLButtonElement>(".settings-tab-nav-button[data-tab]") 
  );
  
  const tabContents = Array.from(
    contentContainer.querySelectorAll<HTMLElement>(".settings-tab-content[data-tab-content]") 
  );
  let currentActiveTabKey: string | null = null;

  function activateTab(tabKey: string, forceCallback = false): void {
    const previousActiveTabKeyForCallback = currentActiveTabKey; 
    let newlyDeterminedActiveKey: string | null = null;
    const currentTabButtons = getTabButtons();

    const targetButton = currentTabButtons.find(button => button.dataset.tab === tabKey && !button.classList.contains("hidden"));
    
    if (targetButton) {
        newlyDeterminedActiveKey = tabKey;
    } else {
      const defaultButtonInstance = tabsContainer.querySelector<HTMLButtonElement>(
          `.settings-tab-nav-button[data-tab="${defaultTabKey}"]:not(.hidden)`
      );
      if (defaultButtonInstance?.dataset.tab) {
          newlyDeterminedActiveKey = defaultButtonInstance.dataset.tab;
      } else {
          const firstVisibleButton = tabsContainer.querySelector<HTMLButtonElement>(
              ".settings-tab-nav-button:not(.hidden)"
          );
          if (firstVisibleButton?.dataset.tab) {
              newlyDeterminedActiveKey = firstVisibleButton.dataset.tab;
          } else {
              console.error("[TabManager] No visible tabs found to activate as fallback.");
              return; 
          }
      }
    }
    
    currentActiveTabKey = newlyDeterminedActiveKey; 

    currentTabButtons.forEach((button) => {
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
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>(".settings-tab-nav-button[data-tab]");
    if (button?.dataset.tab && !button.classList.contains("hidden")) {
      activateTab(button.dataset.tab, false); 
    }
  });
  
  // Initial activation after a microtask to allow DOM to update
  setTimeout(() => activateTab(defaultTabKey, true), 0);

  return {
    activateTab, 
    getCurrentTab: () => currentActiveTabKey,
  };
}