/* FILE: packages/frontend/src/components/config/GestureConfigForm.tsx */
import { useState, useEffect, useContext, useMemo } from 'react';
import { AppContext } from '#frontend/contexts/AppContext.js';
import { useAppStore } from '#frontend/hooks/useAppStore.js';
import { DEFAULT_GESTURE_CONFIDENCE, DEFAULT_GESTURE_DURATION_S, DEFAULT_ACTION_PLUGIN_ID_NONE } from '#frontend/constants/index.js';
import { setIcon, getGestureDisplayInfo } from '#frontend/ui/helpers/ui-helpers.js';
import { type GestureConfig, type PoseConfig, type PluginManifest, type ActionSettingFieldDescriptor, type EnrichedGestureConfig, BUILT_IN_HAND_GESTURES } from '#shared/index.js';
import { FormField } from './FormField.js';

interface GestureConfigFormProps {
  editingConfig: EnrichedGestureConfig | null;
  onSave: (config: GestureConfig | PoseConfig) => void;
  onCancel: () => void;
}

const PluginActionFields = ({ pluginId, settings, onUpdate }: { pluginId: string; settings: Record<string, unknown>; onUpdate: (newSettings: Record<string, unknown>) => void }) => {
    const context = useContext(AppContext);
    const [fields, setFields] = useState<ActionSettingFieldDescriptor[]>([]);
    const { pluginUIService } = context!.services;

    useEffect(() => {
        const module = pluginUIService.getLoadedModuleById(pluginId);
        const descriptors = module?.actionSettingsFields ? (typeof module.actionSettingsFields === 'function' ? module.actionSettingsFields(pluginUIService.getPluginUIContext(pluginId)) : module.actionSettingsFields) : [];
        setFields(descriptors);
    },[pluginId, pluginUIService]);

    if (!context) return null;

    const visibleFields = fields.filter(field => {
        if (!field.dependsOn || typeof field.dependsOn !== 'object' || Array.isArray(field.dependsOn)) return true;
        return settings[field.dependsOn.field] === field.dependsOn.value;
    });

    return (
        <div id={`plugin-action-fields-${pluginId}`}>
            {visibleFields.map(field => (
                <FormField key={field.id} field={field} pluginId={pluginId} settings={settings} onUpdate={(fieldId, value) => onUpdate({ ...settings, [fieldId]: value })} />
            ))}
        </div>
    );
};

export const GestureConfigForm = ({ editingConfig, onSave, onCancel }: GestureConfigFormProps) => {
    const context = useContext(AppContext);
    const { translate } = context!.services.translationService;
    const { gestureConfigs, customGestureMetadataList, pluginManifests, enableBuiltInHandGestures, enableCustomHandGestures, enablePoseProcessing } = useAppStore(state => ({
        gestureConfigs: state.gestureConfigs,
        customGestureMetadataList: state.customGestureMetadataList,
        pluginManifests: state.pluginManifests,
        enableBuiltInHandGestures: state.enableBuiltInHandGestures,
        enableCustomHandGestures: state.enableCustomHandGestures,
        enablePoseProcessing: state.enablePoseProcessing,
    }));

    const [formData, setFormData] = useState<Partial<EnrichedGestureConfig>>(() => {
        const baseConfig = {
            confidence: editingConfig?.confidence ?? DEFAULT_GESTURE_CONFIDENCE,
            duration: editingConfig?.duration ?? DEFAULT_GESTURE_DURATION_S,
            actionConfig: editingConfig?.actionConfig ?? null,
            display: editingConfig?.display,
        };

        if (editingConfig?.display) {
             if (editingConfig.display.category === 'CUSTOM_POSE') {
                 return { ...baseConfig, pose: editingConfig.display.name };
             } else {
                 return { ...baseConfig, gesture: editingConfig.display.name };
             }
        }
        return baseConfig;
    });

    const availableActionPlugins = useMemo(() => pluginManifests.filter(m => m.capabilities.providesActions && m.status === 'enabled'), [pluginManifests]);

    const availableGestures = useMemo(() => {
        const usedNames = new Set(gestureConfigs.map(c => c.display.name));
        const editingName = editingConfig?.display.name;
        
        // 1. Get Built-in Gestures
        const builtIns = enableBuiltInHandGestures 
            ? BUILT_IN_HAND_GESTURES.map(name => ({
                name,
                display: getGestureDisplayInfo(name, [])
            }))
            :[];

        // 2. Get Custom Gestures
        const customs = customGestureMetadataList.filter(g => {
            if (g.display.category === 'CUSTOM_HAND' && !enableCustomHandGestures) return false;
            if (g.display.category === 'CUSTOM_POSE' && !enablePoseProcessing) return false;
            return true;
        }).map(g => ({ name: g.name, display: g.display }));

        // 3. Combine, filter out already used (unless it's the one we are editing), and sort
        return [...builtIns, ...customs].filter(g => {
            return !usedNames.has(g.name) || g.name === editingName;
        }).sort((a, b) => a.display.formattedName.localeCompare(b.display.formattedName));

    },[gestureConfigs, customGestureMetadataList, enableBuiltInHandGestures, enableCustomHandGestures, enablePoseProcessing, editingConfig]);

    useEffect(() => {
        setFormData({
            confidence: editingConfig?.confidence ?? DEFAULT_GESTURE_CONFIDENCE,
            duration: editingConfig?.duration ?? DEFAULT_GESTURE_DURATION_S,
            actionConfig: editingConfig?.actionConfig ?? null,
            ...(editingConfig?.display?.category === 'CUSTOM_POSE'
                ? { pose: editingConfig.display.name }
                : (editingConfig?.display?.name ? { gesture: editingConfig.display.name } : {})),
            display: editingConfig?.display,
        });
    },[editingConfig]);

    if (!context) return null;

    const handleGestureSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const gestureName = e.target.value;
        const selectedGesture = availableGestures.find(g => g.name === gestureName);
        if (!selectedGesture) return;

        setFormData(prev => ({ 
            ...prev,
            ...(selectedGesture.display.category === 'CUSTOM_POSE' ? { pose: gestureName, gesture: undefined } : { gesture: gestureName, pose: undefined }),
            display: selectedGesture.display
        }));
    };

    const handleSave = () => {
        const { display: _display, ...configToSave } = formData;
        if (('gesture' in configToSave && configToSave.gesture) || ('pose' in configToSave && configToSave.pose)) {
            onSave(configToSave as GestureConfig | PoseConfig);
        }
    };

    const gestureName = formData.display?.name;

    return (
        <form id="gestureConfigForm" onSubmit={e => e.preventDefault()}>
            <div className="form-group">
                <label htmlFor="gesture-config-form-gesture-select" className="form-label">{translate('gestures')}</label>
                <select id="gesture-config-form-gesture-select" value={gestureName || 'NONE'} onChange={handleGestureSelect} className="form-control">
                    <option id="gesture-config-form-gesture-select-default-option" value="NONE" disabled>
                        {availableGestures.length === 0 && !editingConfig ? translate('allGesturesConfiguredPlaceholder') : translate('selectGesture')}
                    </option>
                    {availableGestures.map(g => (
                        <option key={g.name} id={`gesture-select-option-${g.name}`} value={g.name}>
                            {g.display.iconDetails.defaultEmoji} {g.display.formattedName}
                        </option>
                    ))}
                </select>
            </div>

            <div className="form-row">
                <div className="form-group">
                    <label htmlFor="gesture-config-form-confidence-input" className="form-label">{translate('confidenceLabel')}</label>
                    <input 
                        type="number" 
                        id="gesture-config-form-confidence-input" 
                        className="form-control" 
                        min="0" 
                        max="100" 
                        step="1" 
                        value={formData.confidence ?? ''} 
                        onChange={e => setFormData(p => ({...p, confidence: parseFloat(e.target.value)}))} 
                    />
                </div>
                <div className="form-group">
                    <label htmlFor="gesture-config-form-duration-input" className="form-label">{translate('durationLabel')}</label>
                    <input 
                        type="number" 
                        id="gesture-config-form-duration-input" 
                        className="form-control" 
                        min="0.1" 
                        max="10" 
                        step="0.1" 
                        value={formData.duration ?? ''} 
                        onChange={e => setFormData(p => ({...p, duration: parseFloat(e.target.value)}))} 
                    />
                </div>
            </div>

            <div className="form-group">
                <label htmlFor="gesture-config-form-action-select" className="form-label">{translate('actionTypeLabel')}</label>
                <select id="gesture-config-form-action-select" value={formData.actionConfig?.pluginId || 'none'} onChange={e => setFormData(p => ({...p, actionConfig: { pluginId: e.target.value, settings: { commandType: 'generic' } }}))} className="form-control">
                    <option id="gesture-config-form-action-select-none" value={DEFAULT_ACTION_PLUGIN_ID_NONE}>{translate('actionTypeNone')}</option>
                    {availableActionPlugins.map((p: PluginManifest) => <option key={p.id} id={`action-select-option-${p.id}`} value={p.id}>{translate(p.nameKey, {defaultValue: p.id})}</option>)}
                </select>
            </div>

            {formData.actionConfig?.pluginId && formData.actionConfig.pluginId !== 'none' && (
                <PluginActionFields pluginId={formData.actionConfig.pluginId} settings={formData.actionConfig.settings as Record<string, unknown>} onUpdate={newSettings => setFormData(p => ({...p, actionConfig: { ...p.actionConfig!, settings: newSettings }}))} />
            )}

            <div id="gesture-config-form-actions" className="form-actions-container">
                <button id="gesture-config-form-cancel-button" type="button" onClick={onCancel} className="btn btn-secondary">
                    <span ref={el => el && setIcon(el, 'UI_CANCEL')}></span><span>{translate('cancel')}</span>
                </button>
                <button id="gesture-config-form-save-button" type="button" onClick={handleSave} className="btn btn-primary">
                    <span ref={el => el && setIcon(el, editingConfig ? 'UI_SAVE' : 'UI_ADD')}></span><span>{translate(editingConfig ? 'update' : 'add')}</span>
                </button>
            </div>
        </form>
    );
};