/* FILE: packages/frontend/src/components/main/GestureSettingsSidebar.tsx */
import { useContext } from 'react';
import { AppContext } from '#frontend/contexts/AppContext.js';
import { useAppStore } from '#frontend/hooks/useAppStore.js';
import { clsx, setIcon } from '#frontend/ui/helpers/ui-helpers.js';
import { GestureConfigForm } from '#frontend/components/config/GestureConfigForm.js';
import type { GestureConfig, PoseConfig } from '#shared/index.js';

export const GestureSettingsSidebar = ({ isOpen }: { isOpen: boolean }) => {
    const context = useContext(AppContext);
    const { translate } = context!.services.translationService;
    const { gestureConfigs, editingGestureConfigName, actions } = useAppStore(state => ({
        gestureConfigs: state.gestureConfigs,
        editingGestureConfigName: state.editingGestureConfigName,
        actions: state.actions
    }));
    
    if (!context) return null;

    const editingConfig = editingGestureConfigName ? gestureConfigs.find(c => ('gesture' in c ? c.gesture : c.pose) === editingGestureConfigName) || null : null;

    const handleSave = (configToSave: GestureConfig | PoseConfig) => {
        const currentConfigs = [...gestureConfigs];
        const configName = 'gesture' in configToSave ? configToSave.gesture : configToSave.pose;

        const existingIndex = editingGestureConfigName ? currentConfigs.findIndex(c => ('gesture' in c ? c.gesture : c.pose) === editingGestureConfigName) : -1;
        
        if (existingIndex > -1) {
            currentConfigs[existingIndex] = configToSave;
        } else {
            const isDuplicate = currentConfigs.some(c => ('gesture' in c ? c.gesture : c.pose) === configName);
            if (isDuplicate) {
                // This case should be prevented by the form's dropdown logic, but serves as a safeguard
                return; 
            }
            currentConfigs.push(configToSave);
        }
        
        actions.requestBackendPatch({ gestureConfigs: currentConfigs });
        actions.toggleGestureSettingsSidebar(false);
    };

    const handleCancel = () => actions.toggleGestureSettingsSidebar(false);
    
    return (
        <aside 
            id="gestureSettingsSidebar" 
            className={clsx(
                "sidebar-container",
                isOpen ? 'translate-x-0' : 'translate-x-full'
            )}
        >
            <div id="gesture-settings-sidebar-header" className="sidebar-header">
                <div className="flex items-center gap-2 min-w-0 flex-grow">
                    <span ref={el => el && setIcon(el, 'UI_TUNE')} className="header-icon material-icons"></span>
                    <span id="gesture-settings-sidebar-title" className="header-title">
                        {translate(editingConfig ? 'editXTitle' : 'addNewAction', { item: '' })}
                    </span>
                </div>
                <div id="gesture-settings-sidebar-actions" className="sidebar-header-actions flex items-center flex-shrink-0">
                    <button id="gesture-settings-sidebar-close-button" onClick={handleCancel} className="btn btn-icon" title={translate('close')}>
                        <span ref={el => el && setIcon(el, 'UI_CLOSE')}></span>
                    </button>
                </div>
            </div>
            <div id="gesture-settings-sidebar-content" className="p-4 flex-1 overflow-y-auto">
                <GestureConfigForm 
                    editingConfig={editingConfig || null}
                    onSave={handleSave}
                    onCancel={handleCancel}
                />
            </div>
        </aside>
    );
};