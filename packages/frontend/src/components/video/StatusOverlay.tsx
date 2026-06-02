/* FILE: packages/frontend/src/components/video/StatusOverlay.tsx */
import { useContext } from 'react';
import { AppContext } from '#frontend/contexts/AppContext.js';
import { useAppStore } from '#frontend/hooks/useAppStore.js';
import { setIcon } from '#frontend/ui/helpers/ui-helpers.js';

export const StatusOverlay = () => {
    const context = useContext(AppContext);
    const { isWebcamRunning: isStreamRunning, isStreamConnecting } = useAppStore(state => ({
        isWebcamRunning: state.isWebcamRunning,
        isStreamConnecting: state.isStreamConnecting,
    }));
    
    if (!context) return null;

    const { translate } = context.services.translationService;
    const { actions } = context.appStore.getState();
    
    let state: 'hidden' | 'connecting' | 'idle' = 'hidden';
    if (isStreamConnecting) state = 'connecting';
    else if (!isStreamRunning) state = 'idle';

    if (state === 'hidden') return null;

    return (
        <div id="status-overlay" className="absolute inset-0 z-20 flex flex-col items-center justify-center rounded-inherit text-on-primary transition-opacity duration-200 overlay-active">
            {state === 'connecting' && (
                <div id="status-overlay-connecting" className="overlay-text-container flex flex-col items-center justify-center">
                    <div className="h-8 w-8 animate-spin rounded-full border-4 border-solid border-white border-r-transparent"></div>
                    <div id="connectingText" className="connecting-text">{translate('connecting')}</div>
                </div>
            )}
            {state === 'idle' && (
                <div id="status-overlay-idle" className="overlay-icon-container h-16 w-16 cursor-pointer items-center justify-center rounded-full transition-all duration-200" onClick={() => actions.openOverlay('cameraSelect')}>
                    <span ref={el => el && setIcon(el, 'UI_PLAY')} className="text-4xl"></span>
                </div>
            )}
        </div>
    );
};