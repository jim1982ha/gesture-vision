/* FILE: packages/frontend/src/components/config/ConfigList.tsx */
import { useContext } from 'react';
import { AppContext } from '#frontend/contexts/AppContext.js';
import { useAppStore } from '#frontend/hooks/useAppStore.js';
import { ConfigCard } from '#frontend/components/shared/cards/ConfigCard.js';
import type { GestureConfig, PoseConfig } from '#shared/index.js';

export function ConfigList() {
  const context = useContext(AppContext);
  const { configs, customGestureMetadataList, pluginManifests, enableBuiltInHandGestures, enableCustomHandGestures, enablePoseProcessing } = useAppStore(state => ({
    configs: state.gestureConfigs,
    customGestureMetadataList: state.customGestureMetadataList,
    pluginManifests: state.pluginManifests,
    enableBuiltInHandGestures: state.enableBuiltInHandGestures,
    enableCustomHandGestures: state.enableCustomHandGestures,
    enablePoseProcessing: state.enablePoseProcessing,
  }));
  
  if (!context) return null;
  const { translate } = context.services.translationService;
  
  const getCardStatus = (config: GestureConfig | PoseConfig) => {
    const actionPluginId = config.actionConfig?.pluginId;
    if (actionPluginId && actionPluginId !== 'none') {
        const manifest = pluginManifests.find(m => m.id === actionPluginId);
        if (!manifest) return { isActive: false, reason: 'plugin_missing' };
        if (manifest.status === 'disabled') return { isActive: false, reason: 'plugin_disabled' };
    }

    const name = 'pose' in config ? config.pose : config.gesture;
    const meta = customGestureMetadataList.find(m => m.name === name);
    
    if (meta?.type === 'hand' && !enableCustomHandGestures) return { isActive: false, reason: 'feature_disabled' };
    if (meta?.type === 'pose' && !enablePoseProcessing) return { isActive: false, reason: 'feature_disabled' };
    if (!meta && !enableBuiltInHandGestures) return { isActive: false, reason: 'feature_disabled' };
    
    return { isActive: true, reason: null };
  };

  const sortedConfigs = [...configs].sort((a, b) => {
    const nameA = ('gesture' in a ? a.gesture : a.pose).toLowerCase();
    const nameB = ('gesture' in b ? b.gesture : b.pose).toLowerCase();
    return nameA.localeCompare(nameB);
  });

  const activeConfigs = sortedConfigs.filter(c => getCardStatus(c).isActive);
  const inactiveConfigs = sortedConfigs.filter(c => !getCardStatus(c).isActive);

  if (configs.length === 0) {
    return <p id="config-list-placeholder" className="list-placeholder">{translate("noGesturesConfigured")}</p>;
  }

  return (
    <div id="configList" className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-3 content-start items-start">
      {activeConfigs.map(config => (
        <ConfigCard key={'pose' in config ? config.pose : config.gesture} config={config} />
      ))}
      {inactiveConfigs.length > 0 && (
        <h3 id="inactive-configs-title" className="inactive-list-title col-span-full">{translate('inactiveConfigsTitle')}</h3>
      )}
      {inactiveConfigs.map(config => (
        <ConfigCard key={'pose' in config ? config.pose : config.gesture} config={config} />
      ))}
    </div>
  );
}