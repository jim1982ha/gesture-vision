/* FILE: packages/frontend/src/components/main/OnboardingGuide.tsx */
import { useContext } from 'react';
import { AppContext } from '#frontend/contexts/AppContext.js';
import { setIcon } from '#frontend/ui/helpers/ui-helpers.js';

export const OnboardingGuide = () => {
  const context = useContext(AppContext);
  if (!context) return null;

  const { translate } = context.services.translationService;
  const { actions } = context.appStore.getState();

  const handleAddAction = () => {
    actions.openOverlay('gestureForm', null);
  };

  return (
    <div id="onboarding-guide" className="text-center p-8 flex flex-col items-center gap-4 my-8 rounded-lg border-2 border-dashed border-border-light bg-background">
      <svg id="onboarding-guide-icon" xmlns="http://www.w3.org/2000/svg" className="h-20 w-20 text-primary opacity-80" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12.83,6.05L12,5.5L11.17,6.05L7.5,8.11L12,10.5L16.5,8.11M12,1L3,6.5V17.5L12,23L21,17.5V6.5L12,1M19.5,16.5L12,20.5L4.5,16.5V7.5L12,3.5L19.5,7.5V16.5Z" />
        <path d="M11.17,11.55L7.5,13.61L12,16L16.5,13.61L12.83,11.55L12,11L11.17,11.55Z" />
      </svg>
      <h3 id="onboarding-guide-title" className="text-xl font-semibold text-text-primary">{translate('onboardingWelcomeTitle')}</h3>
      <p id="onboarding-guide-message" className="max-w-md text-text-secondary">{translate('noGesturesConfigured')}</p>
      <button id="onboarding-guide-add-action-button" className="btn btn-primary mt-4" onClick={handleAddAction}>
        <span ref={el => el && setIcon(el, 'UI_ADD')}></span>
        <span id="onboarding-guide-add-action-button-label">{translate('onboardingAddFirstAction')}</span>
      </button>
    </div>
  );
};