/* FILE: packages/frontend/src/camera/state-bridge.ts */
import { pubsub, UI_EVENTS, WEBCAM_EVENTS } from '#shared/index.js';
import type { AppStore, AppState } from '#frontend/core/state/app-store.js';
import type { CameraManager } from './camera-manager.js';
import type { RtspSourceConfig } from '#shared/index.js';

/**
 * Acts as a bridge between the core CameraManager and the rest of the application's state and event system.
 * It subscribes to events and store changes, and translates them into actions on the CameraManager.
 */
export class CameraStateBridge {
  #cameraManager: CameraManager;
  #appStore: AppStore;
  #unsubscribeStore: () => void;
  #subscriptions: (() => void)[] = [];

  constructor(cameraManager: CameraManager, appStore: AppStore) {
    this.#cameraManager = cameraManager;
    this.#appStore = appStore;

    this.#attachPubSubListeners();
    this.#unsubscribeStore = this.#appStore.subscribe((state: AppState, prevState: AppState) => this.#handleStoreChange(state, prevState));
  }

  destroy() {
    this.#unsubscribeStore();
    this.#subscriptions.forEach(unsub => unsub());
    this.#subscriptions = [];
  }

  #attachPubSubListeners() {
    this.#subscriptions.push(
      pubsub.subscribe(UI_EVENTS.REQUEST_MIRROR_TOGGLE, () => this.#cameraManager.toggleMirroringForCurrentStream()),
      pubsub.subscribe(WEBCAM_EVENTS.STREAM_STOP, () => this.#appStore.getState().actions.setWebcamRunningStatus(false)),
      pubsub.subscribe(UI_EVENTS.VIDEO_EXIT_FULLSCREEN, () => this.#appStore.getState().actions.toggleVideoExpanded())
    );
  }

  #handleStoreChange(state: AppState, prevState: AppState) {
    // Handle RTSP config updates while a stream is active
    if (state.rtspSources !== prevState.rtspSources && this.#cameraManager.isStreaming()) {
      this.#cameraManager.handleLiveRtspConfigUpdate(state.rtspSources as RtspSourceConfig[]);
    }

    // Handle resolution preference changes for webcam streams
    if (state.processingResolutionWidthPreference !== prevState.processingResolutionWidthPreference && this.#cameraManager.isStreaming() && !this.#cameraManager.isStreamingRtsp()) {
      this.#cameraManager.start(this.#cameraManager.getCurrentDeviceId() || '', null).catch(e => console.error("Error restarting stream after resolution change:", e));
    }

    // Trigger redraw if landmark visibility toggles are changed
    if (state.showHandLandmarks !== prevState.showHandLandmarks || state.showPoseLandmarks !== prevState.showPoseLandmarks) {
      this.#cameraManager.getCanvasRenderer().drawOutput();
    }
  }
}