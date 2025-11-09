/* FILE: packages/frontend/src/components/modals/CameraSelectModal.tsx */
import { useContext, useEffect, useState } from 'react';
import { AppContext } from '#frontend/contexts/AppContext.js';
import { useAppStore } from '#frontend/hooks/useAppStore.js';
import { pubsub, CAMERA_SOURCE_EVENTS, normalizeNameForMtx, type GestureCategoryIconType } from '#shared/index.js';
import { setIcon } from '#frontend/ui/helpers/ui-helpers.js';

const CameraListItem = ({ id, label }: { id: string, label: string }) => {
    const context = useContext(AppContext);
    const { streamStatus } = useAppStore(state => ({ streamStatus: state.streamStatus }));
    
    if (!context) return null;

    const { translate } = context.services.translationService;
    const { cameraService } = context.services;
    const { actions } = context.appStore.getState();

    const isRtsp = id.startsWith("rtsp:");
    const status = isRtsp ? streamStatus.get(normalizeNameForMtx(id.substring(5))) || "unknown" : undefined;
    const iconKey: GestureCategoryIconType = isRtsp ? "UI_RTSP_STREAM" : "UI_WEBCAM";

    const handleClick = () => {
        cameraService?.getCameraManager().getCameraSourceManager().setSelectedCameraSource(id);
        cameraService?.startStream({ cameraId: id });
        actions.toggleCameraSelectModal(false);
    };

    return (
        <li>
            <button id={`camera-select-item-${id}`} onClick={handleClick} className="btn btn-secondary w-full justify-start">
                <span ref={el => el && setIcon(el, iconKey)}></span>
                <span>{label}</span>
                {status && (
                    <div className="ml-auto">
                        <span id={`camera-select-status-${id}`} className={`stream-status-indicator status-${status}`} title={translate(`streamStatus${status.charAt(0).toUpperCase() + status.slice(1)}`)}></span>
                    </div>
                )}
            </button>
        </li>
    );
};

export const CameraSelectModal = () => {
    const context = useContext(AppContext);
    const [deviceMap, setDeviceMap] = useState<Map<string, string>>(new Map());

    useEffect(() => {
        const updateMap = (map: unknown) => setDeviceMap(new Map(map as Map<string, string>));
        const unsubscribe = pubsub.subscribe(CAMERA_SOURCE_EVENTS.MAP_UPDATED, updateMap);
        
        context?.services.cameraService?.getCameraManager().getCameraSourceManager().refreshDeviceList();

        return () => unsubscribe();
    }, [context?.services.cameraService]);
    
    if (!context) return null;

    const { translationService } = context.services;
    const { translate } = translationService;
    const { actions } = context.appStore.getState();
    
    const sortedDevices = [...deviceMap.entries()].sort((a, b) => a[1].localeCompare(b[1]));

    return (
        <div id="cameraSelectModal" className="modal visible" role="dialog" aria-modal="true">
            <div id="camera-select-modal-content" className="modal-content">
                <div id="camera-select-modal-header" className="modal-header">
                    <span ref={el => el && setIcon(el, 'UI_WEBCAM')} className="material-icons header-icon"></span>
                    <span id="camera-select-modal-title" className="header-title">{translate('selectCameraSource')}</span>
                    <button id="camera-select-modal-close-button" onClick={() => actions.toggleCameraSelectModal(false)} className="btn btn-icon header-close-btn" title={translate('close')}>
                        <span ref={el => el && setIcon(el, 'UI_CLOSE')}></span>
                    </button>
                </div>
                <ul id="camera-select-modal-list" className="modal-scrollable-content p-4 flex flex-col gap-2">
                    {sortedDevices.length > 0 ? (
                        sortedDevices.map(([id, label]) => <CameraListItem key={id} id={id} label={label} />)
                    ) : (
                        <li id="camera-select-no-camera-placeholder" className="list-placeholder">{translate('noCamera')}</li>
                    )}
                </ul>
            </div>
        </div>
    );
};