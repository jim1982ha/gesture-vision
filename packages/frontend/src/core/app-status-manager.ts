/* FILE: packages/frontend/src/core/app-status-manager.ts */
import { WEBCAM_EVENTS, GESTURE_EVENTS, CAMERA_SOURCE_EVENTS, APP_STATUS_EVENTS, UI_EVENTS } from "#shared/constants/index.js";
import { pubsub } from "#shared/core/pubsub.js";
 
import type { App } from "./app.js"; 

export class AppStatusManager {
  #webcamRunning = false;
  #modelLoaded = false; 
  #isStreamConnecting = false;
  #appRef: App | null = null; 

  public setAppRef(appRef: App): void {
    this.#appRef = appRef;
    this.#subscribeToEvents(); 
    console.log("[AppStatusManager] App reference set and events subscribed.");
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

    pubsub.subscribe(GESTURE_EVENTS.MODEL_LOADED, () => {  
      const currentCombinedModelStatus = this.#appRef?.gesture?.isModelLoaded() ?? false;
      this.#setModelLoaded(currentCombinedModelStatus);
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
    const changed = this.#webcamRunning !== newState;
    this.#webcamRunning = newState;
    if (changed) {
      pubsub.publish(APP_STATUS_EVENTS.WEBCAM_STATE_CHANGED, newState); 
      pubsub.publish(UI_EVENTS.REQUEST_BUTTON_STATE_UPDATE); 
    }
  }

  #setModelLoaded(loaded: boolean): void {
    const newState = !!loaded;
    const changed = this.#modelLoaded !== newState;
    this.#modelLoaded = newState;
    if (changed) {
      console.log("[AppStatusManager] Combined model loaded status changed to", newState); 
      pubsub.publish(APP_STATUS_EVENTS.MODEL_STATE_CHANGED, newState); 
      pubsub.publish(UI_EVENTS.REQUEST_BUTTON_STATE_UPDATE); 
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
    return this.#webcamRunning;
  }

  isModelLoaded(): boolean {
    if (!this.#appRef || !this.#appRef.gesture) {
        return this.#modelLoaded; 
    }
    return this.#appRef.gesture.isModelLoaded();
  }

  isStreamConnecting(): boolean {
    return this.#isStreamConnecting;
  }
}
