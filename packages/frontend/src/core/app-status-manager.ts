/* FILE: packages/frontend/src/core/app-status-manager.ts */
import { WEBCAM_EVENTS, GESTURE_EVENTS, CAMERA_SOURCE_EVENTS, UI_EVENTS } from "#shared/index.js";
import { pubsub } from "#shared/core/pubsub.js";
 
import type { App } from "./app.js"; 

export class AppStatusManager {
  #appRef: App | null = null; 

  public setAppRef(appRef: App): void {
    this.#appRef = appRef;
    this.#subscribeToEvents(); 
  }

  #subscribeToEvents(): void {
    if (!this.#appRef) return; 

    pubsub.subscribe(WEBCAM_EVENTS.STREAM_START, () => { 
      this.#getActions()?.setWebcamRunningStatus(true);
      this.#getActions()?.setIsStreamConnecting(false); 
      this.#appRef?.gesture?.enableProcessing(true);
    });
    
    const stopProcessingHandler = () => {
      this.#appRef?.gesture?.enableProcessing(false);
      this.#getActions()?.setWebcamRunningStatus(false);
      this.#getActions()?.setIsStreamConnecting(false); 
    };

    pubsub.subscribe(WEBCAM_EVENTS.STREAM_STOP, stopProcessingHandler);
    pubsub.subscribe(WEBCAM_EVENTS.ERROR, stopProcessingHandler); 
    pubsub.subscribe(WEBCAM_EVENTS.STREAM_CONNECTION_CANCELLED, stopProcessingHandler);

    pubsub.subscribe(GESTURE_EVENTS.MODEL_LOADED, (status?: unknown) => {
      if (status && typeof status === 'object') {
          this.#getActions()?.setModelLoadingStatus(status as { hand?: boolean; pose?: boolean });
          pubsub.publish(UI_EVENTS.REQUEST_BUTTON_STATE_UPDATE);
      }
    });

    pubsub.subscribe(CAMERA_SOURCE_EVENTS.CHANGED, () => { 
      this.#getActions()?.setIsStreamConnecting(false); 
      pubsub.publish(UI_EVENTS.REQUEST_BUTTON_STATE_UPDATE); 
    });
    
    pubsub.subscribe(CAMERA_SOURCE_EVENTS.REQUESTING_STREAM_START, () => { 
      this.#getActions()?.setIsStreamConnecting(true); 
    });
  }
  
  #getActions() {
    return this.#appRef?.appStore.getState().actions;
  }
}