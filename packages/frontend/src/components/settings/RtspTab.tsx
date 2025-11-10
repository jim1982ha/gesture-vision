/* FILE: packages/frontend/src/components/settings/RtspTab.tsx */
import { useState, useContext } from 'react';
import { AppContext } from '#frontend/contexts/AppContext.js';
import { useAppStore } from '#frontend/hooks/useAppStore.js';
import { setIcon } from '#frontend/ui/helpers/ui-helpers.js';
import { pubsub, UI_EVENTS, type RtspSourceConfig, normalizeNameForMtx } from '#shared/index.js';
import { CardList } from '#frontend/components/shared/CardList.js';
import { RtspSourceCard } from './cards/RtspSourceCard.js';
import { RtspForm } from './forms/RtspForm.js';

export function RtspTab() {
    const context = useContext(AppContext);
    const { rtspSources } = useAppStore(state => ({ rtspSources: state.rtspSources }));
    const [editingIndex, setEditingIndex] = useState<number | null>(null);
    const [isAdding, setIsAdding] = useState(false);
    
    if (!context) return null;
    const { actions } = context.appStore.getState();
    const { translate } = context.services.translationService;

    const handleSave = (sourceData: RtspSourceConfig) => {
        const isNameDuplicate = rtspSources.some((source, index) => normalizeNameForMtx(source.name) === normalizeNameForMtx(sourceData.name) && index !== editingIndex);
        if (isNameDuplicate) {
            pubsub.publish(UI_EVENTS.SHOW_ERROR, { messageKey: "configExists", substitutions: { name: sourceData.name } }); 
            return;
        }

        const updatedSources = [...rtspSources];
        if (editingIndex !== null) {
            updatedSources[editingIndex] = sourceData;
        } else {
            updatedSources.push(sourceData);
        }
        actions.requestBackendPatch({ rtspSources: updatedSources });
        setEditingIndex(null);
        setIsAdding(false);
    };

    const handleDelete = (index: number) => {
        const sourceToDelete = rtspSources[index];
        actions.openOverlay('confirmation', {
            messageKey: "confirmDeleteMessage",
            messageSubstitutions: { item: sourceToDelete.name },
            confirmTextKey: 'delete',
            isDangerAction: true,
            onConfirm: () => {
                const updatedSources = rtspSources.filter((_, i) => i !== index);
                actions.requestBackendPatch({ rtspSources: updatedSources });
            }
        });
    };

    const isFormVisible = isAdding || editingIndex !== null;

    return (
        <div id="settings-rtsp-tab">
            {isFormVisible ? (
                <RtspForm
                    source={editingIndex !== null ? rtspSources[editingIndex] : null}
                    onCancel={() => { setIsAdding(false); setEditingIndex(null); }}
                    onSave={handleSave}
                />
            ) : (
                <>
                    <CardList
                        id="rtspSourceListContainer"
                        className="mb-4"
                        items={rtspSources}
                        renderItem={(source, index) => (
                            <RtspSourceCard 
                                key={index} 
                                source={source} 
                                onEdit={() => setEditingIndex(index)} 
                                onDelete={() => handleDelete(index)} 
                            />
                        )}
                        placeholder={<p id="rtsp-list-placeholder" className="list-placeholder">{translate("noRtspSourcesConfigured")}</p>}
                    />
                    <div className="flex justify-end mb-4">
                        <button id="rtspAddNewButton" className="btn btn-primary" onClick={() => setIsAdding(true)}>
                            <span ref={el => el && setIcon(el, 'UI_ADD')}></span><span>{translate('add')}</span>
                        </button>
                    </div>
                </>
            )}
        </div>
    );
}