/* FILE: packages/frontend/src/components/video/ProgressRings.tsx */
import { useGestureFeedbackState } from '#frontend/hooks/useGestureFeedbackState.js';
import { clsx } from '#frontend/ui/helpers/ui-helpers.js';

const RADIUS_HOLD = 31.5;
const CIRCUMFERENCE_HOLD = 2 * Math.PI * RADIUS_HOLD; // Approx 198

const RADIUS_COOLDOWN = 36.5;
const CIRCUMFERENCE_COOLDOWN = 2 * Math.PI * RADIUS_COOLDOWN; // Approx 230

export const ProgressRings = () => {
    const { holdPercent, cooldownPercent } = useGestureFeedbackState();

    const holdOffset = CIRCUMFERENCE_HOLD * (1 - holdPercent);
    const cooldownOffset = CIRCUMFERENCE_COOLDOWN * (1 - cooldownPercent);

    const isVisible = holdPercent > 0 || cooldownPercent > 0;

    return (
        <div 
            id="progress-rings-overlay" 
            className={clsx(
                "progress-rings w-20 h-20 z-30 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none",
                isVisible && "visible"
            )}
        >
            <svg className="w-full h-full" viewBox="0 0 80 80">
                {/* Hold Progress Ring (Inner) */}
                <circle
                    id="progress-ring-hold"
                    className="gesture-progress"
                    cx="40"
                    cy="40"
                    r={RADIUS_HOLD}
                    strokeWidth="4"
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
                    strokeDashoffset={cooldownOffset}
                />
            </svg>
        </div>
    );
};