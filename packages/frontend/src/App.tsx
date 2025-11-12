/* FILE: packages/frontend/src/App.tsx */
import { useEffect } from 'react';
import { useStore } from 'zustand';

import { AppContext } from '#frontend/contexts/AppContext.js';
import { useAppInitializer } from '#frontend/hooks/useAppInitializer.js';
import { Header } from '#frontend/components/header/Header.js';
import { MainContent } from '#frontend/components/main/MainContent.js';
import { SettingsModal } from '#frontend/components/modals/SettingsModal.js';
import { CameraSelectModal } from '#frontend/components/modals/CameraSelectModal.js';
import { DocsModal } from '#frontend/components/modals/DocsModal.js';
import { ConfirmationModal } from '#frontend/components/modals/ConfirmationModal.js';
import { GestureConfigModal } from '#frontend/components/modals/GestureConfigModal.js';
import { PluginSlot, PluginOverlaySlot } from '#frontend/components/plugins/PluginSlot.js';
import { pubsub, UI_EVENTS } from '#shared/index.js';
import { clsx } from '#frontend/ui/helpers/ui-helpers.js';
import type { AppContextType } from './types/index.js';

export function App({ context }: { context: AppContextType }) {
  const initializedContext = useAppInitializer(context);
  
  const {
      activeOverlays, isVideoExpanded, isMobile, actions, gestureConfigs
  } = useStore(initializedContext.appStore, state => ({
      activeOverlays: state.activeOverlays,
      isVideoExpanded: state.isVideoExpanded,
      isMobile: state.isMobile,
      actions: state.actions,
      gestureConfigs: state.gestureConfigs,
  }));

  const activeModalId = activeOverlays.at(-1)?.id;
  const isHeaderVisible = !(isMobile && isVideoExpanded);

  useEffect(() => {
    const handleEditRequest = (gestureName: unknown) => {
      const config = gestureConfigs.find(c => c.display.name === (gestureName as string));
      if (config) actions.openOverlay('gestureForm', config);
    };
    const unsubscribeEdit = pubsub.subscribe(UI_EVENTS.REQUEST_EDIT_CONFIG, handleEditRequest);
    return () => unsubscribeEdit();
  }, [actions, gestureConfigs]);

  useEffect(() => {
    const handleGlobalKeyDown = (event: KeyboardEvent) => {
        if (event.key !== 'Escape') return;
        if (activeModalId) {
            actions.closeCurrentOverlay();
            return;
        }
        if (isVideoExpanded) actions.toggleVideoExpanded();
        else if (initializedContext.appStore.getState().isHistorySidebarOpen) actions.toggleHistorySidebar(false);
    };
    
    document.addEventListener('keydown', handleGlobalKeyDown);
    return () => document.removeEventListener('keydown', handleGlobalKeyDown);
  }, [ activeModalId, isVideoExpanded, actions, initializedContext.appStore ]);

  return (
    <AppContext.Provider value={initializedContext}>
        <div id="app-container" className={clsx("h-full flex flex-col", isMobile && isVideoExpanded && 'video-fullscreen-active')}>
          {isHeaderVisible && <Header />}
          <MainContent />
          
          <SettingsModal />
          <CameraSelectModal />
          <DocsModal />
          <ConfirmationModal />
          <GestureConfigModal />
          
          <PluginSlot slotId="fullscreen-overlay-slot" />
          <PluginOverlaySlot />
          
          <div id="gestureAlert" className="alert">
            <span id="gestureAlertText">Gesture!</span>
          </div>
        </div>
    </AppContext.Provider>
  );
}