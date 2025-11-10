/* FILE: packages/frontend/src/hooks/useAppInitializer.ts */
import { useEffect, useRef } from 'react';
import { type AppContextType } from '#frontend/types/index.js';
import { CameraManager } from '#frontend/camera/camera-manager.js';
import { CameraService } from '#frontend/services/camera.service.js';
import { GestureProcessor } from '#frontend/gestures/processor.js';
import { TelemetryService } from '#frontend/services/telemetry-service.js';
import { NotificationManager } from '#frontend/services/notification-manager.js';
import { CanvasRenderer } from '#frontend/camera/canvas-renderer.js';
import { CameraSourceManager } from '#frontend/camera/source-manager.js';
import { CameraStreamService } from '#frontend/camera/stream-service.js';
import { CameraStateBridge } from '#frontend/camera/state-bridge.js';
import { pubsub, UI_EVENTS, normalizeNameForMtx } from '#shared/index.js';

/**
 * A hook that runs once to connect singleton services to the DOM and handle their cleanup.
 * The services themselves are created once in main.tsx.
 */
export const useAppInitializer = (context: AppContextType): AppContextType => {
  const initializedRef = useRef(false);

  useEffect(() => {
    // This guard prevents the effect from running more than once in its lifecycle,
    // but StrictMode will still cause a mount-unmount-mount sequence.
    if (initializedRef.current) return;
    initializedRef.current = true;
    console.log('[AppInitializer TRACE] Initializer hook effect is running.');
    
    const videoElement = document.getElementById("webcam") as HTMLVideoElement;
    const outputCanvas = document.getElementById("output_canvas") as HTMLCanvasElement;
    if (!videoElement || !outputCanvas) {
      console.error("[AppInitializer] Fatal: DOM elements for video/canvas not found.");
      return;
    }

    const { appStore, services } = context;

    const canvasRenderer = new CanvasRenderer({ outputCanvas, videoElement }, appStore, (sourceId, roiConfig) => {
        if (!sourceId) return;
        const currentSources = appStore.getState().rtspSources;
        const patchData = { rtspSources: currentSources.map((s) => `rtsp:${normalizeNameForMtx(s.name)}` === sourceId ? { ...s, roi: roiConfig } : s) };
        appStore.getState().actions.requestBackendPatch(patchData);
    });
    
    const gestureProcessor = new GestureProcessor(appStore, services.translationService, canvasRenderer);
    const sourceManager = new CameraSourceManager(appStore, services.translationService);
    
    const streamService = new CameraStreamService({
        getAppStore: () => appStore,
        canFlipCamera: () => 'facingMode' in navigator.mediaDevices.getSupportedConstraints(),
    });
    
    const cameraManager = new CameraManager(videoElement, appStore, gestureProcessor, canvasRenderer, sourceManager, streamService);
    const stateBridge = new CameraStateBridge(cameraManager, appStore);
    cameraManager.setStateBridge(stateBridge);
    
    const cameraService = new CameraService(cameraManager);
    
    const telemetryService = new TelemetryService(appStore);
    const notificationManager = new NotificationManager(appStore, services.translationService);

    services.pluginUIService.setDependencies({ cameraService, gestureProcessor });
    services.cameraService = cameraService;
    services.gestureProcessor = gestureProcessor;
    context.elements.videoElement = videoElement;
    context.elements.outputCanvas = outputCanvas;
    
    cameraManager.initialize();

    if (import.meta.env.MODE === 'development') window.appContext = context;
    
    const versionElement = document.getElementById('appVersionDisplaySettings');
    if (versionElement) versionElement.textContent = `v${__APP_VERSION__}`;

    pubsub.publish(UI_EVENTS.APP_INITIALIZED);

    return () => {
      initializedRef.current = false; // Allow re-initialization on next mount
      cameraManager.destroy();
      gestureProcessor.destroy();
      telemetryService.destroy();
      notificationManager.destroy();
      console.log("[AppInitializer] Component-level services have been cleaned up.");
    };
  }, [context]); // Rerun if the base context itself were to change (it won't).

  return context;
};