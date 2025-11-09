/* FILE: packages/frontend/src/components/config/GestureConfigForm.tsx */
import { useState, useEffect, useContext, useMemo } from 'react';
import { AppContext } from '#frontend/contexts/AppContext.js';
import { useAppStore } from '#frontend/hooks/useAppStore.js';
import { DEFAULT_GESTURE_CONFIDENCE, DEFAULT_GESTURE_DURATION_S, DEFAULT_ACTION_PLUGIN_ID_NONE } from '#frontend/constants/index.js';
import { setIcon } from '#frontend/ui/helpers/ui-helpers.js';
import { BUILT_IN_HAND_GESTURES, getGestureDisplayInfo, type GestureConfig, type PoseConfig, type PluginManifest, type ActionSettingFieldDescriptor } from '#shared/index.js';
import { FormField } from './FormField.js';

interface GestureConfigFormProps {
  editingConfig: GestureConfig | PoseConfig | null;
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
    }, [pluginId, pluginUIService]);
    
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
  
    const [formData, setFormData] = useState<Partial<GestureConfig & PoseConfig>>({
      confidence: DEFAULT_GESTURE_CONFIDENCE,
      duration: DEFAULT_GESTURE_DURATION_S,
      actionConfig: null,
    });

    const availableActionPlugins = useMemo(() => pluginManifests.filter(m => m.capabilities.providesActions && m.status === 'enabled'), [pluginManifests]);
    
    const availableGestures = useMemo(() => {
        const usedNames = new Set(gestureConfigs.map(c => 'gesture' in c ? c.gesture : c.pose));
        const editingName = editingConfig ? ('gesture' in editingConfig ? editingConfig.gesture : editingConfig.pose) : null;
        const options: { name: string; type: string }[] = [];
      
        if (enableBuiltInHandGestures) (BUILT_IN_HAND_GESTURES as readonly string[]).forEach(g => { if (g !== 'NONE' && (!usedNames.has(g) || g === editingName)) options.push({ name: g, type: 'BUILT_IN_HAND' }); });
        if (enableCustomHandGestures) customGestureMetadataList.filter(m => m.type !== 'pose').forEach(m => { if (!usedNames.has(m.name) || m.name === editingName) options.push({ name: m.name, type: 'CUSTOM_HAND' }); });
        if (enablePoseProcessing) customGestureMetadataList.filter(m => m.type === 'pose').forEach(m => { if (!usedNames.has(m.name) || m.name === editingName) options.push({ name: m.name, type: 'CUSTOM_POSE' }); });
      
        return options.sort((a, b) => a.name.localeCompare(b.name));
    }, [gestureConfigs, customGestureMetadataList, enableBuiltInHandGestures, enableCustomHandGestures, enablePoseProcessing, editingConfig]);

    useEffect(() => {
        const gestureName = editingConfig ? ('gesture' in editingConfig ? editingConfig.gesture : editingConfig.pose) : undefined;
        setFormData({
            ...editingConfig,
            ...(editingConfig && 'pose' in editingConfig ? { pose: gestureName, gesture: undefined } : { gesture: gestureName, pose: undefined }),
            confidence: editingConfig?.confidence ?? DEFAULT_GESTURE_CONFIDENCE,
            duration: editingConfig?.duration ?? DEFAULT_GESTURE_DURATION_S,
            actionConfig: editingConfig?.actionConfig ?? null,
        });
    }, [editingConfig]);
  
    if (!context) return null;

    const handleGestureSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const gestureName = e.target.value;
        const type = e.target.options[e.target.selectedIndex].dataset.type;
        setFormData(prev => ({ ...prev, ...(type === 'CUSTOM_POSE' ? { pose: gestureName, gesture: undefined } : { gesture: gestureName, pose: undefined }) }));
    };
  
    const handleSave = () => { if (formData.gesture || formData.pose) onSave(formData as GestureConfig | PoseConfig); };
    const gestureName = formData.gesture || formData.pose;
  
    return (
        <form id="gestureConfigForm" onSubmit={e => e.preventDefault()}>
            <div className="form-group">
                <label htmlFor="gesture" className="form-label">{translate('gestures')}</label>
                <select id="gesture" value={gestureName || 'NONE'} onChange={handleGestureSelect} className="form-control" disabled={!!editingConfig}>
                    <option value="NONE" disabled>{translate('selectGesture')}</option>
                    {availableGestures.map(opt => {
                        const { iconDetails, formattedName } = getGestureDisplayInfo(opt.name, customGestureMetadataList);
                        return <option key={opt.name} value={opt.name} data-type={opt.type}>{iconDetails.defaultEmoji} {translate(formattedName, {defaultValue: formattedName})}</option>;
                    })}
                </select>
            </div>
            <div className="form-row">
                <div className="form-group"><label htmlFor="confidence" className="form-label">{translate('confidenceLabel')}</label><input type="number" id="confidence" className="form-control" min="0" max="100" step="1" value={formData.confidence} onChange={e => setFormData(p => ({...p, confidence: parseFloat(e.target.value)}))} /></div>
                <div className="form-group"><label htmlFor="duration" className="form-label">{translate('durationLabel')}</label><input type="number" id="duration" className="form-control" min="0.1" max="10" step="0.1" value={formData.duration} onChange={e => setFormData(p => ({...p, duration: parseFloat(e.target.value)}))} /></div>
            </div>
            <div className="form-group">
                <label htmlFor="actionConfig.pluginId" className="form-label">{translate('actionTypeLabel')}</label>
                <select id="actionConfig.pluginId" value={formData.actionConfig?.pluginId || 'none'} onChange={e => setFormData(p => ({...p, actionConfig: { pluginId: e.target.value, settings: { commandType: 'generic' } }}))} className="form-control">
                    <option value={DEFAULT_ACTION_PLUGIN_ID_NONE}>{translate('actionTypeNone')}</option>
                    {availableActionPlugins.map((p: PluginManifest) => <option key={p.id} value={p.id}>{translate(p.nameKey, {defaultValue: p.id})}</option>)}
                </select>
            </div>
            {formData.actionConfig?.pluginId && formData.actionConfig.pluginId !== 'none' && (
                <PluginActionFields pluginId={formData.actionConfig.pluginId} settings={formData.actionConfig.settings as Record<string, unknown>} onUpdate={newSettings => setFormData(p => ({...p, actionConfig: { ...p.actionConfig!, settings: newSettings }}))} />
            )}
            <div id="gesture-config-form-actions" className="form-actions-container">
                <button type="button" onClick={onCancel} className="btn btn-secondary"><span ref={el => el && setIcon(el, 'UI_CANCEL')}></span><span>{translate('cancel')}</span></button>
                <button type="button" onClick={handleSave} className="btn btn-primary"><span ref={el => el && setIcon(el, editingConfig ? 'UI_SAVE' : 'UI_ADD')}></span><span>{translate(editingConfig ? 'update' : 'add')}</span></button>
            </div>
        </form>
    );
};