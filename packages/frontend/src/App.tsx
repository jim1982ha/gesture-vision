/* FILE: packages/frontend/src/App.tsx */
import { useEffect, useMemo } from 'react';
import { useStore } from 'zustand';

import { AppContext } from '#frontend/contexts/AppContext.js';
import { createAppContext } from '#frontend/contexts/appContextFactory.js';
import { useAppInitializer } from '#frontend/hooks/useAppInitializer.js';
import { Header } from '#frontend/components/header/Header.js';
import { MainContent } from '#frontend/components/main/MainContent.js';
import { SettingsModal } from '#frontend/components/modals/SettingsModal.js';
import { CameraSelectModal } from '#frontend/components/modals/CameraSelectModal.js';
import { DocsModal } from '#frontend/components/modals/DocsModal.js';
import { ConfirmationModal } from '#frontend/components/modals/ConfirmationModal.js';
import { PluginSlot } from '#frontend/components/plugins/PluginSlot.js';
import { pubsub, UI_EVENTS } from '#shared/index.js';
import { clsx } from '#frontend/ui/helpers/ui-helpers.js';

const baseContext = createAppContext();

/**
 * The root component that orchestrates initialization and renders the entire UI.
 */
export function App() {
  const context = useAppInitializer(baseContext);
  
  const {
      isSettingsModalOpen, isCameraSelectModalOpen, isDocsModalOpen,
      isDashboardActive, confirmationModalConfig, isHistorySidebarOpen, 
      isGestureSettingsSidebarOpen, modalStack, isVideoExpanded, actions
  } = useStore(context.appStore, state => ({
      isSettingsModalOpen: state.isSettingsModalOpen,
      isCameraSelectModalOpen: state.isCameraSelectModalOpen,
      isDocsModalOpen: state.isDocsModalOpen,
      isDashboardActive: state.isDashboardActive,
      confirmationModalConfig: state.confirmationModalConfig,
      isHistorySidebarOpen: state.isHistorySidebarOpen,
      isGestureSettingsSidebarOpen: state.isGestureSettingsSidebarOpen,
      modalStack: state.modalStack,
      isVideoExpanded: state.isVideoExpanded,
      actions: state.actions,
  }));

  const isMobile = useMemo(() => window.matchMedia('(max-width: 1023px)').matches, []);
  const isHeaderVisible = !(isMobile && isVideoExpanded);

  useEffect(() => {
    const handleEditRequest = (gestureName: unknown) => {
      actions.toggleGestureSettingsSidebar(true, gestureName as string);
    };
    const unsubscribeEdit = pubsub.subscribe(UI_EVENTS.REQUEST_EDIT_CONFIG, handleEditRequest);
    return () => unsubscribeEdit();
  }, [actions]);

  useEffect(() => {
    const handleGlobalKeyDown = (event: KeyboardEvent) => {
        if (event.key !== 'Escape') return;

        const modalActionMap: Record<string, () => void> = {
            'settings': () => actions.toggleSettingsModal(false),
            'cameraSelect': () => actions.toggleCameraSelectModal(false),
            'docs': () => actions.toggleDocsModal(false),
            'confirmation': actions.hideConfirmationModal,
            'gesture-studio': () => pubsub.publish('escape-for-gesture-studio'),
        };
        
        const topModal = modalStack.at(-1);
        if (topModal && modalActionMap[topModal]) {
            modalActionMap[topModal]();
            return;
        }

        const fallbackActions = [
            { condition: isVideoExpanded, action: actions.toggleVideoExpanded },
            { condition: isDashboardActive, action: () => actions.toggleDashboard(false) },
            { condition: isGestureSettingsSidebarOpen, action: () => actions.toggleGestureSettingsSidebar(false) },
            { condition: isHistorySidebarOpen, action: () => actions.toggleHistorySidebar(false) },
        ];

        fallbackActions.find(item => item.condition)?.action();
    };
    
    document.addEventListener('keydown', handleGlobalKeyDown);
    return () => document.removeEventListener('keydown', handleGlobalKeyDown);
  }, [ modalStack, isDashboardActive, isGestureSettingsSidebarOpen, isHistorySidebarOpen, isVideoExpanded, actions ]);

  return (
    <AppContext.Provider value={context}>
        <div id="app-container" className={clsx("h-full flex flex-col", isMobile && isVideoExpanded && 'video-fullscreen-active')}>
          {isHeaderVisible && <Header />}
          <MainContent />
          
          {isSettingsModalOpen && <SettingsModal />}
          {isCameraSelectModalOpen && <CameraSelectModal />}
          {isDocsModalOpen && <DocsModal />}
          {confirmationModalConfig && <ConfirmationModal />}
          
          <PluginSlot slotId="fullscreen-overlay-slot" />
          
          <div id="gestureAlert" className="alert">
            <span id="gestureAlertText">Gesture!</span>
          </div>
        </div>
    </AppContext.Provider>
  );
}