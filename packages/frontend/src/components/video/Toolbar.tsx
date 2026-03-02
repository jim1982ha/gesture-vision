// --- packages/frontend/src/components/video/Toolbar.tsx --- (complete version) ---
/* FILE: packages/frontend/src/components/video/Toolbar.tsx */
import { useContext } from 'react';
import { AppContext } from '#frontend/contexts/AppContext.js';
import { useAppStore } from '#frontend/hooks/useAppStore.js';
import { pubsub, UI_EVENTS } from '#shared/index.js';
import { setIcon } from '#frontend/ui/helpers/ui-helpers.js';

export const Toolbar = () => {
    const context = useContext(AppContext);
    const { isVideoExpanded, isStreamRunning } = useAppStore(state => ({
        isVideoExpanded: state.isVideoExpanded,
        isStreamRunning: state.isWebcamRunning,
    }));

    if (!context || !context.services.cameraService) return null;

    const { cameraService, translationService } = context.services;
    const { actions } = context.appStore.getState();
    const { translate } = translationService;
    
    const isMirrored = cameraService.isMirrored();
    const canFlipCamera = cameraService.canFlipCamera();
    const isRtsp = cameraService.isStreamingRtsp();
    const isMobile = window.matchMedia('(any-pointer: coarse)').matches;

    return (
        <div id="video-toolbar-container" className="absolute top-2 right-2 flex flex-col items-end gap-2 pointer-events-auto">
            {isStreamRunning && (
                <div id="stream-actions-wrapper">
                    <div id="stream-actions-group" className="overlay-surface flex items-center gap-1 rounded-full">
                        <button id="toolbar-mirror-button" onClick={() => pubsub.publish(UI_EVENTS.REQUEST_MIRROR_TOGGLE)} className={`btn btn-icon ${isMirrored ? 'active' : ''}`} title={translate('toggleMirrorView')}>
                            <span id="toolbar-mirror-icon" ref={el => el && setIcon(el, 'UI_VIDEO_MIRROR')}></span>
                        </button>
                        
                        {canFlipCamera && isMobile && !isRtsp && (
                            <button id="toolbar-flip-camera-button" onClick={() => cameraService.flipCamera()} className="btn btn-icon" title={translate('flipCamera')}>
                                <span id="toolbar-flip-camera-icon" ref={el => el && setIcon(el, 'UI_FLIP_CAMERA')}></span>
                            </button>
                        )}
                        
                        <button id="toolbar-display-button" onClick={() => pubsub.publish(UI_EVENTS.VIDEO_TOOLBAR_DISPLAY_CLICKED)} className="btn btn-icon" title={translate('displayAdjustments')}>
                            <span id="toolbar-display-icon" ref={el => el && setIcon(el, 'UI_DISPLAY_ADJUSTMENTS')}></span>
                        </button>
                        
                        <button id="toolbar-ai-button" onClick={() => pubsub.publish(UI_EVENTS.VIDEO_TOOLBAR_AI_CLICKED)} className="btn btn-icon" title={translate('toggleAITuningPanelTooltip')}>
                            <span id="toolbar-ai-icon" ref={el => el && setIcon(el, 'UI_AI_TUNING')}></span>
                        </button>

                        {/* FIX: Moved zoom toggle button inside the action group, before the stop button */}
                        <button id="videoSizeToggleButton" className="btn btn-icon" onClick={() => actions.toggleVideoExpanded()} title={translate(isVideoExpanded ? 'constrainVideo' : 'expandVideo')}>
                            <span id="video-size-toggle-icon" ref={el => el && setIcon(el, isVideoExpanded ? 'UI_VIDEO_FULLSCREEN_EXIT' : 'UI_VIDEO_FULLSCREEN')}></span>
                        </button>

                        <button id="toolbar-stop-button" onClick={() => cameraService.stopStream()} className="btn btn-icon btn-icon-danger" title={translate('stop')}>
                            <span id="toolbar-stop-icon" ref={el => el && setIcon(el, 'UI_STOP_STREAM')}></span>
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};