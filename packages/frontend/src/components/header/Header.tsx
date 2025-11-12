/* FILE: packages/frontend/src/components/header/Header.tsx */
import { useContext, useEffect, useRef } from 'react';
import { AppContext } from '#frontend/contexts/AppContext.js';
import { useAppStore } from '#frontend/hooks/useAppStore.js';
import { setIcon } from '#frontend/ui/helpers/ui-helpers.js';
import { HeaderToggles } from './HeaderToggles.js';
import { NavControls } from './NavControls.js';
import { PluginSlot } from '#frontend/components/plugins/PluginSlot.js';
import { Dropdown } from '#frontend/components/shared/Dropdown.js';

export function Header() {
    const context = useContext(AppContext);
    const { translate } = context!.services.translationService;
    const { isWsConnected, isStreamConnecting, actions } = useAppStore(state => ({
        isWsConnected: state.isWsConnected,
        isStreamConnecting: state.isStreamConnecting,
        actions: state.actions,
    }));
    const wsStatusRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const indicator = wsStatusRef.current;
        if (!indicator) return;

        indicator.classList.remove('connected', 'disconnected', 'connecting');
        let statusClass = 'disconnected';
        let titleKey = 'wsDisconnected';
        let iconKey: string | null = 'UI_WS_DISCONNECTED';
        
        if (isStreamConnecting) {
            statusClass = 'connecting';
            titleKey = 'wsConnecting';
            iconKey = 'UI_WS_CONNECTING';
        } else if (isWsConnected) {
            statusClass = 'connected';
            titleKey = 'wsConnected';
            iconKey = null; // Use image for connected state
        }
        
        indicator.classList.add(statusClass);
        indicator.title = translate(titleKey);

        if (iconKey) {
            setIcon(indicator, iconKey);
        } else {
            indicator.innerHTML = `<img src="/icons/favicon.svg" alt="Connected" style="width: var(--icon-size-status); height: var(--icon-size-status);">`;
        }

    }, [isWsConnected, isStreamConnecting, translate]);
    
    if (!context) return null;

    const openAboutModal = () => actions.openOverlay('docs', 'ABOUT');
    
    const kebabMenuTrigger = (
        <button id="header-kebab-menu-trigger" className="btn btn-icon" title={translate('moreOptions')}>
            <span ref={el => el && setIcon(el, 'more_vert')}></span>
        </button>
    );

    return (
        <header id="app-header" className="relative z-header flex h-14 flex-shrink-0 items-center justify-between px-3">
            <div id="header-brand-container" className="flex flex-shrink-0 items-center gap-2">
                <div id="header-status-indicator" ref={wsStatusRef} className="status-indicator flex items-center cursor-pointer" onClick={openAboutModal}></div>
                <div id="header-title-container" className="hidden items-center overflow-hidden desktop:flex cursor-pointer" onClick={openAboutModal}>
                    <h1 className="truncate text-xl font-semibold">GestureVision</h1>
                </div>
            </div>

            <div id="header-center-controls" className="flex-1 flex justify-center items-center min-w-0 desktop:absolute desktop:left-1/2 desktop:top-1/2 desktop:-translate-x-1/2 desktop:-translate-y-1/2">
                <div className="flex items-center gap-2">
                    <HeaderToggles />
                    <PluginSlot slotId="header-plugin-contribution-slot" className="flex items-center gap-1" />
                </div>
            </div>

            {/* Desktop navigation controls */}
            <NavControls layout="desktop" />
            
            {/* Mobile "kebab" menu */}
            <div id="header-mobile-kebab-menu" className="desktop:hidden">
                <Dropdown id="header-kebab-menu" trigger={kebabMenuTrigger}>
                    <NavControls layout="mobile" />
                </Dropdown>
            </div>
        </header>
    );
}