/* FILE: packages/frontend/src/components/modals/ConfirmationModal.tsx */
import { useContext } from 'react';
import { AppContext } from '#frontend/contexts/AppContext.js';
import { useAppStore } from '#frontend/hooks/useAppStore.js';
import { setIcon, clsx } from '#frontend/ui/helpers/ui-helpers.js';
import { Modal } from '#frontend/components/shared/Modal.js';

export function ConfirmationModal() {
    const context = useContext(AppContext);
    const { confirmationModalConfig, activeModalId, actions } = useAppStore(state => ({
        confirmationModalConfig: state.confirmationModalConfig,
        activeModalId: state.activeOverlays.at(-1)?.id,
        actions: state.actions,
    }));
    
    if (!context || !confirmationModalConfig) return null;

    const { translate } = context.services.translationService;

    const {
        titleKey = 'confirmActionTitle', messageKey, messageSubstitutions = {},
        confirmTextKey = 'confirm', cancelTextKey = 'cancel',
        onConfirm, onCancel, isDangerAction = true
    } = confirmationModalConfig;

    const handleConfirm = () => { onConfirm(); actions.closeCurrentOverlay(); };
    const handleCancel = () => { onCancel?.(); actions.closeCurrentOverlay(); };

    const footer = (
        <>
            <div></div> {/* Spacer for justify-between */}
            <div className="flex gap-2">
                <button id="confirmation-modal-cancel-button" onClick={handleCancel} className="btn btn-secondary">
                    <span ref={el => el && setIcon(el, 'UI_CANCEL')}></span>
                    <span>{translate(cancelTextKey)}</span>
                </button>
                <button id="confirmation-modal-confirm-button" onClick={handleConfirm} className={clsx('btn', isDangerAction ? 'btn-danger' : 'btn-primary')}>
                    <span ref={el => el && setIcon(el, isDangerAction ? 'UI_DELETE_FOREVER' : 'UI_CONFIRM')}></span>
                    <span>{translate(confirmTextKey)}</span>
                </button>
            </div>
        </>
    );

    return (
        <Modal
            id="confirmationModal"
            title={translate(titleKey)}
            iconKey={isDangerAction ? 'UI_ERROR' : 'UI_INFO'}
            onClose={handleCancel}
            show={activeModalId === 'confirmation'}
            footer={footer}
        >
            <div className="modal-scrollable-content text-center p-4">
                <p id="confirmation-modal-message">{translate(messageKey, messageSubstitutions)}</p>
            </div>
        </Modal>
    );
}