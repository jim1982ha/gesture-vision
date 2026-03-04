// --- packages/frontend/src/components/settings/cards/PluginCard.tsx --- (complete version) ---
/* FILE: packages/frontend/src/components/settings/cards/PluginCard.tsx */
import { useState, useContext, type ComponentType } from 'react';
import { AppContext } from '#frontend/contexts/AppContext.js';
import { type PluginManifest } from '#shared/index.js';
import { setIcon, clsx } from '#frontend/ui/helpers/ui-helpers.js';
import { CardRoot, CardHeader, CardIcon, CardTitle, CardActions, CardDetails, CardDetailLine, CardFooter } from '#frontend/components/shared/cards/Card.js';

export const PluginCard = ({ manifest }: { manifest: PluginManifest }) => {
    const context = useContext(AppContext);
    const [isEditing, setIsEditing] = useState(false);
    const [isPending, setIsPending] = useState(false);
    const [isLoadingForm, setIsLoadingForm] = useState(false);
    const [GlobalSettingsComponent, setGlobalSettingsComponent] = useState<ComponentType<{ manifest: PluginManifest; onSaveSuccess?: () => void; onCancel?: () => void; }> | null>(null);

    if (!context) return null;
    const { translate } = context.services.translationService;
    const { actions } = context.appStore.getState();
    const { pluginUIService } = context.services;

    const handleToggle = async () => {
        if (manifest.locked) return;
        setIsPending(true);
        const newState = manifest.status === 'enabled' ? 'disabled' : 'enabled';
        try {
            await fetch(`/api/plugins/manage/${manifest.id}/state`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ state: newState }),
            });
        } catch (error) {
            console.error(`Failed to toggle plugin ${manifest.id}`, error);
        } finally {
            setIsPending(false);
        }
    };

    const handleUninstall = () => {
        if (manifest.locked) return;
        actions.openOverlay('confirmation', {
            titleKey: 'uninstall',
            messageKey: 'confirmDeleteMessage',
            messageSubstitutions: { item: translate(manifest.nameKey) },
            confirmTextKey: 'uninstall',
            isDangerAction: true,
            onConfirm: async () => {
                setIsPending(true);
                try {
                    await fetch(`/api/plugins/manage/${manifest.id}/uninstall`, { method: 'POST' });
                } catch (error) {
                    console.error(`Failed to uninstall plugin ${manifest.id}`, error);
                } finally {
                    setIsPending(false);
                }
            }
        });
    };

    const handleEditClick = () => {
        setIsEditing(true);
        if (GlobalSettingsComponent || isLoadingForm || !manifest.capabilities.hasGlobalSettings) return;
        
        setIsLoadingForm(true);
        pluginUIService.loadPluginFrontendModule(manifest.id)
            .then(module => {
                setGlobalSettingsComponent(() => module?.GlobalSettingsComponent || null);
            })
            .catch(error => console.error(`Failed to load settings form for ${manifest.id}`, error))
            .finally(() => setIsLoadingForm(false));
    };

    const handleCancelEditing = () => setIsEditing(false);
    const handleSaveSuccess = () => setIsEditing(false);

    return (
        <CardRoot id={`plugin-card-${manifest.id}`} className={clsx(manifest.status === 'disabled' && 'config-item-disabled', isPending && 'is-pending')}>
            <CardHeader id={`plugin-card-header-${manifest.id}`}>
                <CardIcon id={`plugin-card-icon-${manifest.id}`} iconKey={manifest.icon?.name || 'UI_EXTENSION'} />
                <CardTitle id={`plugin-card-title-${manifest.id}`}>{translate(manifest.nameKey, { defaultValue: manifest.id })}</CardTitle>
                
                {!isEditing && (
                    <CardActions id={`plugin-card-actions-${manifest.id}`}>
                        {/* MODIFIED: Hide Edit button if plugin is locked (System Managed) */}
                        {manifest.capabilities.hasGlobalSettings && !manifest.locked && (
                            <button id={`plugin-card-edit-button-${manifest.id}`} className="btn btn-icon" onClick={handleEditClick} title={translate('edit')}>
                                <span ref={el => el && setIcon(el, 'UI_EDIT_NOTE')}></span>
                            </button>
                        )}
                        
                        {/* Only show management buttons if not locked */}
                        {!manifest.locked && (
                            <>
                                <button id={`plugin-card-toggle-button-${manifest.id}`} className="btn btn-icon" onClick={handleToggle} title={translate(manifest.status === 'enabled' ? 'disable' : 'enable')}>
                                    <span ref={el => el && setIcon(el, manifest.status === 'enabled' ? 'UI_TOGGLE_ON' : 'UI_TOGGLE_OFF')}></span>
                                </button>
                                <button id={`plugin-card-uninstall-button-${manifest.id}`} className="btn btn-icon btn-icon-danger" onClick={handleUninstall} title={translate('uninstall')}>
                                    <span ref={el => el && setIcon(el, 'UI_DELETE_FOREVER')}></span>
                                </button>
                            </>
                        )}
                        
                        {/* If locked, show a lock icon to indicate system management */}
                        {manifest.locked && (
                             <span className="material-icons text-text-secondary text-sm ml-1 opacity-60 cursor-help" title="System Managed (Config Locked)">lock</span>
                        )}
                    </CardActions>
                )}
            </CardHeader>

            {isEditing && manifest.capabilities.hasGlobalSettings ? (
                <div className="mt-3 pt-3">
                    {isLoadingForm && <div id={`plugin-settings-form-loading-${manifest.id}`}>Loading...</div>}
                    {!isLoadingForm && GlobalSettingsComponent && (
                        <GlobalSettingsComponent manifest={manifest} onCancel={handleCancelEditing} onSaveSuccess={handleSaveSuccess} />
                    )}
                    {!isLoadingForm && !GlobalSettingsComponent && <div id={`plugin-settings-form-error-${manifest.id}`}>Error loading settings form.</div>}
                </div>
            ) : (
                <>
                    <CardDetails id={`plugin-card-details-${manifest.id}`}>
                        <CardDetailLine id={`plugin-card-description-${manifest.id}`} iconKey="UI_NOTES">
                            <span className="allow-wrap">{translate(manifest.descriptionKey || '', { defaultValue: '' })}</span>
                        </CardDetailLine>
                    </CardDetails>
                     <CardFooter
                        id={`plugin-card-footer-${manifest.id}`}
                        leftContent={
                            <span id={`plugin-card-version-${manifest.id}`} className="truncate">v{manifest.version} by {manifest.author || 'Unknown'}</span>
                        }
                    />
                </>
            )}
        </CardRoot>
    );
};