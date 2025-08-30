/* FILE: packages/frontend/src/services/telemetry-service.ts */
import type { AppStore } from "#frontend/core/state/app-store.js";
 
import { GESTURE_EVENTS, WEBSOCKET_EVENTS } from "#shared/index.js";
import { pubsub } from "#shared/core/pubsub.js";

 
import type { ActionResultPayload } from "#shared/index.js"; 

declare global {
  const __APP_VERSION__: string | undefined;
}

type TelemetryPropertyValue = string | number | boolean | undefined | null;

interface TelemetryEventProperties {
  timestamp: string;
  app_version: string;
  [key: string]: TelemetryPropertyValue; 
}

interface TelemetryEvent {
  event: string;
  properties: TelemetryEventProperties;
}

class TelemetryService {
  #isEnabled = false;
  #appStore: AppStore;
  #isInitialized = false; 
  #unsubscribeStore: () => void;

  constructor(appStore: AppStore) {
    this.#appStore = appStore;
    this.#subscribeToEvents();
    
    if (this.#appStore.getState().isInitialConfigLoaded) { 
      this.#initializeState();
    } else {
      const unsubscribe = this.#appStore.subscribe(
        (state) => {
          if (state.isInitialConfigLoaded) {
            this.#initializeState();
            unsubscribe();
          }
        }
      );
    }
    
    this.#unsubscribeStore = this.#appStore.subscribe(
        (state) => {
            if (this.#isInitialized) {
                this.#isEnabled = !!state.telemetryEnabled;
            }
        }
    );
  }

  #initializeState(): void {
    if (this.#isInitialized) return; 
    this.#isEnabled = this.#appStore.getState().telemetryEnabled ?? false; 
    this.#isInitialized = true;
  }

  #subscribeToEvents(): void {
    pubsub.subscribe(GESTURE_EVENTS.RECORDED, (dataUnknown?: unknown) => this.#handleGestureRecorded(dataUnknown as { gesture?: string; actionType?: string /* This is pluginId */ } | undefined));
    pubsub.subscribe(WEBSOCKET_EVENTS.BACKEND_ACTION_RESULT, (dataUnknown?: unknown) => this.#handleActionResult(dataUnknown as ActionResultPayload | undefined));
    pubsub.subscribe(GESTURE_EVENTS.MODEL_LOADED, (dataUnknown?: unknown) => this.#handleModelLoaded(dataUnknown as { hand?: boolean; pose?: boolean } | undefined));
  }

  destroy() {
    this.#unsubscribeStore();
  }

  #handleGestureRecorded = (payload?: { gesture?: string; actionType?: string /* pluginId */ }): void => { 
    if (!payload?.gesture) return;
    this.trackEvent("gesture_triggered", {
      gesture: payload.gesture,
      action_plugin_id: payload.actionType || "none",
    });
  };

  #handleActionResult = (payload?: ActionResultPayload): void => { 
    if (!payload?.pluginId) return;
    this.trackEvent("action_executed", {
      action_plugin_id: payload.pluginId,
      success: payload.success,
      error_code: !payload.success
        ? payload.details && typeof payload.details === 'object' && 'code' in payload.details 
            ? String(payload.details.code) 
            : "UNKNOWN"
        : undefined,
    });
  };

  #handleModelLoaded = (isLoaded?: { hand?: boolean; pose?: boolean }): void => { 
    if (isLoaded && (isLoaded.hand || isLoaded.pose)) {
      this.trackEvent("model_loaded", {
        delegate: "CPU", 
        hand_model_loaded: !!isLoaded.hand,
        pose_model_loaded: !!isLoaded.pose
      });
    }
  };

  trackEvent(eventName: string, properties: Record<string, TelemetryPropertyValue> = {}): void { 
    if (!this.#isInitialized || !this.#isEnabled) {
      return;
    }

    const _eventData: TelemetryEvent = {
      event: eventName,
      properties: {
        ...properties,
        timestamp: new Date().toISOString(),
        app_version:
          typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "dev",
      },
    };
  }
}
export { TelemetryService };