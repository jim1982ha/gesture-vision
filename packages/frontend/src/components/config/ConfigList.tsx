/* FILE: packages/frontend/src/components/config/ConfigList.tsx */
import { useContext } from 'react';
import { AppContext } from '#frontend/contexts/AppContext.js';
import { useAppStore } from '#frontend/hooks/useAppStore.js';
import { ConfigCard } from '#frontend/components/shared/cards/ConfigCard.js';
import { OnboardingGuide } from '#frontend/components/main/OnboardingGuide.js';
import type { EnrichedGestureConfig } from '#shared/index.js';

export function ConfigList() {
  const context = useContext(AppContext);
  const { configs, pluginManifests, enableBuiltInHandGestures, enableCustomHandGestures, enablePoseProcessing } = useAppStore(state => ({
    configs: state.gestureConfigs,
    pluginManifests: state.pluginManifests,
    enableBuiltInHandGestures: state.enableBuiltInHandGestures,
    enableCustomHandGestures: state.enableCustomHandGestures,
    enablePoseProcessing: state.enablePoseProcessing,
  }));
  
  if (!context) return null;
  const { translate } = context.services.translationService;
  
  const getCardStatus = (config: EnrichedGestureConfig) => {
    const actionPluginId = config.actionConfig?.pluginId;
    if (actionPluginId && actionPluginId !== 'none') {
        const manifest = pluginManifests.find(m => m.id === actionPluginId);
        if (!manifest) return { isActive: false, reason: 'plugin_missing' };
        if (manifest.status === 'disabled') return { isActive: false, reason: 'plugin_disabled' };
    }

    switch (config.display.category) {
      case 'BUILT_IN_HAND': return { isActive: enableBuiltInHandGestures, reason: 'feature_disabled' };
      case 'CUSTOM_HAND': return { isActive: enableCustomHandGestures, reason: 'feature_disabled' };
      case 'CUSTOM_POSE': return { isActive: enablePoseProcessing, reason: 'feature_disabled' };
      default: return { isActive: false, reason: 'unknown' };
    }
  };

  const sortedConfigs = [...configs].sort((a, b) => a.display.name.localeCompare(b.display.name));

  const activeConfigs = sortedConfigs.filter(c => getCardStatus(c).isActive);
  const inactiveConfigs = sortedConfigs.filter(c => !getCardStatus(c).isActive);

  if (configs.length === 0) {
    return <OnboardingGuide />;
  }

  return (
    <div id="configList" className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-3 content-start items-start">
      {activeConfigs.map(config => (
        <ConfigCard key={config.display.name} config={config} />
      ))}
      {inactiveConfigs.length > 0 && (
        <h3 id="inactive-configs-title" className="inactive-list-title col-span-full">{translate('inactiveConfigsTitle')}</h3>
      )}
      {inactiveConfigs.map(config => (
        <ConfigCard key={config.display.name} config={config} />
      ))}
    </div>
  );
}