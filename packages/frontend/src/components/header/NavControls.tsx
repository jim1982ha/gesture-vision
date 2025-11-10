/* FILE: packages/frontend/src/components/header/NavControls.tsx */
import { useContext } from 'react';
import { AppContext } from '#frontend/contexts/AppContext.js';
import { useAppStore } from '#frontend/hooks/useAppStore.js';
import { setIcon } from '#frontend/ui/helpers/ui-helpers.js';
import { LanguageSelector } from './LanguageSelector.js';

interface NavControlsProps {
  layout: 'desktop' | 'mobile';
}

/**
 * A reusable component that renders the main navigation controls (Language, History, Settings).
 * The layout is determined by the `layout` prop to fit either the main header or a mobile dropdown.
 */
export const NavControls = ({ layout }: NavControlsProps) => {
  const context = useContext(AppContext);
  const { actions } = useAppStore(state => ({ actions: state.actions }));
  
  if (!context) return null;
  const { translate } = context.services.translationService;

  const navButtons = [
    {
      id: 'history',
      onClick: () => actions.toggleHistorySidebar(),
      titleKey: 'history',
      iconKey: 'UI_HISTORY',
    },
    {
      id: 'settings',
      onClick: () => actions.openOverlay('settings'),
      titleKey: 'settings',
      iconKey: 'UI_SETTINGS',
    },
  ];

  if (layout === 'desktop') {
    return (
      <div id="header-nav-controls-desktop" className="nav-controls relative hidden h-full min-w-0 flex-grow-0 items-center justify-end gap-1 flex-shrink-0 desktop:flex">
        <LanguageSelector />
        {navButtons.map(btn => (
          <button
            key={btn.id}
            id={`header-${btn.id}-button`}
            onClick={btn.onClick}
            className="btn btn-icon"
            title={translate(btn.titleKey)}
          >
            <span ref={el => el && setIcon(el, btn.iconKey)}></span>
          </button>
        ))}
      </div>
    );
  }

  // Mobile layout
  return (
    <div id="header-nav-controls-mobile" className="flex flex-col gap-1 items-center w-full p-1">
      <LanguageSelector />
      {navButtons.map(btn => (
         <button
            key={btn.id}
            id={`header-${btn.id}-button-mobile`}
            onClick={btn.onClick}
            className="btn btn-icon"
            title={translate(btn.titleKey)}
          >
              <span ref={el => el && setIcon(el, btn.iconKey)}></span>
          </button>
      ))}
    </div>
  );
};