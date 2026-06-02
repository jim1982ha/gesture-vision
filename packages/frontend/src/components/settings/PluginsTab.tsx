/* FILE: packages/frontend/src/components/settings/PluginsTab.tsx */
import { useContext } from 'react';
import { AppContext } from '#frontend/contexts/AppContext.js';
import { useAppStore } from '#frontend/hooks/useAppStore.js';
import { pubsub } from '#shared/index.js';
import { CardList } from '#frontend/components/shared/CardList.js';
import { PluginCard } from './cards/PluginCard.js';
import { PluginInstall } from './forms/PluginInstall.js';

export function PluginsTab() {
    const context = useContext(AppContext);
    const { manifests, actions } = useAppStore(state => ({
        manifests: state.pluginManifests,
        actions: state.actions
    }));
    
    if (!context) return null;
    const { translate } = context.services.translationService;

    const sortedManifests = [...manifests].sort((a, b) => {
        const nameA = translate(a.nameKey, { defaultValue: a.id });
        const nameB = translate(b.nameKey, { defaultValue: b.id });
        return nameA.localeCompare(nameB);
    });

    return (
        <div id="settings-plugins-tab" className="flex flex-col h-full">
            <div className="flex-shrink-0">
                <PluginInstall />
            </div>
            <CardList
                id="pluginsListContainer"
                className="flex-1 overflow-y-auto min-h-0"
                items={sortedManifests}
                renderItem={(manifest) => <PluginCard key={manifest.id} manifest={manifest} />}
                placeholder={<p id="pluginsListPlaceholder" className="list-placeholder">{translate('noPluginsInstalled')}</p>}
            />
            <div id="plugin-dev-info-container" className="flex-shrink-0 flex items-center justify-center gap-2 text-sm py-2 mt-6">
                <span className="material-icons">code</span>
                <span id="plugin-dev-info-text">{translate('pluginDevInfoText')}</span>
                <button 
                    id="plugin-dev-info-link"
                    className="underline" 
                    type="button"
                    onClick={() => actions.openOverlay('docs', 'PLUGIN_DEV')}
                >
                    {translate('pluginDevInfoLink')}
                </button>
            </div>
        </div>
    );
}