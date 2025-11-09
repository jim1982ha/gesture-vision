/* FILE: packages/frontend/src/components/shared/cards/HistoryCard.tsx */
import { useContext } from 'react';
import { AppContext } from '#frontend/contexts/AppContext.js';
import { useAppStore } from '#frontend/hooks/useAppStore.js';
import { setIcon, clsx } from '#frontend/ui/helpers/ui-helpers.js';
import type { HistoryEntry } from '#frontend/types/index.js';
import { getGestureDisplayInfo, type ActionConfig } from '#shared/index.js';
import { ActionDetailsDisplay } from '#frontend/components/shared/ActionDetailsDisplay.js';
import { CardRoot, CardHeader, CardIcon, CardTitle, CardFooter } from './Card.js';

export const HistoryCard = ({ entry }: { entry: HistoryEntry }) => {
    const context = useContext(AppContext);
    const { customGestureMetadataList, pluginManifests } = useAppStore(state => ({
        customGestureMetadataList: state.customGestureMetadataList,
        pluginManifests: state.pluginManifests,
    }));
    
    if (!context) return null;
    const { translate } = context!.services.translationService;

    const { formattedName, iconDetails } = getGestureDisplayInfo(entry.gesture, customGestureMetadataList);
    const time = entry.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });

    let statusIcon: string, statusClass: string, statusTitle: string;
    if (entry.success === undefined || entry.reason === 'AWAITING_RESULT') {
        statusIcon = 'UI_HOURGLASS'; statusClass = 'text-text-secondary'; statusTitle = 'Awaiting Result';
    } else if (entry.success) {
        statusIcon = 'UI_CHECK_CIRCLE'; statusClass = 'text-success'; statusTitle = 'Success';
    } else {
        statusIcon = 'UI_ERROR'; statusClass = 'text-error'; statusTitle = entry.reason || 'Failed';
    }

    const pluginId = entry.actionType;
    const manifest = pluginId ? pluginManifests.find(m => m.id === pluginId) : null;
    const cardFooterText = manifest
        ? translate(manifest.nameKey, { defaultValue: manifest.id })
        : translate('actionTypeNone');

    return (
        <CardRoot id={`history-card-${entry.id}`} className="history-item">
            <CardHeader id={`history-card-header-${entry.id}`}>
                <CardIcon id={`history-card-icon-${entry.id}`} iconKey={iconDetails.iconName} />
                <CardTitle id={`history-card-title-${entry.id}`}>{translate(formattedName, { defaultValue: formattedName })}</CardTitle>
                <span ref={el => el && setIcon(el, statusIcon)} className={clsx("material-icons ml-auto text-lg", statusClass)} title={statusTitle}></span>
            </CardHeader>
            
            <ActionDetailsDisplay actionConfig={entry.details as ActionConfig} />

            <CardFooter
                id={`history-card-footer-${entry.id}`}
                leftContent={<span className="truncate">{cardFooterText}</span>}
                rightContent={<span title={entry.reason || 'No action configured'}>{time}</span>}
            />
        </CardRoot>
    );
};