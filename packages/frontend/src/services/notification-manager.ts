/* FILE: packages/frontend/src/services/notification-manager.ts */
import type { UIController } from "#frontend/ui/ui-controller-core.js";
 
import { UI_EVENTS, WEBSOCKET_EVENTS, WEBCAM_EVENTS } from "#shared/constants/index.js";
import { pubsub } from "#shared/core/pubsub.js"; 
import { translate } from "#shared/services/translations.js";

 
import type { ActionResultPayload, UploadCustomGestureAckPayload, ValidationErrorDetail } from "#shared/types/index.js"; 

interface NotificationData {
    messageKey?: string;
    message?: string;
    substitutions?: Record<string, string | number | undefined>;
    type?: 'info' | 'success' | 'warning' | 'error';
    duration?: number;
    code?: string; 
}

interface ShowErrorPayload {
    messageKey?: string;
    message?: string; 
    substitutions?: Record<string, unknown>;
    type?: 'error'; 
}

export interface NotificationManagerElements { 
    gestureAlertDiv: HTMLElement | null;
    gestureAlertTextSpan: HTMLElement | null;
}


export class NotificationManager {
  #alertDiv: HTMLElement | null = null;
  #alertTextSpan: HTMLElement | null = null;
  #activeTimeout: number | null = null;
  #uiControllerRef: UIController | null = null;
  #isInitialized = false;

  constructor(uiControllerRef: UIController | null) { 
    this.#uiControllerRef = uiControllerRef;

    if (!this.#uiControllerRef) {
      console.warn(
        "[NotificationManager] UIController reference not provided initially. It should be set later."
      );
    }
    this.#initialize();
  }
  
  public setUIController(uiController: UIController): void {
      this.#uiControllerRef = uiController;
      this.#initialize();
  }

  async #initialize(): Promise<void> {
    if (this.#isInitialized || !this.#uiControllerRef) return;

    const allElements = this.#uiControllerRef._elements;
    if (allElements) {
      this.#alertDiv = allElements.gestureAlertDiv as HTMLElement | null ?? null;
      this.#alertTextSpan = allElements.gestureAlertTextSpan as HTMLElement | null ?? null;
    }

    if (!this.#alertDiv || !this.#alertTextSpan) {
      console.warn(
        "[NotificationManager] Missing required alert elements. Notifications disabled."
      );
      this.#isInitialized = true; 
      return;
    }
    this.#attachEventListeners();
    this.#isInitialized = true;
  }

  #attachEventListeners(): void {
    pubsub.subscribe(UI_EVENTS.SHOW_NOTIFICATION, (dataUnknown?: unknown) => { 
      if (!this.#isInitialized) return;
      const data = dataUnknown as NotificationData | undefined;
      if (!data) return;
      const msg = data.messageKey
        ? translate(data.messageKey, data.substitutions || {})
        : data.message || "Notification";
      this.showNotification(msg, data.type, data.duration);
    });
    pubsub.subscribe(UI_EVENTS.SHOW_ERROR, (dataUnknown?: unknown) => { 
      if (!this.#isInitialized) return;
      const data = dataUnknown as ShowErrorPayload | undefined;
      if (!data) return;
      let msg = "";
      
      const substitutions = (data.substitutions || {}) as Record<string, string | number | undefined>;

      if (data.messageKey) {
          msg = translate(data.messageKey, substitutions);
      } else {
          msg = data.message || "unknownError";
      }

      this.showNotification(msg, "error");
    });
    pubsub.subscribe(WEBSOCKET_EVENTS.BACKEND_ACTION_RESULT, (dataUnknown?: unknown) => { 
      if (!this.#isInitialized) return;
      const result = dataUnknown as ActionResultPayload | undefined;
      if (!result || result.pluginId === "none")
        return;
      if (!result.success) {
        this.showNotification(
          `${translate("historyActionFailed", {
            actionType: result.pluginId || "?",
            reason: "",
          })} ${result.message || ""}`.trim(),
          "error"
        );
      }
    });
    
    pubsub.subscribe(WEBCAM_EVENTS.STREAM_CONNECTION_CANCELLED, () => {
      if (!this.#isInitialized) return;
      this.showNotification(
        translate("streamConnectionCancelled"),
        "info",
        2500
      );
    });

    pubsub.subscribe(UI_EVENTS.CONFIG_VALIDATION_ERROR, (errorsUnknown?: unknown) => {
      if (!this.#isInitialized) return;
      const validationErrors = errorsUnknown as ValidationErrorDetail[] | undefined;
      if (validationErrors && validationErrors.length > 0) {
        let fullMessage = translate("configValidationFailedTitle") + "\n";
        validationErrors.forEach(err => {
            const fieldNameLabelKey = `${err.field}Label`; 
            let displayFieldName = translate(fieldNameLabelKey, { defaultValue: err.field });
            
            if (displayFieldName === `[${fieldNameLabelKey}]` || displayFieldName === err.field) {
                displayFieldName = err.field.replace(/([A-Z])/g, ' $1').replace(/^./, (str: string) => str.toUpperCase());
            }

            const detailsObject = typeof err.details === 'object' && err.details !== null ? err.details as Record<string, string | number> : {};
            const errorMsg = translate(err.messageKey, { ...detailsObject, field: displayFieldName, defaultValue: err.messageKey });
            fullMessage += `\n- ${displayFieldName}: ${errorMsg}`;
        });
        this.showNotification(fullMessage, "error", 8000); 
      } else {
        this.showNotification(translate("configValidationFailedGeneric"), "error");
      }
    });

    pubsub.subscribe(WEBSOCKET_EVENTS.BACKEND_UPLOAD_CUSTOM_GESTURE_ACK, (payload?: unknown) => {
      const ack = payload as UploadCustomGestureAckPayload | undefined;
      if (!ack) return;
      
      if (ack.success) {
          this.showNotification(translate('toastSaveSuccess', { name: ack.newDefinition?.name || '?' }), 'success');
      } else {
          this.showNotification(translate('toastSaveFailed', { message: ack.message || 'Unknown error' }), 'error');
      }
  });
  }

  showNotification(msg: string, type: NotificationData['type'] = "info", duration = 3000): void {
    if (!this.#isInitialized || !this.#alertDiv || !this.#alertTextSpan || !msg)
      return;
    if (this.#activeTimeout) {
      clearTimeout(this.#activeTimeout);
      this.#activeTimeout = null;
    }
    
    this.#alertTextSpan.style.whiteSpace = msg.includes('\n') ? 'pre-wrap' : 'normal';
    this.#alertTextSpan.textContent = msg; 
    
    this.#alertDiv.className = `alert visible ${type}`;
    const effectiveDuration =
      type === "error" || type === "warning"
        ? Math.max(duration, 5000)
        : duration;
    this.#activeTimeout = window.setTimeout(() => { 
      this.hideNotification();
    }, effectiveDuration);
  }

  hideNotification(): void {
    if (this.#activeTimeout) {
      clearTimeout(this.#activeTimeout);
      this.#activeTimeout = null;
    }
    if (this.#alertDiv) {
      this.#alertDiv.classList.remove("visible");
    }
    if (this.#alertTextSpan) { 
        this.#alertTextSpan.style.whiteSpace = 'normal';
    }
  }
}