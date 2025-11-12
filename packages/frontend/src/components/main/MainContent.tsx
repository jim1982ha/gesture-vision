/* FILE: packages/frontend/src/components/main/MainContent.tsx */
import { useContext, useEffect, useRef } from 'react';
import { AppContext } from '#frontend/contexts/AppContext.js';
import { useAppStore } from '#frontend/hooks/useAppStore.js';
import { VideoOverlay } from '#frontend/components/video/VideoOverlay.js';
import { ConfigList } from '#frontend/components/config/ConfigList.js';
import { setIcon, clsx } from '#frontend/ui/helpers/ui-helpers.js';
import { Sidebars } from './Sidebars.js';
import { pubsub, UI_EVENTS } from '#shared/index.js';

export function MainContent() {
  const context = useContext(AppContext);
  const { isVideoVisible, isVideoExpanded, actions } = useAppStore(state => ({
    isVideoVisible: state.isVideoVisible,
    isVideoExpanded: state.isVideoExpanded,
    actions: state.actions
  }));
  const originalVideoContainerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const videoContainer = document.getElementById('video-container');
    if (videoContainer && !originalVideoContainerRef.current) {
        originalVideoContainerRef.current = videoContainer;
    }

    const handleReparentRequest = (data: unknown) => {
        const payload = data as { placeholderElement?: HTMLElement, release?: boolean };
        const videoContainer = originalVideoContainerRef.current;
        const streamElements = context?.services.cameraService?.getStreamElements();

        if (!videoContainer || !streamElements?.video || !streamElements?.canvas) {
            console.error('[MainContent Reparent] Critical elements for reparenting not found.');
            return;
        }
        const { video, canvas } = streamElements;

        if (payload.release) {
            video.classList.remove('reparented-video-feed');
            canvas.classList.remove('reparented-video-feed');
            videoContainer.append(video, canvas);
            videoContainer.classList.remove('video-reparented');
        } else if (payload.placeholderElement) {
            video.classList.add('reparented-video-feed');
            canvas.classList.add('reparented-video-feed');
            payload.placeholderElement.append(video, canvas);
            videoContainer.classList.add('video-reparented');
        }
    };

    const unsubscribe = pubsub.subscribe(UI_EVENTS.REQUEST_VIDEO_REPARENT, handleReparentRequest);
    return () => unsubscribe();
  }, [context]);
  
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

        <div id="video-container" className={clsx(
          "video-container group/video relative bg-black rounded-lg shadow-md overflow-hidden flex-shrink-0",
          !isVideoVisible && "hidden",
          isVideoExpanded ? "flex-grow aspect-auto" : "aspect-video mb-4",
        )}>
          <video id="webcam" className="absolute top-0 left-0 w-full h-full object-cover" autoPlay playsInline muted crossOrigin="anonymous"></video>
          <canvas id="output_canvas" className="absolute top-0 left-0 w-full h-full"></canvas>
          <VideoOverlay />
        </div>

        {!isVideoExpanded && (
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
        )}
      </main>
      
      <Sidebars />
    </div>
  );
}