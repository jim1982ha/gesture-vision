/* FILE: packages/frontend/src/components/shared/Tabs.tsx */
import { type ReactNode } from 'react';
import { setIcon, clsx } from '#frontend/ui/helpers/ui-helpers.js';
import type { GestureCategoryIconType } from '#shared/index.js';

export interface Tab {
  key: string;
  label: string;
  icon: GestureCategoryIconType | string;
  component: ReactNode;
  disabled?: boolean;
}

interface TabsProps {
  tabs: Tab[];
  onTabChange: (tabKey: string) => void;
  activeTab: string;
}

export function Tabs({ tabs, onTabChange, activeTab }: TabsProps) {
  const handleTabChange = (key: string) => {
    onTabChange(key);
  };

  return (
    <div className="flex-grow min-h-0 flex flex-col lg:flex-row">
      {/* Mobile-only Select Dropdown */}
      <div id="settings-tabs-mobile-nav" className="lg:hidden p-4">
        <select
          id="settingsTabsMobileSelect"
          className="form-control"
          value={activeTab}
          onChange={(e) => handleTabChange(e.target.value)}
        >
          {tabs.map(tab => (
            <option key={tab.key} value={tab.key} disabled={tab.disabled}>{tab.label}</option>
          ))}
        </select>
      </div>

      {/* Desktop Sidebar Navigation */}
      <nav
        id="settingsTabsDesktopNav"
        className="hidden lg:flex flex-col gap-1 w-52 p-4 border-r"
      >
        {tabs.map(tab => (
          <button
            id={`settings-tab-nav-button-${tab.key}`}
            key={tab.key}
            className={clsx('btn settings-tab-nav-button', activeTab === tab.key && 'active')}
            onClick={() => handleTabChange(tab.key)}
            disabled={tab.disabled}
          >
            <span ref={el => el && setIcon(el, tab.icon)}></span>
            <span>{tab.label}</span>
          </button>
        ))}
      </nav>

      {/* Tab Content Area - Renders ALL tab components but only shows the active one */}
      <div id="settingsTabContentContainer" className="modal-scrollable-content flex-1 min-h-0 flex flex-col">
          {tabs.map(tab => (
            <div
              key={tab.key}
              id={`settings-tab-content-${tab.key}`}
              className={clsx('settings-tab-content', activeTab === tab.key && 'active')}
              role="tabpanel"
              aria-labelledby={`settings-tab-nav-button-${tab.key}`}
            >
              {tab.component}
            </div>
          ))}
      </div>
    </div>
  );
}