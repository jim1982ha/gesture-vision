/* FILE: packages/frontend/src/components/modals/GestureConfigModal.tsx */
import { useContext } from 'react';
import { AppContext } from '#frontend/contexts/AppContext.js';
import { useAppStore } from '#frontend/hooks/useAppStore.js';
import { GestureConfigForm } from '#frontend/components/config/GestureConfigForm.js';
import { Modal } from '#frontend/components/shared/Modal.js';
import { enrichGestureConfigs } from '#frontend/core/state/utils/enrichment.utils.js';
import type { GestureConfig, PoseConfig } from '#shared/index.js';

export const GestureConfigModal = () => {
    const context = useContext(AppContext);
    const { config, gestureConfigs, customGestureMetadataList, actions, activeModalId } = useAppStore(state => ({
        config: state.gestureFormConfig,
        gestureConfigs: state.gestureConfigs,
        customGestureMetadataList: state.customGestureMetadataList,
        actions: state.actions,
        activeModalId: state.activeOverlays.at(-1)?.id,
    }));
    
    if (!context) return null;
    const { translate } = context.services.translationService;

    const handleSave = (configToSave: GestureConfig | PoseConfig) => {
        const currentConfigs = [...gestureConfigs];
        const originalName = config ? config.display.name : null;

        const existingIndex = originalName
            ? currentConfigs.findIndex(c => c.display.name === originalName)
            : -1;
        
        const [enrichedConfigToSave] = enrichGestureConfigs([configToSave], customGestureMetadataList);
        
        if (existingIndex > -1) {
            currentConfigs[existingIndex] = enrichedConfigToSave;
        } else {
            currentConfigs.push(enrichedConfigToSave);
        }
        
        const configsForBackend = currentConfigs.map(({ display: _display, ...rest }) => rest);
        actions.requestBackendPatch({ gestureConfigs: configsForBackend });
        actions.closeCurrentOverlay();
    };

    const handleCancel = () => actions.closeCurrentOverlay();

    return (
        <Modal
            id="gesture-config-modal"
            title={translate(config ? 'editXTitle' : 'addNewAction', { item: 'Action' })}
            iconKey="UI_TUNE"
            onClose={handleCancel}
            show={activeModalId === 'gestureForm'}
            size="lg"
        >
            <div id="gesture-config-modal-form-container" className="modal-scrollable-content p-4">
                <GestureConfigForm 
                    editingConfig={config}
                    onSave={handleSave}
                    onCancel={handleCancel}
                />
            </div>
        </Modal>
    );
};