/* FILE: packages/frontend/src/components/config/FormField.tsx */
import { useState, useEffect, useContext } from 'react';
import { AppContext } from '#frontend/contexts/AppContext.js';
import type { ActionSettingFieldDescriptor, ActionSettingFieldOption } from '#shared/index.js';

interface FormFieldProps {
  field: ActionSettingFieldDescriptor;
  pluginId: string;
  settings: Record<string, unknown>;
  onUpdate: (fieldId: string, value: unknown) => void;
}

export const FormField = ({ field, pluginId, settings, onUpdate }: FormFieldProps) => {
    const context = useContext(AppContext);
    const { pluginUIService, translationService } = context!.services;
    const [options, setOptions] = useState<ActionSettingFieldOption[]>([]);

    useEffect(() => {
        let isMounted = true;
        if (field.type === 'select' && field.optionsSource) {
            const fetchOptions = async () => {
                const fetchedOpts = await field.optionsSource(pluginUIService.getPluginUIContext(pluginId), settings);
                if (isMounted) setOptions(fetchedOpts);
            };
            fetchOptions();
        }
        return () => { isMounted = false; };
    }, [field, settings, pluginId, pluginUIService]);

    if (!context) return null;

    const uniqueId = `plugin-action-field-${pluginId}-${field.id}`;
    const value = settings[field.id];
    const { translate } = translationService;

    const renderControl = () => {
        switch (field.type) {
            case 'select':
                return (
                    <select id={uniqueId} className="form-control" value={String(value || '')} onChange={e => onUpdate(field.id, e.target.value)}>
                        {field.placeholderKey && <option value="">{translate(field.placeholderKey)}</option>}
                        {options.map(opt => <option key={opt.value} value={opt.value} disabled={opt.disabled}>{opt.label}</option>)}
                    </select>
                );
            case 'textarea':
                return (
                    <textarea id={uniqueId} className="form-control" rows={field.rows || 3} value={String(value || '')} onChange={e => onUpdate(field.id, e.target.value)}
                        placeholder={field.placeholderKey ? translate(field.placeholderKey) : ''}
                    />
                );
            case 'checkbox':
                return (
                    <div className="form-group form-group-checkbox-inline">
                        <input type="checkbox" id={uniqueId} className="form-checkbox" checked={!!value} onChange={e => onUpdate(field.id, e.target.checked)} />
                        <label htmlFor={uniqueId} className="form-label">{translate(field.labelKey)}</label>
                    </div>
                );
            default:
                return (
                    <input type={field.type} id={uniqueId} className="form-control" value={String(value || '')} onChange={e => onUpdate(field.id, e.target.value)}
                        placeholder={field.placeholderKey ? translate(field.placeholderKey) : ''}
                    />
                );
        }
    };

    if (field.type === 'checkbox') {
        return renderControl();
    }

    return (
        <div className="form-group">
            <label htmlFor={uniqueId} className="form-label">{translate(field.labelKey)}</label>
            {renderControl()}
            {field.helpTextKey && <small className="form-help-text">{translate(field.helpTextKey)}</small>}
        </div>
    );
};