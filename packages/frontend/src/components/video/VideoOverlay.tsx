/* FILE: packages/frontend/src/components/video/VideoOverlay.tsx */
import { StatusOverlay } from './StatusOverlay.js';
import { Toolbar } from './Toolbar.js';
import { TuningPanels } from './TuningPanels.js';
import { ProgressRings } from './ProgressRings.js';
import { GestureFeedback } from './GestureFeedback.js';

export function VideoOverlay() {
  return (
    <>
      <Toolbar />
      <TuningPanels />
      
      <div id="video-overlay-container" className="absolute inset-0 z-20 pointer-events-none flex flex-col justify-between p-2">
        <div></div> {/* Spacer */}
        <GestureFeedback />
      </div>
      
      <ProgressRings />
      <StatusOverlay />
    </>
  );
}