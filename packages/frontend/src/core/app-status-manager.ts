/* FILE: packages/frontend/src/core/app-status-manager.ts */
import { WEBCAM_EVENTS, GESTURE_EVENTS, CAMERA_SOURCE_EVENTS, APP_STATUS_EVENTS, UI_EVENTS } from "#shared/index.js";
import { pubsub } from "#shared/core/pubsub.js";
 
import type { App } from "./app.js"; 

export class AppStatusManager {
  #isStreamConnecting = false;
  #appRef: App | null = null; 

  public setAppRef(appRef: App): void {
    this.#appRef = appRef;
    this.#subscribeToEvents(); 
  }

  #subscribeToEvents(): void {
    if (!this.#appRef) return; 

    pubsub.subscribe(WEBCAM_EVENTS.STREAM_START, () => { 
      this.#setWebcamRunning(true);
      this.setIsStreamConnecting(false); 
      this.#appRef?.gesture?.enableProcessing(true);
    });
    
    const stopProcessingHandler = () => {
      this.#appRef?.gesture?.enableProcessing(false);
      this.#setWebcamRunning(false);
      this.setIsStreamConnecting(false); 
    };

    pubsub.subscribe(WEBCAM_EVENTS.STREAM_STOP, stopProcessingHandler);
    pubsub.subscribe(WEBCAM_EVENTS.ERROR, stopProcessingHandler); 
    pubsub.subscribe(WEBCAM_EVENTS.STREAM_CONNECTION_CANCELLED, stopProcessingHandler);

    pubsub.subscribe(GESTURE_EVENTS.MODEL_LOADED, (status?: unknown) => {
      if (status && typeof status === 'object') {
          this.#appRef?.appStore.getState().actions.setModelLoadingStatus(status as { hand?: boolean; pose?: boolean });
          
          const isFullyLoaded = this.#appRef?.gesture?.isModelLoaded() ?? false;
          pubsub.publish(APP_STATUS_EVENTS.MODEL_STATE_CHANGED, isFullyLoaded);
          pubsub.publish(UI_EVENTS.REQUEST_BUTTON_STATE_UPDATE);
      }
    });

    pubsub.subscribe(CAMERA_SOURCE_EVENTS.CHANGED, () => { 
      this.setIsStreamConnecting(false); 
      pubsub.publish(UI_EVENTS.REQUEST_BUTTON_STATE_UPDATE); 
    });
    
    pubsub.subscribe(CAMERA_SOURCE_EVENTS.REQUESTING_STREAM_START, () => { 
      this.setIsStreamConnecting(true); 
    });
  }

  #setWebcamRunning(running: boolean): void {
    const newState = !!running;
    const currentIsRunning = this.#appRef?.appStore.getState().isWebcamRunning ?? false;
    if (currentIsRunning !== newState) {
        this.#appRef?.appStore.getState().actions.setWebcamRunningStatus(newState);
    }
  }

  setIsStreamConnecting(connecting: boolean): void {
    const newState = !!connecting;
    const changed = this.#isStreamConnecting !== newState;
    this.#isStreamConnecting = newState;
    if (changed) {
      pubsub.publish(APP_STATUS_EVENTS.STREAM_CONNECTING_STATE_CHANGED, newState); 
      pubsub.publish(UI_EVENTS.REQUEST_BUTTON_STATE_UPDATE); 
    }
  }

  isWebcamRunning(): boolean {
    return this.#appRef?.appStore.getState().isWebcamRunning ?? false;
  }

  isModelLoaded(): boolean {
    if (!this.#appRef || !this.#appRef.gesture) {
        return false;
    }
    return this.#appRef.gesture.isModelLoaded();
  }

  isStreamConnecting(): boolean {
    return this.#isStreamConnecting;
  }
}