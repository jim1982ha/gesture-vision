// --- packages/frontend/src/core/state/slices/statusSlice.ts --- (complete version) ---
import type { StateCreator } from 'zustand';
import { produce } from 'immer';
import type { CameraService } from '#frontend/services/camera.service.js';

export interface StatusSlice {
  isInitialConfigLoaded: boolean;
  isWsConnected: boolean;
  isWebcamRunning: boolean;
  isStreamConnecting: boolean;
  handModelLoaded: boolean;
  poseModelLoaded: boolean;
  isActionDispatchSuppressed: boolean;
  streamStatus: Map<string, string>;
  _cameraServiceInstance: CameraService | null;

  actions: {
    setInitialLoadStatus: (isLoaded: boolean) => void;
    setWsConnectionStatus: (isConnected: boolean) => void;
    setWebcamRunningStatus: (isRunning: boolean) => void;
    setIsStreamConnecting: (isConnecting: boolean) => void;
    setModelLoadingStatus: (status: { hand?: boolean; pose?: boolean }) => void;
    setIsActionDispatchSuppressed: (isSuppressed: boolean) => void;
    setStreamStatus: (pathName: string, status: string) => void;
    setCameraService: (service: CameraService) => void;
    getCameraService: () => CameraService | null;
  };
}

export const createStatusSlice: StateCreator<StatusSlice, [], [], StatusSlice> = (set, get) => ({
  isInitialConfigLoaded: false,
  isWsConnected: false,
  isWebcamRunning: false,
  isStreamConnecting: false,
  handModelLoaded: false,
  poseModelLoaded: false,
  isActionDispatchSuppressed: false,
  streamStatus: new Map<string, string>(),
  _cameraServiceInstance: null, // Initialize internal state

  actions: {
    setInitialLoadStatus: (isLoaded) => set({ isInitialConfigLoaded: isLoaded }),
    setWsConnectionStatus: (isConnected) => set({ isWsConnected: isConnected }),
    setWebcamRunningStatus: (isRunning) => set({ isWebcamRunning: isRunning }),
    setIsStreamConnecting: (isConnecting) => set({ isStreamConnecting: isConnecting }),
    
    setModelLoadingStatus: (status) => set(produce((draft: StatusSlice) => {
      if (typeof status.hand === 'boolean') draft.handModelLoaded = status.hand;
      if (typeof status.pose === 'boolean') draft.poseModelLoaded = status.pose;
    })),
  
    setIsActionDispatchSuppressed: (isSuppressed) => set({ isActionDispatchSuppressed: isSuppressed }),
  
    setStreamStatus: (pathName, status) => set(produce((draft: StatusSlice) => {
      draft.streamStatus.set(pathName, status);
    })),
    
    setCameraService: (service) => set({ _cameraServiceInstance: service }),
    getCameraService: () => get()._cameraServiceInstance,
  }
});