/* FILE: packages/frontend/src/hooks/usePluginConfigForm.ts */
import { useState, useEffect, useContext, useCallback, useMemo } from 'react';
import { useAppStore } from './useAppStore.js';
import { AppContext } from '#frontend/contexts/AppContext.js';
import type { AppState } from '#frontend/core/state/app-store.js';

/**
 * A reusable hook to manage the state and actions of a plugin's global configuration form.
 * It holds a local copy of the config for editing and provides functions to save or cancel.
 *
 * @param pluginId The unique ID of the plugin.
 * @param initialValues The default shape and values of the config object.
 * @param options Callbacks for when save or cancel actions are triggered.
 * @returns State and handlers to wire up a form component.
 */
export const usePluginConfigForm = <T extends Record<string, unknown>>(
    pluginId: string,
    initialValues: T,
    options?: { onSaveSuccess?: () => void; onCancel?: () => void }
) => {
    const context = useContext(AppContext);
    if (!context) throw new Error("usePluginConfigForm must be used within an AppProvider");
    const { pluginUIService, translationService, pubsub } = context.services;
    const { actions } = context.appStore.getState();
    const { translate } = translationService;

    // Use useCallback to create a stable selector function, preventing unnecessary re-renders.
    const globalConfigSelector = useCallback(
        (state: AppState) => (state.pluginGlobalConfigs.get(pluginId) as T) || initialValues,
        [pluginId, initialValues]
    );

    const globalConfig = useAppStore(globalConfigSelector);
    const [formState, setFormState] = useState<T>(globalConfig || initialValues);
    const [isSaving, setIsSaving] = useState(false);
    const [isTesting, setIsTesting] = useState(false);

    const isDirty = useMemo(() => JSON.stringify(formState) !== JSON.stringify(globalConfig), [formState, globalConfig]);

    useEffect(() => {
        if (!isDirty) {
            setFormState(globalConfig || initialValues);
        }
    }, [globalConfig, isDirty, initialValues]);

    const handleInputChange = useCallback((key: keyof T, value: T[keyof T]) => {
        setFormState(prevState => ({ ...prevState, [key]: value }));
    }, []);

    const handleSave = useCallback(async () => {
        setIsSaving(true);
        actions.setPluginGlobalConfig(pluginId, formState);
        await pluginUIService.savePluginGlobalConfig(pluginId, formState);
        setIsSaving(false);
        options?.onSaveSuccess?.();
    }, [pluginId, formState, actions, pluginUIService, options]);

    const handleCancel = useCallback(() => {
        setFormState(globalConfig);
        options?.onCancel?.();
    }, [globalConfig, options]);

    const handleTest = useCallback(async () => {
        setIsTesting(true);
        const result = await pluginUIService.sendPluginTestConnectionRequest(pluginId, formState);
        setIsTesting(false);
        
        if (result) {
            const rawErrorMessage = result.error?.message || 'Unknown error';
            
            // Try to translate the key. If the key doesn't exist, 'translate' returns the key itself or defaults.
            // We pass the raw message as a substitution variable named 'message' and 'details'.
            let translatedMessage = translate(result.messageKey || 'errorGeneric', { 
                message: rawErrorMessage,
                details: rawErrorMessage
            });

            // Fallback: If translation returned a string containing unconverted placeholders like {message}
            // or if it simply returned the key name, append the raw error for visibility.
            if (translatedMessage.includes('{message}') || translatedMessage.includes('{details}')) {
                 translatedMessage = `${result.success ? 'Success' : 'Error'}: ${rawErrorMessage}`;
            }

            pubsub.publish('ui:showNotification', {
                message: translatedMessage,
                type: result.success ? 'success' : 'error'
            });
            
            console.log(`[PluginConfig] Test Result for ${pluginId}:`, result);
        }
    }, [pluginId, formState, pluginUIService, pubsub, translate]);

    return {
        formState,
        isDirty,
        isSaving,
        isTesting,
        handleInputChange,
        handleSave,
        handleCancel,
        handleTest,
    };
};