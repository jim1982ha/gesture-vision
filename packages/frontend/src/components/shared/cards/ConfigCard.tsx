/* FILE: packages/frontend/src/components/shared/cards/ConfigCard.tsx */
import { useContext } from 'react';
import { AppContext } from '#frontend/contexts/AppContext.js';
import { useAppStore } from '#frontend/hooks/useAppStore.js';
import { setIcon } from '#frontend/ui/helpers/ui-helpers.js';
import { pubsub, UI_EVENTS, getGestureDisplayInfo, type GestureConfig, type PoseConfig } from '#shared/index.js';
import { ActionDetailsDisplay } from '#frontend/components/shared/ActionDetailsDisplay.js';
import { CardRoot, CardHeader, CardIcon, CardTitle, CardActions, CardFooter } from './Card.js';

export const ConfigCard = ({ config }: { config: GestureConfig | PoseConfig }) => {
    const context = useContext(AppContext);
    const { translate } = context!.services.translationService;
    const { actions } = context!.appStore.getState();
    const { customGestureMetadataList, pluginManifests } = useAppStore(state => ({
        customGestureMetadataList: state.customGestureMetadataList,
        pluginManifests: state.pluginManifests,
    }));
    
    if (!context) return null;

    const gestureName = 'gesture' in config ? config.gesture : config.pose;
    const { formattedName, iconDetails } = getGestureDisplayInfo(gestureName, customGestureMetadataList);

    const pluginId = config.actionConfig?.pluginId;
    const manifest = pluginId ? pluginManifests.find(m => m.id === pluginId) : null;
    const cardFooterText = manifest
        ? translate(manifest.nameKey, { defaultValue: manifest.id })
        : translate('actionTypeNone');

    const handleDelete = () => {
        actions.showConfirmationModal({
            messageKey: "confirmDeleteMessage",
            messageSubstitutions: { item: gestureName },
            confirmTextKey: 'delete',
            isDangerAction: true,
            onConfirm: () => {
                const currentConfigs = context.appStore.getState().gestureConfigs;
                const updatedConfigs = currentConfigs.filter(c => ('gesture' in c ? c.gesture : c.pose) !== gestureName);
                actions.requestBackendPatch({ gestureConfigs: updatedConfigs });
            },
        });
    };
    const handleEdit = () => pubsub.publish(UI_EVENTS.REQUEST_EDIT_CONFIG, gestureName);

    return (
        <CardRoot id={`config-card-${gestureName}`} data-gesture-name={gestureName} onClick={handleEdit}>
            <CardHeader id={`config-card-header-${gestureName}`}>
                <CardIcon id={`config-card-icon-${gestureName}`} iconKey={iconDetails.iconName} />
                <CardTitle id={`config-card-title-${gestureName}`}>{translate(formattedName, { defaultValue: formattedName })}</CardTitle>
                <CardActions id={`config-card-actions-${gestureName}`}>
                    <button id={`config-card-edit-button-${gestureName}`} onClick={e => { e.stopPropagation(); handleEdit(); }} className="btn btn-icon edit-btn" title={translate('editTooltip', { item: gestureName })}>
                        <span ref={el => el && setIcon(el, 'UI_EDIT_NOTE')}></span>
                    </button>
                    <button id={`config-card-delete-button-${gestureName}`} onClick={e => { e.stopPropagation(); handleDelete(); }} className="btn btn-icon btn-icon-danger delete-btn" title={translate('deleteTooltip', { item: gestureName })}>
                        <span ref={el => el && setIcon(el, 'UI_DELETE_FOREVER')}></span>
                    </button>
                </CardActions>
            </CardHeader>
            
            <ActionDetailsDisplay actionConfig={config.actionConfig} />

            <CardFooter
                id={`config-card-footer-${gestureName}`}
                leftContent={<span className="truncate">{cardFooterText}</span>}
                rightContent={
                    <>
                        <span id={`config-card-confidence-pill-${gestureName}`} className="confidence-pill">{config.confidence}%</span>
                        {config.duration && <span id={`config-card-duration-pill-${gestureName}`} className="duration-pill">{config.duration}s</span>}
                    </>
                }
            />
        </CardRoot>
    );
};