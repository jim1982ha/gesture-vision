/* FILE: packages/frontend/src/hooks/useAppInitializer.ts */
import { useEffect, useRef } from 'react';
import { type AppContextType } from '#frontend/types/index.js';
import { CameraService } from '#frontend/services/camera.service.js';
import { GestureProcessor } from '#frontend/gestures/processor.js';
import { TelemetryService } from '#frontend/services/telemetry-service.js';
import { NotificationManager } from '#frontend/services/notification-manager.js';
import { CanvasRenderer } from '#frontend/camera/canvas-renderer.js';
import { pubsub, UI_EVENTS, normalizeNameForMtx } from '#shared/index.js';
import { GestureService } from '#frontend/services/gesture.service.js';

/**
 * A hook that runs once to connect singleton services to the DOM and handle their cleanup.
 * The services themselves are created once in main.tsx.
 */
export const useAppInitializer = (context: AppContextType): AppContextType => {
  const initializedRef = useRef(false);

  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;
    
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
        const patchData = {
          rtspSources: currentSources.map((s) =>
            `rtsp:${normalizeNameForMtx(s.name)}` === sourceId ? { ...s, roi: roiConfig } : s
          ),
        };
        appStore.getState().actions.requestBackendPatch(patchData);
    });
    
    const gestureService = new GestureService(appStore, services.translationService);
    const gestureProcessor = new GestureProcessor(appStore, gestureService, canvasRenderer);
    
    const cameraService = new CameraService({
      videoElement,
      outputCanvas,
      appStore,
      gestureProcessor,
      canvasRenderer,
      translationService: services.translationService,
    });
    
    const telemetryService = new TelemetryService(appStore);
    const notificationManager = new NotificationManager(appStore, services.translationService);

    services.pluginUIService.setDependencies({ cameraService, gestureProcessor });
    services.cameraService = cameraService;
    services.gestureProcessor = gestureProcessor;
    context.elements.videoElement = videoElement;
    context.elements.outputCanvas = outputCanvas;
    
    cameraService.initialize();

    if (import.meta.env.MODE === 'development') window.appContext = context;
    
    pubsub.publish(UI_EVENTS.APP_INITIALIZED);

    return () => {
      initializedRef.current = false;
      cameraService.destroy();
      gestureProcessor.destroy();
      telemetryService.destroy();
      notificationManager.destroy();
    };
  }, [context]);

  return context;
};