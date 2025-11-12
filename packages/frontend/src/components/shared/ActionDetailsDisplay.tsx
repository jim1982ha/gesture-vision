/* FILE: packages/frontend/src/components/shared/ActionDetailsDisplay.tsx */
import { useState, useEffect, useContext, useCallback } from 'react';
import { AppContext } from '#frontend/contexts/AppContext.js';
import { pubsub, UI_EVENTS, type ActionConfig, type ActionDisplayDetail } from '#shared/index.js';

interface ActionDetailsDisplayProps {
  actionConfig: ActionConfig | null | undefined;
}

/**
 * A shared component responsible for rendering the details of any plugin action.
 * It encapsulates the logic for finding and calling the correct plugin's display renderer.
 */
export const ActionDetailsDisplay = ({ actionConfig }: ActionDetailsDisplayProps) => {
  const context = useContext(AppContext);
  const { pluginUIService, translationService } = context!.services;
  const { translate } = translationService;
  const [detailsHtml, setDetailsHtml] = useState('');

  const generateDetails = useCallback(() => {
    if (actionConfig?.pluginId && actionConfig.pluginId !== 'none') {
      const renderer = pluginUIService.getActionDisplayDetailsRenderer(actionConfig.pluginId);
      if (renderer) {
        const details = renderer(actionConfig.settings, pluginUIService.getPluginUIContext(actionConfig.pluginId));
        const newHtml = details.map((d: ActionDisplayDetail) => `<div class="card-detail-line"><span class="${d.iconType === 'mdi' ? `mdi ${d.icon}` : 'material-icons'} card-detail-icon">${d.iconType !== 'mdi' ? d.icon ?? '' : ''}</span><span class="card-detail-value">${d.value}</span></div>`).join('');
        setDetailsHtml(newHtml);
        return;
      }
    }
    setDetailsHtml(`<div class="card-detail-line"><span class="material-icons card-detail-icon">highlight_off</span><span class="card-detail-value">${translate('actionTypeNone')}</span></div>`);
  }, [actionConfig, pluginUIService, translate]);

  useEffect(() => {
    generateDetails();
    const unsubscribe = pubsub.subscribe(UI_EVENTS.PLUGIN_RENDERERS_UPDATED, generateDetails);
    return () => unsubscribe();
  }, [generateDetails]);

  if (!context) return null;

  return (
    <div className="card-details" dangerouslySetInnerHTML={{ __html: detailsHtml }} />
  );
};