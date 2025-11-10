/* FILE: packages/frontend/src/core/state/slices/uiSlice.ts */
import type { StateCreator } from 'zustand';
import { produce } from 'immer';
import { PreferenceService, type PreferenceKey, type PreferenceValue } from '#frontend/services/preference.service.js';
import type { ThemePreference, ConfirmationModalConfig } from '#frontend/types/index.js';
import type { GestureConfig, PoseConfig } from '#shared/index.js';

const preferenceService = new PreferenceService();

interface OverlayState {
  id: string;
}

// Internal helper function to reset all modal data states.
const clearAllModalData = (draft: UiSlice) => {
    draft.docsModalKey = null;
    draft.confirmationModalConfig = null;
    draft.gestureFormConfig = null;
};

export interface UiSlice {
  // User preferences
  numHandsPreference: number;
  processingResolutionWidthPreference: number;
  languagePreference: string;
  themePreference: ThemePreference;
  showHandLandmarks: boolean;
  showPoseLandmarks: boolean;
  
  // UI State
  isDashboardActive: boolean;
  isHistorySidebarOpen: boolean;
  isVideoExpanded: boolean;
  isVideoVisible: boolean;
  activeOverlays: OverlayState[];

  // Data for overlays, now decoupled from visibility
  confirmationModalConfig: ConfirmationModalConfig | null;
  docsModalKey: string | null;
  gestureFormConfig: GestureConfig | PoseConfig | null;

  // Actions
  actions: {
    setLocalPreference: <K extends PreferenceKey>(key: K, value: PreferenceValue<K>) => void;
    toggleDashboard: (isActive?: boolean) => void;
    toggleHistorySidebar: (isOpen?: boolean) => void;
    openOverlay: (id: string, payload?: unknown) => void;
    closeCurrentOverlay: () => void;
    toggleVideoExpanded: () => void;
    toggleVideoVisibility: (isVisible?: boolean) => void;
  };
}

export const createUiSlice: StateCreator<UiSlice, [], [], UiSlice> = (set) => ({
  // User preferences
  numHandsPreference: preferenceService.get('numHandsPreference'),
  processingResolutionWidthPreference: preferenceService.get('processingResolutionWidthPreference'),
  languagePreference: preferenceService.get('languagePreference'),
  themePreference: preferenceService.get('themePreference'),
  showHandLandmarks: preferenceService.get('showHandLandmarks'),
  showPoseLandmarks: preferenceService.get('showPoseLandmarks'),

  // UI State
  isDashboardActive: false,
  isHistorySidebarOpen: false,
  isVideoExpanded: false,
  isVideoVisible: true,
  activeOverlays: [],
  confirmationModalConfig: null,
  docsModalKey: null,
  gestureFormConfig: null,
  
  // Actions
  actions: {
    setLocalPreference: (key, value) => {
      preferenceService.set(key, value);
      set({ [key]: value } as unknown as Pick<UiSlice, typeof key>);
    },
    toggleDashboard: (isActive) => set(state => ({ isDashboardActive: isActive ?? !state.isDashboardActive })),
    toggleHistorySidebar: (isOpen) => set(state => ({ isHistorySidebarOpen: isOpen ?? !state.isHistorySidebarOpen })),
    
    openOverlay: (id, payload) => set(produce((draft: UiSlice) => {
        if (draft.activeOverlays.some(o => o.id === id)) return;

        // Atomically clear old data, set new data, then show the overlay.
        clearAllModalData(draft);

        if (id === 'docs' && typeof payload === 'string') draft.docsModalKey = payload;
        if (id === 'confirmation') draft.confirmationModalConfig = payload as ConfirmationModalConfig;
        if (id === 'gestureForm') draft.gestureFormConfig = payload as GestureConfig | PoseConfig | null;

        draft.activeOverlays.push({ id });
    })),
    
    closeCurrentOverlay: () => set(produce((draft: UiSlice) => {
        draft.activeOverlays.pop();
        // Always clear all modal data when the top-most modal is closed.
        clearAllModalData(draft);
    })),

    toggleVideoExpanded: () => set(produce((draft: UiSlice) => {
        const expanding = !draft.isVideoExpanded;
        draft.isVideoExpanded = expanding;
        if (expanding) draft.isVideoVisible = true;
    })),
    
    toggleVideoVisibility: (isVisible) => set(state => ({ isVideoVisible: isVisible ?? !state.isVideoVisible })),
  }
});