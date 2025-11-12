/* FILE: packages/frontend/src/components/settings/CustomGesturesTab.tsx */
import { useState, useEffect, useRef, useContext } from 'react';
import { AppContext } from '#frontend/contexts/AppContext.js';
import { useAppStore } from '#frontend/hooks/useAppStore.js';
import { setIcon } from '#frontend/ui/helpers/ui-helpers.js';
import { pubsub, UI_EVENTS, WEBSOCKET_EVENTS, type CustomGestureMetadata, type UploadCustomGesturePayload } from '#shared/index.js';
import { webSocketService } from '#frontend/services/websocket-service.js';
import { PluginSlot } from '#frontend/components/plugins/PluginSlot.js';
import { CardList } from '#frontend/components/shared/CardList.js';
import { CustomGestureCard } from './cards/CustomGestureCard.js';
import { CustomGestureForm } from './forms/CustomGestureForm.js';

const GestureImportManager = () => {
    const context = useContext(AppContext);
    const { translate } = context!.services.translationService;
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [stagedFile, setStagedFile] = useState<File | null>(null);

    useEffect(() => {
        if (!stagedFile) return;

        const reader = new FileReader();
        reader.onload = async (e) => {
            const codeString = e.target?.result as string;
            const payload: UploadCustomGesturePayload = { name: '', type: 'hand', codeString, source: 'core' };
            webSocketService.sendMessage({ type: WEBSOCKET_EVENTS.UPLOAD_CUSTOM_GESTURE, payload });
        };
        reader.readAsText(stagedFile);
        setStagedFile(null);
    }, [stagedFile]);
    
    if (!context) return null;

    const handleUploadClick = () => fileInputRef.current?.click();

    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file || !file.name.endsWith('.js')) {
            pubsub.publish(UI_EVENTS.SHOW_ERROR, { messageKey: "customGestureFileReq", type: 'warning' });
            return;
        }
        setStagedFile(file);
        event.target.value = ''; // Reset file input to allow re-uploading the same file
    };

    return (
        <div id="custom-gestures-actions-container" className="flex justify-end items-center gap-2">
            <PluginSlot slotId="custom-gestures-actions-slot" />
            <input id="custom-gestures-file-input" type="file" ref={fileInputRef} className="visually-hidden" accept=".js" onChange={handleFileChange} />
            <button id="custom-gestures-upload-button" onClick={handleUploadClick} type="button" className="btn btn-secondary">
                <span ref={el => el && setIcon(el, 'UI_FILE_ATTACH')}></span>
                <span>{translate('uploadFileButtonText')}</span>
            </button>
        </div>
    );
};

export function CustomGesturesTab() {
    const context = useContext(AppContext);
    const customGestureMetadataList = useAppStore(state => state.customGestureMetadataList);
    const [editingGesture, setEditingGesture] = useState<CustomGestureMetadata | null>(null);
    
    if (!context) return null;

    const { translate } = context.services.translationService;
    const handGestures = customGestureMetadataList.filter(g => g.type !== 'pose');
    const poseGestures = customGestureMetadataList.filter(g => g.type === 'pose');
    
    const closeForm = () => setEditingGesture(null);

    return (
        <div id="settings-custom-gestures-tab">
            {editingGesture ? (
                <CustomGestureForm gesture={editingGesture} onCancel={closeForm} onSave={closeForm} />
            ) : (
                <>
                    <div id="custom-gestures-hand-section" className="form-section">
                        <h4 id="custom-gestures-hand-title" className="form-label">{translate('savedCustomGesturesTitle', { type: translate('Hand') })}</h4>
                        <CardList
                            id="custom-gestures-hand-list"
                            className="mt-2"
                            items={handGestures}
                            renderItem={(def) => <CustomGestureCard key={def.id} def={def} onEdit={setEditingGesture} />}
                            placeholder={<p className="list-placeholder">{translate('noCustomGesturesSaved', { type: translate('Hand') })}</p>}
                        />
                    </div>
                    <div id="custom-gestures-pose-section" className="form-section">
                        <h4 id="custom-gestures-pose-title" className="form-label">{translate('savedCustomGesturesTitle', { type: translate('Pose') })}</h4>
                        <CardList
                            id="custom-gestures-pose-list"
                            className="mt-2"
                            items={poseGestures}
                            renderItem={(def) => <CustomGestureCard key={def.id} def={def} onEdit={setEditingGesture} />}
                            placeholder={<p className="list-placeholder">{translate('noCustomGesturesSaved', { type: translate('Pose') })}</p>}
                        />
                    </div>
                    <div className="form-section">
                        <GestureImportManager />
                    </div>
                </>
            )}
        </div>
    );
}