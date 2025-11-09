/* FILE: packages/frontend/src/components/main/Sidebars.tsx */
import { useContext, useEffect } from 'react';
import { AppContext } from '#frontend/contexts/AppContext.js';
import { useAppStore } from '#frontend/hooks/useAppStore.js';
import { setIcon, clsx } from '#frontend/ui/helpers/ui-helpers.js';
import { GestureSettingsSidebar } from './GestureSettingsSidebar.js';
import { HistoryCard } from '#frontend/components/shared/cards/HistoryCard.js';

const HistorySidebar = ({ isOpen }: { isOpen: boolean }) => {
    const context = useContext(AppContext);
    const { translate } = context!.services.translationService;
    const { historyEntries, actions } = useAppStore(state => ({
        historyEntries: state.historyEntries,
        actions: state.actions,
    }));

    if (!context) return null;

    const handleClearHistory = () => {
        actions.showConfirmationModal({
            titleKey: 'confirmClearHistory',
            messageKey: 'confirmClearHistory',
            confirmTextKey: 'clearHistory',
            isDangerAction: true,
            onConfirm: () => {
                actions.clearHistory();
                actions.toggleHistorySidebar(false);
            },
        });
    };

    return (
        <aside 
            id="historySidebar" 
            className={clsx(
                "sidebar-container",
                isOpen ? 'translate-x-0' : 'translate-x-full'
            )}
        >
            <div id="history-sidebar-header" className="sidebar-header">
                <div className="flex items-center gap-2 min-w-0 flex-grow">
                    <span ref={el => el && setIcon(el, 'UI_HISTORY')} className="header-icon material-icons"></span>
                    <span id="history-sidebar-title" className="header-title">{translate('history')}</span>
                </div>
                <div id="history-sidebar-actions" className="sidebar-header-actions flex items-center flex-shrink-0">
                    <button id="history-sidebar-clear-button" onClick={handleClearHistory} className="btn btn-icon btn-icon-danger" title={translate('clearHistoryTooltip')}>
                        <span ref={el => el && setIcon(el, 'UI_DELETE_FOREVER')}></span>
                    </button>
                    <button id="history-sidebar-close-button" onClick={() => actions.toggleHistorySidebar(false)} className="btn btn-icon" title={translate('closeHistoryTooltip')}>
                        <span ref={el => el && setIcon(el, 'UI_CLOSE')}></span>
                    </button>
                </div>
            </div>
            <div id="history-sidebar-content" className="p-4 flex-1 overflow-y-auto">
                <div id="gestureHistory" className="flex flex-col gap-3">
                    {historyEntries.length > 0 ? (
                        historyEntries.map(entry => <HistoryCard key={entry.id} entry={entry} />)
                    ) : (
                        <p id="history-list-placeholder" className="list-placeholder">{translate('noGesturesRecorded')}</p>
                    )}
                </div>
            </div>
        </aside>
    );
};

export const Sidebars = () => {
    const context = useContext(AppContext);
    const { isHistorySidebarOpen, isGestureSettingsSidebarOpen, actions } = useAppStore(state => ({
        isHistorySidebarOpen: state.isHistorySidebarOpen,
        isGestureSettingsSidebarOpen: state.isGestureSettingsSidebarOpen,
        actions: state.actions
    }));
    
    useEffect(() => {
        const anySidebarOpen = isHistorySidebarOpen || isGestureSettingsSidebarOpen;
        document.body.classList.toggle('sidebar-active', anySidebarOpen);
    }, [isHistorySidebarOpen, isGestureSettingsSidebarOpen]);
    
    if (!context) return null;
    const isMobile = window.matchMedia('(any-pointer: coarse)').matches;

    const showBackdrop = (isHistorySidebarOpen || isGestureSettingsSidebarOpen) && isMobile;

    return (
        <>
            <GestureSettingsSidebar isOpen={isGestureSettingsSidebarOpen} />
            <HistorySidebar isOpen={isHistorySidebarOpen} />
            <div 
                id="sidebarBackdrop" 
                className={clsx(
                    "absolute inset-0 z-backdrop bg-black/30 backdrop-blur-[2px] transition-opacity duration-300 ease-in-out",
                    showBackdrop ? "visible opacity-100" : "invisible opacity-0"
                )}
                onClick={() => {
                    if (isHistorySidebarOpen) actions.toggleHistorySidebar(false);
                    if (isGestureSettingsSidebarOpen) actions.toggleGestureSettingsSidebar(false);
                }}
            ></div>
        </>
    );
};