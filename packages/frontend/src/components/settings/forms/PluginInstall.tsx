// --- packages/frontend/src/components/settings/forms/PluginInstall.tsx --- (complete version) ---
/* FILE: packages/frontend/src/components/settings/forms/PluginInstall.tsx */
import { useState, useContext } from 'react';
import { AppContext } from '#frontend/contexts/AppContext.js';
import { pubsub, UI_EVENTS } from '#shared/index.js';
import { setIcon } from '#frontend/ui/helpers/ui-helpers.js';
export const PluginInstall = () => {
    const context = useContext(AppContext);
    const { translate } = context!.services.translationService;
    const [url, setUrl] = useState('');
    const [isInstalling, setIsInstalling] = useState(false);
    if (!context) return null;
    const handleInstall = async () => {
        if (!url || isInstalling) return;
        setIsInstalling(true);
        try {
            // FIX: Removed leading slash to support HA Ingress relative paths
            const response = await fetch('api/plugins/manage/install', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url }),
            });
            let result;
            try {
              result = await response.json();
            } catch (_e) { // Renamed unused variable to _e
              // Handle non-JSON responses (e.g. 404 HTML from HA Ingress if path is wrong)
              throw new Error(`Server returned non-JSON response (Status: ${response.status}). Check connection.`);
            }
            if (result.success) {
                pubsub.publish(UI_EVENTS.SHOW_NOTIFICATION, { message: result.message, type: 'success' });
                setUrl('');
            } else {
                pubsub.publish(UI_EVENTS.SHOW_ERROR, { message: result.message });
            }
        } catch (error) {
            pubsub.publish(UI_EVENTS.SHOW_ERROR, { message: `Install failed: ${(error as Error).message}` });
        } finally {
            setIsInstalling(false);
        }
    };
    return (
        <div id="plugin-install-section" className="mb-6">
            <div className="form-group">
                <label htmlFor="pluginInstallUrl" className="form-label">{translate('pluginInstallUrlLabel')}</label>
                <div className="flex items-center gap-2">
                    <input type="url" id="pluginInstallUrl" className="form-control" value={url} onChange={e => setUrl(e.target.value)} placeholder={translate('pluginInstallUrlPlaceholder')} />
                    <button id="plugin-install-button" className="btn btn-primary flex-shrink-0" onClick={handleInstall} disabled={isInstalling}>
                        <span ref={el => el && setIcon(el, isInstalling ? 'UI_HOURGLASS' : 'UI_UPLOAD')} className="material-icons"></span>
                        <span>{translate('pluginInstallBtnText')}</span>
                    </button>
                </div>
            </div>
        </div>
    );
};