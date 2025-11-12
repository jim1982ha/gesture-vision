/* FILE: packages/frontend/src/components/modals/SettingsModal.tsx */
import { useContext, useMemo, useState, useEffect } from 'react';
import { AppContext } from '#frontend/contexts/AppContext.js';
import { useAppStore } from '#frontend/hooks/useAppStore.js';
import { Tabs, type Tab } from '#frontend/components/shared/Tabs.js';
import { GeneralTab } from '#frontend/components/settings/GeneralTab.js';
import { PluginsTab } from '#frontend/components/settings/PluginsTab.js';
import { RtspTab } from '#frontend/components/settings/RtspTab.js';
import { AppearanceTab } from '#frontend/components/settings/AppearanceTab.js';
import { CustomGesturesTab } from '#frontend/components/settings/CustomGesturesTab.js';
import { Modal } from '#frontend/components/shared/Modal.js';

export function SettingsModal() {
  const context = useContext(AppContext);
  const { actions, languagePreference, activeModalId } = useAppStore(state => ({
    actions: state.actions,
    languagePreference: state.languagePreference,
    activeModalId: state.activeOverlays.at(-1)?.id,
  }));
  
  const [activeTab, setActiveTab] = useState('general');

  const tabs: Tab[] = useMemo(() => {
    if (!context) return [];
    const { translate } = context.services.translationService;
    return [
      { key: 'general', label: translate('generalSettingsTitle'), icon: 'UI_SETTINGS', component: <GeneralTab /> },
      { key: 'customGestures', label: translate('customGesturesTabButton'), icon: 'UI_GESTURE', component: <CustomGesturesTab /> },
      { key: 'plugins', label: translate('pluginsTabTitle'), icon: 'UI_EXTENSION', component: <PluginsTab /> },
      { key: 'rtsp', label: translate('rtspSourcesTitle'), icon: 'UI_RTSP_STREAM', component: <RtspTab /> },
      { key: 'appearance', label: translate('appearanceSettingsTab'), icon: 'UI_DARK_MODE', component: <AppearanceTab /> }
    ];
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [context, languagePreference]);

  useEffect(() => {
    if (!tabs.some(t => t.key === activeTab)) {
        setActiveTab('general');
    }
  }, [tabs, activeTab]);

  if (!context) return null;
  const { translate } = context.services.translationService;

  const footer = (
    <div
      id="appVersionDisplaySettings"
      className="text-xs text-text-secondary cursor-pointer hover:text-primary"
      title={translate("viewDocsTooltip")}
      onClick={() => actions.openOverlay('docs', 'ABOUT')}
    >
      v{__APP_VERSION__}
    </div>
  );

  return (
    <Modal
      id="mainSettingsModal"
      title={translate("configurationTitle")}
      iconKey="UI_SETTINGS"
      onClose={() => actions.closeCurrentOverlay()}
      show={activeModalId === 'settings'}
      size="lg"
      footer={footer}
    >
      {/* The <Tabs> component is now the direct child, allowing its flexbox layout to work correctly. */}
      <Tabs tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab} />
    </Modal>
  );
}