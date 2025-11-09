/* FILE: packages/frontend/src/components/modals/SettingsModal.tsx */
import { useContext } from 'react';
import { AppContext } from '#frontend/contexts/AppContext.js';
import { useAppStore } from '#frontend/hooks/useAppStore.js';
import { setIcon } from '#frontend/ui/helpers/ui-helpers.js';
import { Tabs, type Tab } from '#frontend/components/shared/Tabs.js';
import { GeneralTab } from '#frontend/components/settings/GeneralTab.js';
import { PluginsTab } from '#frontend/components/settings/PluginsTab.js';
import { RtspTab } from '#frontend/components/settings/RtspTab.js';
import { AppearanceTab } from '#frontend/components/settings/AppearanceTab.js';
import { CustomGesturesTab } from '#frontend/components/settings/CustomGesturesTab.js';

export function SettingsModal() {
  const context = useContext(AppContext);
  // This hook ensures the component re-renders when language changes, updating all translated text.
  useAppStore(state => state.languagePreference); 

  if (!context) return null;

  const { translate } = context.services.translationService;
  const { actions } = context.appStore.getState();

  const tabs: Tab[] = [
    { key: 'general', label: translate('generalSettingsTitle'), icon: 'UI_SETTINGS', component: <GeneralTab /> },
    { key: 'customGestures', label: translate('customGesturesTabButton'), icon: 'UI_GESTURE', component: <CustomGesturesTab /> },
    { key: 'plugins', label: translate('pluginsTabTitle'), icon: 'UI_EXTENSION', component: <PluginsTab /> },
    { key: 'rtsp', label: translate('rtspSourcesTitle'), icon: 'UI_RTSP_STREAM', component: <RtspTab /> },
    { key: 'appearance', label: translate('appearanceSettingsTab'), icon: 'UI_DARK_MODE', component: <AppearanceTab /> }
  ];

  return (
    <div id="mainSettingsModal" className="modal visible" role="dialog" aria-modal="true">
      <div className="modal-content">
        <div id="settingsModalTitle" className="modal-header">
            <span ref={el => el && setIcon(el, 'UI_SETTINGS')} className="material-icons header-icon"></span>
            <span className="header-title">{translate("configurationTitle")}</span>
            <button
                id="mainSettingsCloseButton"
                className="btn btn-icon header-close-btn"
                aria-label={translate("close")}
                title={translate("close")}
                onClick={() => actions.toggleSettingsModal(false)}
            >
                <span ref={el => el && setIcon(el, 'UI_CLOSE')} className="mdi" aria-hidden="true"></span>
            </button>
        </div>
        
        <Tabs tabs={tabs} onTabChange={() => {}} />

        <div className="modal-actions">
            <div
                id="appVersionDisplaySettings"
                className="text-xs text-text-secondary cursor-pointer hover:text-primary"
                title={translate("viewDocsTooltip")}
                onClick={() => actions.toggleDocsModal(true, 'ABOUT')}
            >
              v{__APP_VERSION__}
            </div>
        </div>
      </div>
    </div>
  );
}