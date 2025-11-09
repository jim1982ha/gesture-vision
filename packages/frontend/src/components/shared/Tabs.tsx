/* FILE: packages/frontend/src/components/shared/Tabs.tsx */
import React, { useState } from 'react';
import { setIcon } from '#frontend/ui/helpers/ui-helpers.js';
import type { GestureCategoryIconType } from '#shared/index.js';

export interface Tab {
  key: string;
  label: string;
  icon: GestureCategoryIconType | string;
  component: React.ReactNode;
}

interface TabsProps {
  tabs: Tab[];
  onTabChange: (tabKey: string) => void;
  defaultTab?: string;
}

export function Tabs({ tabs, onTabChange, defaultTab }: TabsProps) {
  const [activeTab, setActiveTab] = useState(defaultTab || (tabs.length > 0 ? tabs[0].key : ''));

  const handleTabChange = (key: string) => {
    setActiveTab(key);
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
            <option key={tab.key} value={tab.key}>{tab.label}</option>
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
            className={`btn settings-tab-nav-button ${activeTab === tab.key ? 'active' : ''}`}
            onClick={() => handleTabChange(tab.key)}
          >
            <span ref={el => el && setIcon(el, tab.icon)} className="material-icons"></span>
            <span>{tab.label}</span>
          </button>
        ))}
      </nav>

      {/* Tab Content Area */}
      <div id="settingsTabContentContainer" className="modal-scrollable-content flex-1 min-h-0 flex flex-col">
        {tabs.map(tab => (
          <div key={tab.key} className={`settings-tab-content ${activeTab === tab.key ? 'active' : ''}`} data-tab-content={tab.key}>
            {tab.component}
          </div>
        ))}
      </div>
    </div>
  );
}