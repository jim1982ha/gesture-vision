/* FILE: packages/frontend/src/components/settings/cards/CustomGestureCard.tsx */
import { useContext } from 'react';
import { AppContext } from '#frontend/contexts/AppContext.js';
import { setIcon, getGestureDisplayInfo } from '#frontend/ui/helpers/ui-helpers.js';
import { WEBSOCKET_EVENTS, type CustomGestureMetadata } from '#shared/index.js';
import { webSocketService } from '#frontend/services/websocket-service.js';
import { CardRoot, CardHeader, CardIcon, CardTitle, CardActions, CardDetails, CardDetailLine } from '#frontend/components/shared/cards/Card.js';

interface CustomGestureCardProps {
  def: CustomGestureMetadata;
  onEdit: (def: CustomGestureMetadata) => void;
}

export const CustomGestureCard = ({ def, onEdit }: CustomGestureCardProps) => {
    const context = useContext(AppContext);
    const { actions } = context!.appStore.getState();
    const { iconDetails } = getGestureDisplayInfo(def.name, [def]);
    
    if (!context) return null;
    
    const handleDelete = () => {
        actions.showConfirmationModal({
            titleKey: 'confirmDeleteGestureTitle',
            messageKey: 'confirmDeleteMessage',
            messageSubstitutions: { item: def.name },
            confirmTextKey: 'delete',
            isDangerAction: true,
            onConfirm: () => webSocketService.sendMessage({ type: WEBSOCKET_EVENTS.DELETE_CUSTOM_GESTURE, payload: { id: def.id, name: def.name } })
        });
    };

    return (
        <CardRoot id={`custom-gesture-card-${def.id}`} data-gesture-id={def.id}>
            <CardHeader id={`custom-gesture-card-header-${def.id}`}>
                <CardIcon id={`custom-gesture-card-icon-${def.id}`} iconKey={iconDetails.iconName} />
                <CardTitle id={`custom-gesture-card-title-${def.id}`}>{def.name}</CardTitle>
                <CardActions id={`custom-gesture-card-actions-${def.id}`}>
                    <button id={`custom-gesture-card-edit-button-${def.id}`} onClick={() => onEdit(def)} className="btn btn-icon">
                        <span ref={el => el && setIcon(el, 'UI_EDIT_NOTE')}></span>
                    </button>
                    <button id={`custom-gesture-card-delete-button-${def.id}`} onClick={handleDelete} className="btn btn-icon btn-icon-danger">
                        <span ref={el => el && setIcon(el, 'UI_DELETE_FOREVER')}></span>
                    </button>
                </CardActions>
            </CardHeader>
            <CardDetails id={`custom-gesture-card-details-${def.id}`}>
                <CardDetailLine id={`custom-gesture-card-description-${def.id}`} iconKey='UI_NOTES'>
                    <span className="allow-wrap">{def.description || ''}</span>
                </CardDetailLine>
            </CardDetails>
        </CardRoot>
    );
};