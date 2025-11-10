/* FILE: packages/frontend/src/components/header/HeaderToggles.tsx */
import { useContext } from 'react';
import { AppContext } from '#frontend/contexts/AppContext.js';
import { useAppStore } from '#frontend/hooks/useAppStore.js';
import { setIcon, clsx } from '#frontend/ui/helpers/ui-helpers.js';
import { Dropdown } from '#frontend/components/shared/Dropdown.js';
import type { GestureCategoryIconType, FullConfiguration } from '#shared/index.js';

interface DropdownItemConfig {
  id: string;
  iconKey: GestureCategoryIconType | string;
  labelKey: string;
  handler: () => void;
  isActive: boolean;
  isDisabled: boolean;
}

export function HeaderToggles() {
    const context = useContext(AppContext);
    const state = useAppStore(s => ({
        enableBuiltInHandGestures: s.enableBuiltInHandGestures,
        enableCustomHandGestures: s.enableCustomHandGestures,
        enablePoseProcessing: s.enablePoseProcessing,
        showHandLandmarks: s.showHandLandmarks,
        showPoseLandmarks: s.showPoseLandmarks,
        numHandsPreference: s.numHandsPreference
    }));
    
    if (!context) return null;
    
    const { translate } = context.services.translationService;
    const { actions } = context.appStore.getState();
    
    const handleFeatureToggle = (key: keyof FullConfiguration) => actions.requestBackendPatch({ [key]: !state[key as keyof typeof state] });
    
    const handleLandmarkToggle = (type: 'hand' | 'pose') => {
        if (type === 'hand') actions.setLocalPreference('showHandLandmarks', !state.showHandLandmarks);
        else if (type === 'pose') actions.setLocalPreference('showPoseLandmarks', !state.showPoseLandmarks);
    };

    // --- MODIFICATION: Reworked hand landmark toggle logic ---
    const handleNumHands = (num: 1 | 2) => {
        // If the user clicks the already active hand count button, toggle it off.
        if (state.showHandLandmarks && state.numHandsPreference === num) {
            actions.setLocalPreference('showHandLandmarks', false);
        } else {
            // Otherwise, turn it on and set the hand count.
            actions.setLocalPreference('showHandLandmarks', true);
            actions.setLocalPreference('numHandsPreference', num);
        }
    };

    const anyHandFeatureOn = state.enableBuiltInHandGestures || state.enableCustomHandGestures;
    const isFeaturesActive = anyHandFeatureOn || state.enablePoseProcessing;
    
    // --- MODIFICATION: Simplified active state logic for the main button ---
    const isLandmarksActive = state.showHandLandmarks || state.showPoseLandmarks;

    const featureItems: DropdownItemConfig[] = [
        { id: 'toggleBuiltIn', iconKey: 'BUILT_IN_HAND', labelKey: translate('toggleBuiltInHandGesturesTitle'), handler: () => handleFeatureToggle('enableBuiltInHandGestures'), isActive: state.enableBuiltInHandGestures, isDisabled: false },
        { id: 'toggleCustom', iconKey: 'CUSTOM_HAND', labelKey: translate('toggleCustomHandGesturesTitle'), handler: () => handleFeatureToggle('enableCustomHandGestures'), isActive: state.enableCustomHandGestures, isDisabled: false },
        { id: 'togglePose', iconKey: 'CUSTOM_POSE', labelKey: translate('togglePoseProcessingTitle'), handler: () => handleFeatureToggle('enablePoseProcessing'), isActive: state.enablePoseProcessing, isDisabled: false },
    ];
    
    const landmarkItems: DropdownItemConfig[] = [
        { id: 'toggleNumHands1', iconKey: 'UI_HAND_DETECT_ONE', labelKey: translate('detect1HandTitle'), handler: () => handleNumHands(1), isActive: state.showHandLandmarks && state.numHandsPreference === 1, isDisabled: !anyHandFeatureOn },
        { id: 'toggleNumHands2', iconKey: 'UI_HAND_DETECT_TWO', labelKey: translate('detect2HandsTitle'), handler: () => handleNumHands(2), isActive: state.showHandLandmarks && state.numHandsPreference === 2, isDisabled: !anyHandFeatureOn },
        { id: 'togglePoseLandmarks', iconKey: 'UI_POSE_LANDMARK_TOGGLE', labelKey: translate('togglePoseLandmarksTitle'), handler: () => handleLandmarkToggle('pose'), isActive: state.showPoseLandmarks, isDisabled: !state.enablePoseProcessing },
    ];

    const featuresTrigger = (
      <button id="header-features-dropdown-trigger" className={clsx('btn btn-secondary px-2 desktop:px-4 header-dropdown-trigger', isFeaturesActive && 'active')}>
          <span ref={el => el && setIcon(el, 'UI_FEATURES_DROPDOWN_TRIGGER')}></span>
          <span className="hidden desktop:inline">{translate('FeaturesToggleLabel')}</span>
          <span ref={el => el && setIcon(el, 'UI_ARROW_DROP_DOWN')} className="hidden desktop:inline-flex"></span>
      </button>
    );

    const landmarksTrigger = (
      <button id="header-landmarks-dropdown-trigger" className={clsx('btn btn-secondary px-2 desktop:px-4 header-dropdown-trigger', isLandmarksActive && 'active')}>
          <span ref={el => el && setIcon(el, 'UI_HANDS_LANDMARKS_DROPDOWN_TRIGGER')}></span>
          <span className="hidden desktop:inline">{translate('LandmarksToggleLabel')}</span>
          <span ref={el => el && setIcon(el, 'UI_ARROW_DROP_DOWN')} className="hidden desktop:inline-flex"></span>
      </button>
    );

    return (
        <div id="header-toggles-container" className="flex items-center gap-1">
            <Dropdown id="header-features-dropdown" trigger={featuresTrigger}>
                {featureItems.map(item => (
                    <button key={item.id} id={`${item.id}-item`} onClick={item.handler} disabled={item.isDisabled} className={clsx('btn btn-secondary w-full justify-start', item.isActive && 'active')}>
                        <span ref={el => el && setIcon(el, item.iconKey)}></span>
                        <span>{item.labelKey}</span>
                        {item.isActive && <span ref={el => el && setIcon(el, 'UI_CHECK_CIRCLE')} className="material-icons ml-auto text-primary"></span>}
                    </button>
                ))}
            </Dropdown>
            <Dropdown id="header-landmarks-dropdown" trigger={landmarksTrigger}>
                {landmarkItems.map(item => (
                    <button key={item.id} id={`${item.id}-landmarks-item`} onClick={item.handler} disabled={item.isDisabled} className={clsx('btn btn-secondary w-full justify-start', item.isActive && 'active')}>
                        <span ref={el => el && setIcon(el, item.iconKey)}></span>
                        <span>{item.labelKey}</span>
                         {item.isActive && <span ref={el => el && setIcon(el, 'UI_CHECK_CIRCLE')} className="material-icons ml-auto text-primary"></span>}
                    </button>
                ))}
            </Dropdown>
        </div>
    );
}