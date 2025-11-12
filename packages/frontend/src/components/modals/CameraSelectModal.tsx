/* FILE: packages/frontend/src/components/modals/CameraSelectModal.tsx */
import { useContext, useEffect, useState } from 'react';
import { AppContext } from '#frontend/contexts/AppContext.js';
import { useAppStore } from '#frontend/hooks/useAppStore.js';
import { pubsub, CAMERA_SOURCE_EVENTS, normalizeNameForMtx, type GestureCategoryIconType } from '#shared/index.js';
import { setIcon } from '#frontend/ui/helpers/ui-helpers.js';
import { Modal } from '#frontend/components/shared/Modal.js';

const CameraListItem = ({ id, label }: { id: string, label: string }) => {
    const context = useContext(AppContext);
    const { streamStatus, actions } = useAppStore(state => ({
        streamStatus: state.streamStatus,
        actions: state.actions,
    }));
    
    if (!context || !context.services.cameraService) return null;

    const { translate } = context.services.translationService;
    const { cameraService } = context.services;

    const isRtsp = id.startsWith("rtsp:");
    const status = isRtsp ? streamStatus.get(normalizeNameForMtx(id.substring(5))) || "unknown" : undefined;
    const iconKey: GestureCategoryIconType = isRtsp ? "UI_RTSP_STREAM" : "UI_WEBCAM";

    const handleClick = () => {
        cameraService.setSelectedCameraSource(id);
        cameraService.startStream({ cameraId: id });
        actions.closeCurrentOverlay();
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
    const { actions, activeModalId } = useAppStore(state => ({
        actions: state.actions,
        activeModalId: state.activeOverlays.at(-1)?.id,
    }));
    const [deviceMap, setDeviceMap] = useState<Map<string, string>>(new Map());

    useEffect(() => {
        const updateMap = (map: unknown) => setDeviceMap(new Map(map as Map<string, string>));
        const unsubscribe = pubsub.subscribe(CAMERA_SOURCE_EVENTS.MAP_UPDATED, updateMap);
        
        context?.services.cameraService?.refreshDeviceList();

        return () => unsubscribe();
    }, [context?.services.cameraService]);
    
    if (!context) return null;

    const { translationService } = context.services;
    const { translate } = translationService;
    
    const sortedDevices = [...deviceMap.entries()].sort((a, b) => a[1].localeCompare(b[1]));

    return (
        <Modal
            id="cameraSelectModal"
            title={translate('selectCameraSource')}
            iconKey="UI_WEBCAM"
            onClose={() => actions.closeCurrentOverlay()}
            show={activeModalId === 'cameraSelect'}
        >
            <div className="modal-scrollable-content p-4">
                <ul id="camera-select-modal-list" className="flex flex-col gap-2">
                    {sortedDevices.length > 0 ? (
                        sortedDevices.map(([id, label]) => <CameraListItem key={id} id={id} label={label} />)
                    ) : (
                        <li id="camera-select-no-camera-placeholder" className="list-placeholder">{translate('noCamera')}</li>
                    )}
                </ul>
            </div>
        </Modal>
    );
};