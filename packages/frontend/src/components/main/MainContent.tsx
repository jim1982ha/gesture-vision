/* FILE: packages/frontend/src/components/main/MainContent.tsx */
import { useContext } from 'react';
import { AppContext } from '#frontend/contexts/AppContext.js';
import { useAppStore } from '#frontend/hooks/useAppStore.js';
import { VideoOverlay } from '#frontend/components/video/VideoOverlay.js';
import { ConfigList } from '#frontend/components/config/ConfigList.js';
import { setIcon, clsx } from '#frontend/ui/helpers/ui-helpers.js';
import { Sidebars } from './Sidebars.js';

export function MainContent() {
  const context = useContext(AppContext);
  const { isVideoVisible, isVideoExpanded, actions } = useAppStore(state => ({
    isVideoVisible: state.isVideoVisible,
    isVideoExpanded: state.isVideoExpanded,
    actions: state.actions
  }));
  
  if (!context) return null;
  
  const { translate } = context.services.translationService;

  return (
    <div className="main-content-wrapper flex-1 flex overflow-hidden relative">
      <main id="main-content" className={clsx("main-content group/main flex-1 flex flex-col p-4 relative overflow-y-auto px-4 desktop:px-main-x-desktop", isVideoExpanded && "video-is-expanded")}>
        <h2 id="liveFeedTitle" className="section-title">
          <span ref={el => el && setIcon(el, 'UI_CAMERA_OUTLINE')} className="config-title-icon material-icons"></span>
          <span>{translate('liveFeedTitle')}</span>
          <button id="main-content-toggle-video-button" onClick={() => actions.toggleVideoVisibility()} className="btn btn-icon btn-icon-primary ml-auto" title={translate(isVideoVisible ? 'hideVideo' : 'showVideo')}>
            <span ref={el => el && setIcon(el, isVideoVisible ? 'UI_VISIBILITY_OFF' : 'UI_VISIBILITY_ON')} className="material-icons"></span>
          </button>
        </h2>

        <div id="video-container" className={clsx("video-container group/video relative aspect-video bg-black rounded-lg shadow-md overflow-hidden mb-4 flex-shrink-0", !isVideoVisible && "hidden")}>
          <video id="webcam" className="absolute top-0 left-0 w-full h-full object-cover" autoPlay playsInline muted crossOrigin="anonymous"></video>
          <canvas id="output_canvas" className="absolute top-0 left-0 w-full h-full"></canvas>
          <VideoOverlay />
        </div>

        <div id="configured-actions-section">
          <div className="flex items-center justify-between gap-2 mb-3 flex-shrink-0">
            <h2 id="desktopConfigListTitle" className="section-title">
              <span ref={el => el && setIcon(el, 'UI_LIST_CHECK')} className="config-title-icon material-icons"></span>
              <span>{translate('configuredActionsTitle')}</span>
            </h2>
            <button id="addNewActionButton" className="btn btn-primary" onClick={() => actions.openOverlay('gestureForm', null)}>
              <span ref={el => el && setIcon(el, 'UI_ADD')} className="material-icons"></span>
              <span id="addNewActionButtonLabel">{translate('addNewAction')}</span>
            </button>
          </div>

          <div id="configListContainer" className="flex-1 overflow-y-auto desktop:overflow-y-visible">
            <ConfigList />
          </div>
        </div>
      </main>
      
      <Sidebars />
    </div>
  );
}