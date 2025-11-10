/* FILE: packages/frontend/src/components/modals/ConfirmationModal.tsx */
import { useContext } from 'react';
import { AppContext } from '#frontend/contexts/AppContext.js';
import { useAppStore } from '#frontend/hooks/useAppStore.js';
import { setIcon, clsx } from '#frontend/ui/helpers/ui-helpers.js';

export function ConfirmationModal() {
    const context = useContext(AppContext);
    const { confirmationModalConfig } = useAppStore(state => ({
        confirmationModalConfig: state.confirmationModalConfig
    }));
    
    if (!context || !confirmationModalConfig) return null;

    const { translate } = context.services.translationService;
    const { actions } = context.appStore.getState();

    const {
        titleKey = 'confirmActionTitle', messageKey, messageSubstitutions = {},
        confirmTextKey = 'confirm', cancelTextKey = 'cancel',
        onConfirm, onCancel, isDangerAction = true
    } = confirmationModalConfig;

    const handleConfirm = () => {
        onConfirm();
        actions.closeCurrentOverlay();
    };

    const handleCancel = () => {
        onCancel?.();
        actions.closeCurrentOverlay();
    };

    return (
        <div id="confirmationModal" className="modal visible" role="dialog" aria-modal="true">
            <div id="confirmation-modal-content" className="modal-content">
                <h3 id="confirmation-modal-title" className="modal-header justify-center text-lg font-semibold">
                    {translate(titleKey)}
                </h3>
                <div className="modal-scrollable-content text-center">
                    <p id="confirmation-modal-message">{translate(messageKey, messageSubstitutions)}</p>
                </div>
                <div id="confirmation-modal-actions" className="modal-actions justify-end">
                    <button id="confirmation-modal-cancel-button" onClick={handleCancel} className="btn btn-secondary">
                        <span ref={el => el && setIcon(el, 'UI_CANCEL')}></span>
                        <span>{translate(cancelTextKey)}</span>
                    </button>
                    <button id="confirmation-modal-confirm-button" onClick={handleConfirm} className={clsx('btn', isDangerAction ? 'btn-danger' : 'btn-primary')}>
                        <span ref={el => el && setIcon(el, isDangerAction ? 'UI_DELETE_FOREVER' : 'UI_CONFIRM')}></span>
                        <span>{translate(confirmTextKey)}</span>
                    </button>
                </div>
            </div>
        </div>
    );
}