/* FILE: frontend/src/core/state/slices/uiSlice.ts */
import type { StateCreator } from 'zustand';
import { produce } from 'immer';
import { PreferenceService, type PreferenceKey, type PreferenceValue } from '#frontend/services/preference.service.js';
import type { ThemePreference, ConfirmationModalConfig } from '#frontend/types/index.js';
import type { EnrichedGestureConfig } from '#shared/index.js';

const preferenceService = new PreferenceService();

interface OverlayState {
  id: string;
}

const clearAllModalData = (draft: UiSlice) => {
    draft.docsModalKey = null;
    draft.confirmationModalConfig = null;
    draft.gestureFormConfig = null;
};

export interface UiSlice {
  numHandsPreference: number;
  processingResolutionWidthPreference: number;
  languagePreference: string;
  themePreference: ThemePreference;
  showHandLandmarks: boolean;
  showPoseLandmarks: boolean;
  
  isDashboardActive: boolean;
  isHistorySidebarOpen: boolean;
  isVideoExpanded: boolean;
  isVideoVisible: boolean;
  isMobile: boolean;
  activeOverlays: OverlayState[];

  confirmationModalConfig: ConfirmationModalConfig | null;
  docsModalKey: string | null;
  gestureFormConfig: EnrichedGestureConfig | null;

  actions: {
    setLocalPreference: <K extends PreferenceKey>(key: K, value: PreferenceValue<K>) => void;
    toggleDashboard: (isActive?: boolean) => void;
    toggleHistorySidebar: (isOpen?: boolean) => void;
    openOverlay: (id: string, payload?: unknown) => void;
    closeCurrentOverlay: () => void;
    toggleVideoExpanded: () => void;
    toggleVideoVisibility: (isVisible?: boolean) => void;
    setDocsModalKey: (key: string | null) => void;
  };
}

export const createUiSlice: StateCreator<UiSlice, [], [], UiSlice> = (set) => ({
  numHandsPreference: preferenceService.get('numHandsPreference'),
  processingResolutionWidthPreference: preferenceService.get('processingResolutionWidthPreference'),
  languagePreference: preferenceService.get('languagePreference'),
  themePreference: preferenceService.get('themePreference'),
  showHandLandmarks: preferenceService.get('showHandLandmarks'),
  showPoseLandmarks: preferenceService.get('showPoseLandmarks'),

  isDashboardActive: false,
  isHistorySidebarOpen: false,
  isVideoExpanded: false,
  isVideoVisible: true,
  isMobile: window.matchMedia('(max-width: 1023px)').matches,
  activeOverlays: [],
  confirmationModalConfig: null,
  docsModalKey: null,
  gestureFormConfig: null,
  
  actions: {
    setLocalPreference: (key, value) => {
      preferenceService.set(key, value);
      set({ [key]: value } as unknown as Pick<UiSlice, typeof key>);
    },
    toggleDashboard: (isActive) => set(state => ({ isDashboardActive: isActive ?? !state.isDashboardActive })),
    toggleHistorySidebar: (isOpen) => set(state => ({ isHistorySidebarOpen: isOpen ?? !state.isHistorySidebarOpen })),
    
    openOverlay: (id, payload) => set(produce((draft: UiSlice) => {
        if (draft.activeOverlays.some(o => o.id === id)) return;
        clearAllModalData(draft);

        if (id === 'docs' && typeof payload === 'string') draft.docsModalKey = payload;
        if (id === 'confirmation') draft.confirmationModalConfig = payload as ConfirmationModalConfig;
        if (id === 'gestureForm') draft.gestureFormConfig = payload as EnrichedGestureConfig | null;

        draft.activeOverlays.push({ id });
    })),
    
    closeCurrentOverlay: () => set(produce((draft: UiSlice) => {
        draft.activeOverlays.pop();
        clearAllModalData(draft);
    })),

    toggleVideoExpanded: () => set(produce((draft: UiSlice) => {
        draft.isVideoExpanded = !draft.isVideoExpanded;
        if (draft.isVideoExpanded) draft.isVideoVisible = true;
    })),
    
    toggleVideoVisibility: (isVisible) => set(state => ({ isVideoVisible: isVisible ?? !state.isVideoVisible })),

    setDocsModalKey: (key) => set({ docsModalKey: key }),
  }
});