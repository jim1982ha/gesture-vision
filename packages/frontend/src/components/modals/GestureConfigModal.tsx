/* FILE: packages/frontend/src/components/modals/GestureConfigModal.tsx */
import { useContext } from 'react';
import { AppContext } from '#frontend/contexts/AppContext.js';
import { useAppStore } from '#frontend/hooks/useAppStore.js';
import { setIcon } from '#frontend/ui/helpers/ui-helpers.js';
import { GestureConfigForm } from '#frontend/components/config/GestureConfigForm.js';
import type { GestureConfig, PoseConfig } from '#shared/index.js';

export const GestureConfigModal = () => {
    const context = useContext(AppContext);
    const { config, gestureConfigs, actions } = useAppStore(state => ({
        config: state.gestureFormConfig,
        gestureConfigs: state.gestureConfigs,
        actions: state.actions,
    }));
    
    if (!context) return null;
    const { translate } = context.services.translationService;

    const handleSave = (configToSave: GestureConfig | PoseConfig) => {
        const currentConfigs = [...gestureConfigs];
        const originalName = config ? ('gesture' in config ? config.gesture : config.pose) : null;

        const existingIndex = originalName
            ? currentConfigs.findIndex(c => ('gesture' in c ? c.gesture : c.pose) === originalName)
            : -1;
        
        if (existingIndex > -1) {
            currentConfigs[existingIndex] = configToSave;
        } else {
            currentConfigs.push(configToSave);
        }
        
        actions.requestBackendPatch({ gestureConfigs: currentConfigs });
        actions.closeCurrentOverlay();
    };

    const handleCancel = () => actions.closeCurrentOverlay();

    return (
        <div id="gesture-config-modal" className="modal visible" role="dialog" aria-modal="true">
            <div id="gesture-config-modal-content" className="modal-content !max-w-xl">
                 <div id="gesture-config-modal-header" className="modal-header">
                    <span ref={el => el && setIcon(el, 'UI_TUNE')} className="header-icon material-icons"></span>
                    <span id="gesture-config-modal-title" className="header-title">
                        {translate(config ? 'editXTitle' : 'addNewAction', { item: 'Action' })}
                    </span>
                    <button id="gesture-config-modal-close-button" onClick={handleCancel} className="btn btn-icon header-close-btn" title={translate('close')}>
                        <span ref={el => el && setIcon(el, 'UI_CLOSE')}></span>
                    </button>
                </div>
                <div id="gesture-config-modal-form-container" className="modal-scrollable-content p-4">
                    <GestureConfigForm 
                        editingConfig={config}
                        onSave={handleSave}
                        onCancel={handleCancel}
                    />
                </div>
            </div>
        </div>
    );
};