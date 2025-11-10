/* FILE: packages/frontend/src/App.tsx */
import { useEffect, useMemo, lazy, Suspense } from 'react';
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
import { PluginSlot } from '#frontend/components/plugins/PluginSlot.js';
import { pubsub, UI_EVENTS } from '#shared/index.js';
import { clsx } from '#frontend/ui/helpers/ui-helpers.js';
import type { AppContextType } from './types/index.js';

const GestureStudio = lazy(() =>
  import('#plugins/gesture-vision-plugin-gesture-studio/frontend/GestureStudio.js').then(module => ({ default: module.GestureStudio }))
);

export function App({ context }: { context: AppContextType }) {
  const initializedContext = useAppInitializer(context);
  
  const {
      activeOverlays, isDashboardActive, isVideoExpanded, actions
  } = useStore(initializedContext.appStore, state => ({
      activeOverlays: state.activeOverlays,
      isDashboardActive: state.isDashboardActive,
      isVideoExpanded: state.isVideoExpanded,
      actions: state.actions,
  }));

  const activeModalId = activeOverlays.at(-1)?.id;

  const isMobile = useMemo(() => window.matchMedia('(max-width: 1023px)').matches, []);
  const isHeaderVisible = !(isMobile && isVideoExpanded);

  useEffect(() => {
    const handleEditRequest = (gestureName: unknown) => {
      const config = initializedContext.appStore.getState().gestureConfigs.find(
        c => ('gesture' in c ? c.gesture : c.pose) === (gestureName as string)
      );
      if (config) {
        actions.openOverlay('gestureForm', config);
      }
    };
    const unsubscribeEdit = pubsub.subscribe(UI_EVENTS.REQUEST_EDIT_CONFIG, handleEditRequest);
    return () => unsubscribeEdit();
  }, [actions, initializedContext.appStore]);

  useEffect(() => {
    const handleGlobalKeyDown = (event: KeyboardEvent) => {
        if (event.key !== 'Escape') return;

        if (activeModalId) {
            actions.closeCurrentOverlay();
            return;
        }

        const fallbackActions = [
            { condition: isVideoExpanded, action: actions.toggleVideoExpanded },
            { condition: isDashboardActive, action: () => actions.toggleDashboard(false) },
            { condition: initializedContext.appStore.getState().isHistorySidebarOpen, action: () => actions.toggleHistorySidebar(false) },
        ];

        fallbackActions.find(item => item.condition)?.action();
    };
    
    document.addEventListener('keydown', handleGlobalKeyDown);
    return () => document.removeEventListener('keydown', handleGlobalKeyDown);
  }, [ activeModalId, isDashboardActive, isVideoExpanded, actions, initializedContext.appStore ]);

  return (
    <AppContext.Provider value={initializedContext}>
        <div id="app-container" className={clsx("h-full flex flex-col", isMobile && isVideoExpanded && 'video-fullscreen-active')}>
          {isHeaderVisible && <Header />}
          <MainContent />
          
          {/* --- MODIFICATION: Render the entire modal stack --- */}
          {/* This keeps underlying modals mounted and preserves their state. */}
          {activeOverlays.map(overlay => {
            switch (overlay.id) {
              case 'settings':
                return <SettingsModal key="settings" />;
              case 'cameraSelect':
                return <CameraSelectModal key="cameraSelect" />;
              case 'docs':
                return <DocsModal key="docs" />;
              case 'confirmation':
                return <ConfirmationModal key="confirmation" />;
              case 'gestureForm':
                return <GestureConfigModal key="gestureForm" />;
              case 'gesture-studio':
                return (
                  <Suspense key="gesture-studio" fallback={<div className="modal visible"></div>}>
                    <GestureStudio 
                      context={initializedContext.services.pluginUIService.getPluginUIContext('gesture-vision-plugin-gesture-studio')}
                      onClose={() => actions.closeCurrentOverlay()}
                    />
                  </Suspense>
                );
              default:
                return null;
            }
          })}
          
          <PluginSlot slotId="fullscreen-overlay-slot" />
          
          <div id="gestureAlert" className="alert">
            <span id="gestureAlertText">Gesture!</span>
          </div>
        </div>
    </AppContext.Provider>
  );
}