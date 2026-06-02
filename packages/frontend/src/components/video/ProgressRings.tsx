/* FILE: packages/frontend/src/components/video/ProgressRings.tsx */
import { useGestureFeedbackState } from '#frontend/hooks/useGestureFeedbackState.js';
import { useAppStore } from '#frontend/hooks/useAppStore.js';
import { setIcon, getGestureDisplayInfo, clsx } from '#frontend/ui/helpers/ui-helpers.js';

const RADIUS_HOLD = 31.5;
const CIRCUMFERENCE_HOLD = 2 * Math.PI * RADIUS_HOLD; // Approx 198

const RADIUS_COOLDOWN = 36.5;
const CIRCUMFERENCE_COOLDOWN = 2 * Math.PI * RADIUS_COOLDOWN; // Approx 230

export const ProgressRings = () => {
    const state = useGestureFeedbackState();
    const { holdPercent, cooldownPercent, gestureName } = state;
    const customGestureMetadataList = useAppStore(state => state.customGestureMetadataList);

    const holdOffset = CIRCUMFERENCE_HOLD * (1 - holdPercent);
    const cooldownOffset = CIRCUMFERENCE_COOLDOWN * (1 - cooldownPercent);

    const isVisible = holdPercent > 0 || cooldownPercent > 0;

    let iconIdentifier = 'UNKNOWN';
    if (gestureName && gestureName !== '-') {
        const displayInfo = getGestureDisplayInfo(gestureName, customGestureMetadataList);
        iconIdentifier = displayInfo.category || 'UNKNOWN';
    }

    return (
        <div 
            id="progress-rings-overlay" 
            className={clsx(
                "progress-rings w-20 h-20 z-30 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none",
                isVisible && "visible"
            )}
        >
            {/* Centered contextual icon inside the progress rings */}
            <div className="absolute inset-0 flex items-center justify-center z-10">
                <span 
                    ref={el => el && setIcon(el, iconIdentifier)} 
                    className="text-white text-3xl font-medium"
                    style={{ color: 'hsl(var(--color-on-primary))' }}
                ></span>
            </div>
            <svg className="w-full h-full relative z-20" viewBox="0 0 80 80">
                {/* Hold Progress Ring (Inner) */}
                <circle
                    id="progress-ring-hold"
                    className="gesture-progress"
                    cx="40"
                    cy="40"
                    r={RADIUS_HOLD}
                    strokeWidth="4"
                    strokeDasharray={CIRCUMFERENCE_HOLD}
                    strokeDashoffset={holdOffset}
                />
                {/* Cooldown Progress Ring (Outer) */}
                <circle
                    id="progress-ring-cooldown"
                    className="cooldown-progress"
                    cx="40"
                    cy="40"
                    r={RADIUS_COOLDOWN}
                    strokeWidth="2"
                    strokeDasharray={CIRCUMFERENCE_COOLDOWN}
                    strokeDashoffset={cooldownOffset}
                />
            </svg>
        </div>
    );
};