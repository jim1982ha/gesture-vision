/* FILE: packages/frontend/src/components/shared/PluginSettingsActions.tsx */
import { useContext } from 'react';
import { setIcon } from '#frontend/ui/helpers/ui-helpers.js';
import { AppContext } from '#frontend/contexts/AppContext.js';
import type { PluginManifest } from '#shared/index.js';

interface PluginSettingsActionsProps {
  manifest: PluginManifest;
  isDirty: boolean;
  isSaving: boolean;
  isTesting: boolean;
  isActionDisabled: boolean;
  onCancel: () => void;
  onSave: () => void;
  onTest: () => void;
}

export const PluginSettingsActions = ({
  manifest,
  isDirty,
  isSaving,
  isTesting,
  isActionDisabled,
  onCancel,
  onSave,
  onTest,
}: PluginSettingsActionsProps) => {
  const context = useContext(AppContext);
  if (!context) return null;
  const { translate } = context.services.translationService;

  return (
    <div id={`${manifest.id}-settings-actions`} className="flex justify-end gap-2 mt-4">
      <button id={`${manifest.id}-settings-cancel-button`} onClick={onCancel} className="btn btn-secondary" disabled={isSaving}>
        <span ref={el => el && setIcon(el, 'UI_CANCEL')}></span>
        <span>{translate('cancel')}</span>
      </button>
      <button id={`${manifest.id}-settings-save-button`} onClick={onSave} className="btn btn-primary" disabled={!isDirty || isSaving}>
        <span ref={el => el && setIcon(el, isSaving ? 'UI_HOURGLASS' : 'UI_SAVE')}></span>
        <span>{translate('save')}</span>
      </button>
      <button id={`${manifest.id}-settings-test-button`} onClick={onTest} className="btn btn-secondary" disabled={isActionDisabled || isDirty}>
        <span ref={el => el && setIcon(el, isTesting ? 'UI_HOURGLASS' : 'UI_NETWORK_CHECK')}></span>
        <span>{isTesting ? translate('testingConnection') : translate('testConnection')}</span>
      </button>
    </div>
  );
};