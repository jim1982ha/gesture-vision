/* FILE: packages/frontend/src/gestures/pose-state-logic.ts */
import { WEBCAM_EVENTS, pubsub } from '#shared/index.js';

import type { PoseConfig } from '#shared/index.js';
import type { AppStore } from "#frontend/core/state/app-store.js";

export class PoseStateLogic {
  constructor(_appStore: AppStore) {
    this.#subscribeToEvents();
  }

  #subscribeToEvents(): void {
    pubsub.subscribe(WEBCAM_EVENTS.STREAM_STOP, this.resetAllPoseHoldStates);
  }

  checkForStaticPoses(): { name: string; confidence: number }[] {
    return [];
  }

  updateConfigs(_newConfigs: PoseConfig[]): void {
    // Placeholder
  }

  resetAllPoseHoldStates = (): void => {
    // Placeholder
  };
}