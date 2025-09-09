/* FILE: packages/frontend/src/services/notification-manager.ts */
import { UI_EVENTS, WEBSOCKET_EVENTS, WEBCAM_EVENTS, pubsub, translate } from "#shared/index.js";
 
import type { AppStore } from "#frontend/core/state/app-store.js";
import type { ActionResultPayload, UploadCustomGestureAckPayload, ValidationErrorDetail } from "#shared/index.js"; 

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

export class NotificationManager {
  #alertDiv: HTMLElement | null = null;
  #alertTextSpan: HTMLElement | null = null;
  #activeTimeout: number | null = null;
  #isInitialized = false;
  #appStore: AppStore;

  constructor(appStore: AppStore) {
    this.#appStore = appStore;
    this.#alertDiv = document.getElementById("gestureAlert") as HTMLElement | null;
    this.#alertTextSpan = document.getElementById("gestureAlertText") as HTMLElement | null;

    if (!this.#alertDiv || !this.#alertTextSpan) {
      console.warn(
        "[NotificationManager] Missing required alert elements. Notifications disabled."
      );
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

    // FIX: This handler is now the single source for action result notifications, showing for both success and failure.
    pubsub.subscribe(WEBSOCKET_EVENTS.BACKEND_ACTION_RESULT, (dataUnknown?: unknown) => { 
      if (!this.#isInitialized) return;
      const result = dataUnknown as ActionResultPayload | undefined;
      if (!result || result.pluginId === "none") return;

      const manifest = this.#appStore.getState().pluginManifests.find(m => m.id === result.pluginId);
      const actionType = translate(manifest?.nameKey || 'unknownPlugin', { defaultValue: result.pluginId });
      const gestureName = translate(result.gestureName, { defaultValue: result.gestureName });
      
      const messageKey = result.success ? 'notificationActionSuccess' : 'notificationActionFailed';
      const notificationType = result.success ? 'success' : 'error';
      
      this.showNotification(
        translate(messageKey, {
          actionType: actionType,
          gestureName: gestureName,
          message: result.message || ''
        }),
        notificationType
      );
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
    if (!this.#isInitialized || !this.#alertDiv || !this.#alertTextSpan || !msg) return;

    if (this.#activeTimeout) {
      clearTimeout(this.#activeTimeout);
      this.#activeTimeout = null;
    }
    
    this.#alertTextSpan.style.whiteSpace = msg.includes('\n') ? 'pre-wrap' : 'normal';
    this.#alertTextSpan.textContent = msg; 
    
    // FIX: Use classList to add/remove classes instead of overwriting className.
    this.#alertDiv.classList.remove('alert-info', 'alert-success', 'alert-warning', 'alert-error');
    this.#alertDiv.classList.add(`alert-${type}`, 'visible');

    const effectiveDuration = type === "error" || type === "warning" ? Math.max(duration, 5000) : duration;

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