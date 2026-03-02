/* FILE: packages/frontend/src/components/video/TuningPanels.tsx */
import { useState, useEffect, useContext } from 'react';
import { AppContext } from '#frontend/contexts/AppContext.js';
import { useAppStore } from '#frontend/hooks/useAppStore.js';
import { appStore } from '#frontend/core/state/app-store.js';
import { pubsub, UI_EVENTS, WEBCAM_EVENTS, type FullConfiguration } from '#shared/index.js';
import { setIcon } from '#frontend/ui/helpers/ui-helpers.js';
import type { SliderConfig, SliderProps } from '#frontend/types/index.js';

const Slider = ({ label, configKey, min, max, step, value, onInput, onChange }: SliderProps) => {
  const outputText = configKey.includes('Confidence') ? `${Math.round(value * 100)}%` : `${value}%`;
  return (
    <div id={`slider-group-${configKey}`} className="slider-group">
      <label htmlFor={String(configKey)}>{label}</label>
      <input type="range" id={String(configKey)} data-config-key={String(configKey)} min={min} max={max} step={step} value={value}
        onInput={(e) => onInput(configKey, parseFloat(e.currentTarget.value))}
        onChange={(e) => onChange(configKey, parseFloat(e.currentTarget.value))}
      />
      <output htmlFor={String(configKey)}>{outputText}</output>
    </div>
  );
};

interface TuningPanelProps {
    id: string;
    isVisible: boolean;
    children: React.ReactNode;
    onReset?: () => void;
}

const TuningPanel = ({ id, isVisible, children, onReset }: TuningPanelProps) => {
  if (!isVisible) return null;
  return (
    <div id={id} className="video-overlay-panel">
      <div className="flex flex-row items-center gap-3">
        <div className="flex-1 flex flex-col gap-1 min-w-0">
          {children}
        </div>
        {onReset && (
          <button id={`${id}-reset-button`} onClick={onReset} className="btn btn-icon flex-shrink-0" title="Reset Adjustments">
            <span ref={el => el && setIcon(el, "UI_RESET")}></span>
          </button>
        )}
      </div>
    </div>
  );
};

export function TuningPanels() {
    const context = useContext(AppContext);
    const [displayVisible, setDisplayVisible] = useState(false);
    const [aiVisible, setAiVisible] = useState(false);
    const settings = useAppStore(state => state);
    const { requestBackendPatch, setFullConfig } = appStore.getState().actions;

    useEffect(() => {
        const toggleAi = () => setAiVisible(v => {
          if (!v) setDisplayVisible(false);
          return !v;
        });
        const toggleDisplay = () => setDisplayVisible(v => {
          if (!v) setAiVisible(false);
          return !v;
        });
        const closeAll = () => {
          setDisplayVisible(false);
          setAiVisible(false);
        };

        const subAi = pubsub.subscribe(UI_EVENTS.VIDEO_TOOLBAR_AI_CLICKED, toggleAi);
        const subDisplay = pubsub.subscribe(UI_EVENTS.VIDEO_TOOLBAR_DISPLAY_CLICKED, toggleDisplay);
        const subExitFs = pubsub.subscribe(UI_EVENTS.VIDEO_EXIT_FULLSCREEN, closeAll);
        
        // FIX: Ensure panels are closed when stream stops to prevent them from getting stuck visible
        const subStreamStop = pubsub.subscribe(WEBCAM_EVENTS.STREAM_STOP, closeAll);

        return () => { subAi(); subDisplay(); subExitFs(); subStreamStop(); };
    }, []);

    if (!context) return null;

    const { translate } = context.services.translationService;

    const handleLiveUpdate = (key: keyof FullConfiguration, value: number) => {
        setFullConfig({ ...appStore.getState(), [key]: value });
    };

    const handlePersistUpdate = (key: keyof FullConfiguration, value: number) => {
        requestBackendPatch({ [key]: value });
    };

    const handleDisplayReset = () => {
        requestBackendPatch({ lowLightBrightness: 100, lowLightContrast: 100 });
    };

    const handSliders: SliderConfig[] = [
        { labelKey: 'detectLabel', configKey: 'handDetectionConfidence', min: 0.1, max: 0.9, step: 0.05 },
        { labelKey: 'presenceLabel', configKey: 'handPresenceConfidence', min: 0.1, max: 0.9, step: 0.05 },
        { labelKey: 'trackLabel', configKey: 'handTrackingConfidence', min: 0.1, max: 0.9, step: 0.05 },
    ];

    const poseSliders: SliderConfig[] = [
        { labelKey: 'detectLabel', configKey: 'poseDetectionConfidence', min: 0.1, max: 0.9, step: 0.05 },
        { labelKey: 'presenceLabel', configKey: 'posePresenceConfidence', min: 0.1, max: 0.9, step: 0.05 },
        { labelKey: 'trackLabel', configKey: 'poseTrackingConfidence', min: 0.1, max: 0.9, step: 0.05 },
    ];

    return (
        <div id="tuning-panels-container" className="absolute top-14 right-2 z-50 flex flex-col items-end gap-2 pointer-events-auto transition-opacity duration-300">
            <TuningPanel id="display-tuning-panel" isVisible={displayVisible} onReset={handleDisplayReset}>
                <Slider label={translate('brightnessLabel')} configKey="lowLightBrightness" min={0} max={200} step={1} value={settings.lowLightBrightness ?? 100} onInput={handleLiveUpdate} onChange={handlePersistUpdate} />
                <Slider label={translate('contrastLabel')} configKey="lowLightContrast" min={0} max={200} step={1} value={settings.lowLightContrast ?? 100} onInput={handleLiveUpdate} onChange={handlePersistUpdate} />
            </TuningPanel>

            <TuningPanel id="ai-tuning-panel" isVisible={aiVisible}>
                {(settings.enableBuiltInHandGestures || settings.enableCustomHandGestures) && (
                    <div id="handTuningSliders">
                        <h4 className="text-xs font-semibold mb-1 opacity-70">{translate('handTuningGroupName')}</h4>
                        {handSliders.map(s => <Slider key={s.configKey} label={translate(s.labelKey)} {...s} value={settings[s.configKey] as number} onInput={() => {}} onChange={handlePersistUpdate} />)}
                    </div>
                )}
                {settings.enablePoseProcessing && (
                    <div id="poseTuningSliders" className="mt-2">
                        <h4 className="text-xs font-semibold mb-1 opacity-70">{translate('poseTuningGroupName')}</h4>
                        {poseSliders.map(s => <Slider key={s.configKey} label={translate(s.labelKey)} {...s} value={settings[s.configKey] as number} onInput={() => {}} onChange={handlePersistUpdate} />)}
                    </div>
                )}
            </TuningPanel>
        </div>
    );
}