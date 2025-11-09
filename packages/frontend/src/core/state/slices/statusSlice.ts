/* FILE: packages/frontend/src/core/state/slices/statusSlice.ts */
import type { StateCreator } from 'zustand';
import { produce } from 'immer';

export interface StatusSlice {
  isInitialConfigLoaded: boolean;
  isWsConnected: boolean;
  isWebcamRunning: boolean;
  isStreamConnecting: boolean;
  handModelLoaded: boolean;
  poseModelLoaded: boolean;
  isActionDispatchSuppressed: boolean;
  streamStatus: Map<string, string>;

  actions: {
    setInitialLoadStatus: (isLoaded: boolean) => void;
    setWsConnectionStatus: (isConnected: boolean) => void;
    setWebcamRunningStatus: (isRunning: boolean) => void;
    setIsStreamConnecting: (isConnecting: boolean) => void;
    setModelLoadingStatus: (status: { hand?: boolean; pose?: boolean }) => void;
    setIsActionDispatchSuppressed: (isSuppressed: boolean) => void;
    setStreamStatus: (pathName: string, status: string) => void;
  };
}

export const createStatusSlice: StateCreator<StatusSlice, [], [], StatusSlice> = (set) => ({
  isInitialConfigLoaded: false,
  isWsConnected: false,
  isWebcamRunning: false,
  isStreamConnecting: false,
  handModelLoaded: false,
  poseModelLoaded: false,
  isActionDispatchSuppressed: false,
  streamStatus: new Map<string, string>(),

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
  }
});