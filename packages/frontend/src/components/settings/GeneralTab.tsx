/* FILE: packages/frontend/src/components/settings/GeneralTab.tsx */
import { useContext } from 'react';
import { AppContext } from '#frontend/contexts/AppContext.js';
import { useAppStore } from '#frontend/hooks/useAppStore.js';
import { ButtonGroup, type ButtonGroupOption } from '#frontend/components/shared/ButtonGroup.js';

export function GeneralTab() {
    const context = useContext(AppContext);
    const { 
        globalCooldown, targetFpsPreference, telemetryEnabled, processingResolutionWidthPreference,
    } = useAppStore(state => ({
        globalCooldown: state.globalCooldown,
        targetFpsPreference: state.targetFpsPreference,
        telemetryEnabled: state.telemetryEnabled,
        processingResolutionWidthPreference: state.processingResolutionWidthPreference
    }));
    
    if (!context) return null;
    const { translate } = context.services.translationService;
    const { actions } = context.appStore.getState();

    const RESOLUTION_OPTIONS: ButtonGroupOption[] = [
        { value: 640, textKey: 'resolution640x360', titleKey: 'resolution640x360', iconKey: 'UI_RESOLUTION_SD' },
        { value: 1280, textKey: 'resolution1280x720', titleKey: 'resolution1280x720', iconKey: 'UI_RESOLUTION_HD' },
    ].map(opt => ({...opt, text: translate(opt.textKey), title: translate(opt.titleKey)}));

    const FPS_OPTIONS: ButtonGroupOption[] = [
        { value: 24, textKey: 'fpsLow', titleKey: 'fpsLowTooltip', iconKey: 'UI_FPS_24' },
        { value: 30, textKey: 'fpsMedium', titleKey: 'fpsMediumTooltip', iconKey: 'UI_FPS_30' },
        { value: 60, textKey: 'fpsHigh', titleKey: 'fpsHighTooltip', iconKey: 'UI_FPS_60' },
    ].map(opt => ({...opt, text: translate(opt.textKey), title: translate(opt.titleKey)}));

    const TELEMETRY_OPTIONS: ButtonGroupOption[] = [
        { value: true, textKey: 'enableLabel', titleKey: 'enableLabel', iconKey: 'UI_CHECK_CIRCLE' },
        { value: false, textKey: 'disableLabel', titleKey: 'disableLabel', iconKey: 'UI_HIGHLIGHT_OFF' },
    ].map(opt => ({...opt, text: translate(opt.textKey), title: translate(opt.titleKey)}));

    return (
        <div id="settings-general-tab">
            <div id="general-tab-cooldown-section" className="form-section">
                <label htmlFor="general-tab-cooldown-slider" className="form-label">{translate("globalCooldown")}</label>
                <div className="slider-group">
                    <output id="general-tab-cooldown-output" className="slider-output">{globalCooldown.toFixed(1)}s</output>
                    <div className="slider-container">
                        <input id="general-tab-cooldown-slider" type="range" className="form-slider" min="0" max="10" step="0.5"
                            value={globalCooldown}
                            onInput={(e) => actions.setFullConfig({ ...context.appStore.getState(), globalCooldown: parseFloat(e.currentTarget.value) })}
                            onChange={(e) => actions.requestBackendPatch({ globalCooldown: parseFloat(e.currentTarget.value) })}
                        />
                    </div>
                </div>
            </div>
            <div id="general-tab-resolution-section" className="form-section">
                <label id="general-tab-resolution-label" className="form-label">{translate("processingResolutionLabel")}</label>
                <ButtonGroup
                    id="general-tab-resolution-group"
                    options={RESOLUTION_OPTIONS} 
                    value={processingResolutionWidthPreference} 
                    onChange={(value) => actions.setLocalPreference('processingResolutionWidthPreference', value as number)} 
                />
                <small id="general-tab-resolution-help" className="form-help-text">{translate("resolutionHelpWebcamOnly")}</small>
            </div>
            <div id="general-tab-fps-section" className="form-section">
                <label id="general-tab-fps-label" className="form-label">{translate("targetFpsLabel")}</label>
                <ButtonGroup 
                    id="general-tab-fps-group"
                    options={FPS_OPTIONS} 
                    value={targetFpsPreference} 
                    onChange={(value) => actions.requestBackendPatch({ targetFpsPreference: value as (24 | 30 | 60) })} 
                />
                <small id="general-tab-fps-help" className="form-help-text">{translate("targetFpsHelp")}</small>
            </div>
            <div id="general-tab-telemetry-section" className="form-section">
                <label id="general-tab-telemetry-label" className="form-label">{translate("telemetryEnabledLabel")}</label>
                <ButtonGroup 
                    id="general-tab-telemetry-group"
                    options={TELEMETRY_OPTIONS} 
                    value={telemetryEnabled} 
                    onChange={(value) => actions.requestBackendPatch({ telemetryEnabled: value as boolean })} 
                />
                <small id="general-tab-telemetry-help" className="form-help-text">{translate("telemetryEnabledHelp")}</small>
            </div>
        </div>
    );
}