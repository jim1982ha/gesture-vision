/* FILE: packages/frontend/src/core/state/slices/uiSlice.ts */
import type { StateCreator } from 'zustand';
import { produce } from 'immer';
import { PreferenceService, type PreferenceKey, type PreferenceValue } from '#frontend/services/preference.service.js';
import type { ThemePreference, ConfirmationModalConfig } from '#frontend/types/index.js';

const preferenceService = new PreferenceService();

export interface UiSlice {
  // User preferences
  numHandsPreference: number;
  processingResolutionWidthPreference: number;
  languagePreference: string;
  themePreference: ThemePreference;
  showHandLandmarks: boolean;
  showPoseLandmarks: boolean;
  
  // UI State
  isSettingsModalOpen: boolean;
  isCameraSelectModalOpen: boolean;
  isDocsModalOpen: boolean;
  isDashboardActive: boolean;
  isHistorySidebarOpen: boolean;
  isGestureSettingsSidebarOpen: boolean;
  editingGestureConfigName: string | null;
  confirmationModalConfig: ConfirmationModalConfig | null;
  docsModalKey: string | null;
  isVideoExpanded: boolean;
  isVideoVisible: boolean;
  modalStack: string[];

  // Actions
  actions: {
    setLocalPreference: <K extends PreferenceKey>(key: K, value: PreferenceValue<K>) => void;
    toggleSettingsModal: (isOpen?: boolean) => void;
    toggleCameraSelectModal: (isOpen?: boolean) => void;
    toggleDocsModal: (isOpen?: boolean, docKey?: string) => void;
    toggleDashboard: (isActive?: boolean) => void;
    toggleHistorySidebar: (isOpen?: boolean) => void;
    toggleGestureSettingsSidebar: (isOpen?: boolean, editingConfigName?: string | null) => void;
    showConfirmationModal: (config: ConfirmationModalConfig) => void;
    hideConfirmationModal: () => void;
    toggleVideoExpanded: () => void;
    toggleVideoVisibility: (isVisible?: boolean) => void;
    pushToModalStack: (id: string) => void;
    removeFromModalStack: (id: string) => void;
  };
}

export const createUiSlice: StateCreator<UiSlice, [], [], UiSlice> = (set, get) => ({
  // User preferences with initial values from PreferenceService
  numHandsPreference: preferenceService.get('numHandsPreference'),
  processingResolutionWidthPreference: preferenceService.get('processingResolutionWidthPreference'),
  languagePreference: preferenceService.get('languagePreference'),
  themePreference: preferenceService.get('themePreference'),
  showHandLandmarks: preferenceService.get('showHandLandmarks'),
  showPoseLandmarks: preferenceService.get('showPoseLandmarks'),

  // UI State
  isSettingsModalOpen: false,
  isCameraSelectModalOpen: false,
  isDocsModalOpen: false,
  isDashboardActive: false,
  isHistorySidebarOpen: false,
  isGestureSettingsSidebarOpen: false,
  editingGestureConfigName: null,
  confirmationModalConfig: null,
  docsModalKey: null,
  isVideoExpanded: false,
  isVideoVisible: true,
  modalStack: [],
  
  // Actions
  actions: {
    setLocalPreference: (key, value) => {
      preferenceService.set(key, value);
      set({ [key]: value } as unknown as Pick<UiSlice, typeof key>);
    },
    pushToModalStack: (id) => set(produce((draft: UiSlice) => {
      if (!draft.modalStack.includes(id)) draft.modalStack.push(id);
    })),
    removeFromModalStack: (id) => set(produce((draft: UiSlice) => {
      draft.modalStack = draft.modalStack.filter(item => item !== id);
    })),
    toggleSettingsModal: (isOpen) => {
      const newIsOpen = isOpen ?? !get().isSettingsModalOpen;
      if (newIsOpen) get().actions.pushToModalStack('settings');
      else get().actions.removeFromModalStack('settings');
      set({ isSettingsModalOpen: newIsOpen });
    },
    toggleCameraSelectModal: (isOpen) => {
      const newIsOpen = isOpen ?? !get().isCameraSelectModalOpen;
      if (newIsOpen) get().actions.pushToModalStack('cameraSelect');
      else get().actions.removeFromModalStack('cameraSelect');
      set({ isCameraSelectModalOpen: newIsOpen });
    },
    toggleDocsModal: (isOpen, docKey) => {
      const newIsOpen = isOpen ?? !get().isDocsModalOpen;
      if (newIsOpen) get().actions.pushToModalStack('docs');
      else get().actions.removeFromModalStack('docs');
      set({ isDocsModalOpen: newIsOpen, docsModalKey: newIsOpen ? (docKey || 'ABOUT') : null });
    },
    toggleDashboard: (isActive) => set(state => ({ isDashboardActive: isActive ?? !state.isDashboardActive })),
    toggleHistorySidebar: (isOpen) => set(state => ({ isHistorySidebarOpen: isOpen ?? !state.isHistorySidebarOpen })),
    toggleGestureSettingsSidebar: (isOpen, editingConfigName = null) => set(state => {
        const reallyIsOpen = isOpen ?? !state.isGestureSettingsSidebarOpen;
        return { 
            isGestureSettingsSidebarOpen: reallyIsOpen,
            editingGestureConfigName: reallyIsOpen ? (editingConfigName || null) : null
        };
    }),
    showConfirmationModal: (config) => {
      get().actions.pushToModalStack('confirmation');
      set({ confirmationModalConfig: config });
    },
    hideConfirmationModal: () => {
      get().actions.removeFromModalStack('confirmation');
      set({ confirmationModalConfig: null });
    },
    toggleVideoExpanded: () => set(produce((draft: UiSlice) => {
        const expanding = !draft.isVideoExpanded;
        draft.isVideoExpanded = expanding;
        if (expanding) {
            draft.isVideoVisible = true;
        }
    })),
    toggleVideoVisibility: (isVisible) => set(state => ({ isVideoVisible: isVisible ?? !state.isVideoVisible })),
  }
});