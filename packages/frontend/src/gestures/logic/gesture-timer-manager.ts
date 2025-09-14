/* FILE: packages/frontend/src/gestures/logic/gesture-timer-manager.ts */
// Manages hold timers and global cooldown for gestures.
import type { AppStore } from "#frontend/core/state/app-store.js";
import {
  WEBCAM_EVENTS,
  GESTURE_EVENTS,
} from "#shared/index.js";
import { pubsub } from "#shared/core/pubsub.js";

interface HoldState {
  startTime: number | null;
  lastSeen: number;
  presenceStartTime: number | null;
}

const GESTURE_HOLD_STATE: { [gestureName: string]: HoldState } = {};
const GESTURE_STATE_PRUNE_MS = 250;

export class GestureTimerManager {
  #globalCooldownMs = 2000;
  #globalCooldownEndTime = 0;
  #appStore: AppStore;
  #unsubscribeStore: () => void;

  constructor(appStore: AppStore) {
    this.#appStore = appStore;
    this.#globalCooldownMs =
      (this.#appStore.getState().globalCooldown ?? 2.0) * 1000;

    this.#unsubscribeStore = this.#appStore.subscribe((state) => {
        const newCooldown = state.globalCooldown;
        if (typeof newCooldown === "number" && newCooldown >= 0) {
          this.#globalCooldownMs = newCooldown * 1000;
        }
      }
    );
    pubsub.subscribe(WEBCAM_EVENTS.STREAM_STOP, this.resetAllTimersAndStates);
  }

  isCooldownActive = (now: number = Date.now()): boolean =>
    now < this.#globalCooldownEndTime;

  getGlobalCooldownPercent = (now: number = Date.now()): number => {
    if (this.#globalCooldownMs <= 0 || !this.isCooldownActive(now)) return 0;
    // This calculates the ELAPSED time as a percentage, making it count UP from 0 to 1.
    const startTime = this.#globalCooldownEndTime - this.#globalCooldownMs;
    const elapsed = now - startTime;
    return Math.min(1, elapsed / this.#globalCooldownMs);
  };

  getRemainingCooldownMs = (now: number = Date.now()): number => {
    return Math.max(0, this.#globalCooldownEndTime - now);
  };

  startGlobalCooldown = (now: number = Date.now()): void => {
    this.#globalCooldownEndTime = now + this.#globalCooldownMs;
  };

  resetGlobalCooldown = (): void => {
    this.#globalCooldownEndTime = 0;
  };

  updateHoldState = (
    gestureKey: string,
    detectionMetThreshold: boolean,
    now: number = Date.now()
  ): void => {
    if (detectionMetThreshold) {
      if (!GESTURE_HOLD_STATE[gestureKey]) {
        GESTURE_HOLD_STATE[gestureKey] = {
          startTime: now,
          lastSeen: now,
          presenceStartTime: now,
        };
      } else {
        GESTURE_HOLD_STATE[gestureKey].lastSeen = now;
        if (GESTURE_HOLD_STATE[gestureKey].startTime === null) {
          GESTURE_HOLD_STATE[gestureKey].startTime = now;
        }
      }
    } else {
      if (GESTURE_HOLD_STATE[gestureKey]) {
        delete GESTURE_HOLD_STATE[gestureKey];
      }
    }
  };

  pruneExpiredHoldStates = (now: number = Date.now()): void => {
    Object.keys(GESTURE_HOLD_STATE).forEach((key) => {
      if (now - GESTURE_HOLD_STATE[key].lastSeen > GESTURE_STATE_PRUNE_MS) {
        delete GESTURE_HOLD_STATE[key];
      }
    });
  };

  getGestureHoldState = (gestureKey: string): HoldState | undefined => {
    return GESTURE_HOLD_STATE[gestureKey];
  };

  resetAllGestureHoldStates = (): void => {
    Object.keys(GESTURE_HOLD_STATE).forEach(
      (key) => delete GESTURE_HOLD_STATE[key]
    );
  };

  resetAllTimersAndStates = (): void => {
    this.resetGlobalCooldown();
    this.resetAllGestureHoldStates();
    pubsub.publish(GESTURE_EVENTS.TIMERS_RESET);
  };

  destroy(): void {
    this.#unsubscribeStore();
  }
}