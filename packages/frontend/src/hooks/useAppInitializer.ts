/* FILE: packages/frontend/src/hooks/useAppInitializer.ts */
import { useEffect, useRef } from 'react';
import { type AppContextType } from '#frontend/types/index.js';
import { CameraManager } from '#frontend/camera/camera-manager.js';
import { CameraService } from '#frontend/services/camera.service.js';
import { GestureProcessor } from '#frontend/gestures/processor.js';
import { TelemetryService } from '#frontend/services/telemetry-service.js';
import { NotificationManager } from '#frontend/services/notification-manager.js';

let hasInitialized = false;

export const useAppInitializer = (baseContext: AppContextType): AppContextType => {
  // FIX: Use useRef to create a stable context object that will not change reference across re-renders.
  const contextRef = useRef<AppContextType>(baseContext);

  useEffect(() => {
    if (hasInitialized) return;
    hasInitialized = true;
    console.log('[AppInitializer] Running effect: Initializing services...');
    
    const videoElement = document.getElementById("webcam") as HTMLVideoElement;
    const outputCanvas = document.getElementById("output_canvas") as HTMLCanvasElement;
    if (!videoElement || !outputCanvas) {
      console.error("DOM element query failed post-render.");
      return;
    }

    const { appStore, services } = contextRef.current;
    const { translationService, pluginUIService } = services;

    // These services depend on DOM elements or are closely tied to the component lifecycle.
    const gestureProcessor = new GestureProcessor(appStore, translationService);
    const cameraManager = new CameraManager(videoElement, outputCanvas, appStore, gestureProcessor, translationService);
    const cameraService = new CameraService(cameraManager);
    new TelemetryService(appStore);
    new NotificationManager(appStore, translationService);

    gestureProcessor.setCanvasRenderer(cameraManager.getCanvasRenderer());
    pluginUIService.setDependencies({ cameraService, gestureProcessor });
    cameraManager.initialize();

    const versionElement = document.getElementById('appVersionDisplaySettings');
    if (versionElement) versionElement.textContent = `v${__APP_VERSION__}`;
    
    // FIX: Mutate the properties of the stable context object instead of creating a new one.
    contextRef.current.services.cameraService = cameraService;
    contextRef.current.services.gestureProcessor = gestureProcessor;
    contextRef.current.elements.videoElement = videoElement;
    contextRef.current.elements.outputCanvas = outputCanvas;

    if (import.meta.env.MODE === 'development') window.appContext = contextRef.current;

    // This cleanup function should ONLY destroy services created within this hook.
    // Services like ThemeManager, created in the base context, must persist.
    return () => {
      console.log('[AppInitializer] Cleanup effect: Destroying services...');
      cameraManager.destroy();
      gestureProcessor.destroy();
      hasInitialized = false;
    };
  }, []); // Empty dependency array ensures this effect runs only once on mount.

  // FIX: Always return the same stable context object reference.
  return contextRef.current;
};