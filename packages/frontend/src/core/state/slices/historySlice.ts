/* FILE: packages/frontend/src/core/state/slices/historySlice.ts */
import type { StateCreator } from 'zustand';
import { produce } from 'immer';
import { MAX_HISTORY_ITEMS } from '#frontend/constants/index.js';
import type { HistoryEntry } from '#frontend/types/index.js';
import { pubsub, UI_EVENTS, type ActionResultPayload, type EnrichedCustomGestureMetadata, type GestureCategoryIconType } from '#shared/index.js';

export interface HistorySlice {
  historyEntries: HistoryEntry[];
  actions: {
    addHistoryEntry: (entry: Partial<HistoryEntry>) => void;
    handleBackendActionResult: (result: ActionResultPayload) => void;
    clearHistory: () => void;
  };
}

export const createHistorySlice: StateCreator<HistorySlice & { customGestureMetadataList: EnrichedCustomGestureMetadata[] }, [], [], HistorySlice> = (set, get) => ({
  historyEntries: [],
  actions: {
    addHistoryEntry: (entry) => {
      if (!entry?.gesture) return;

      const customMetadataList = get().customGestureMetadataList;
      const displayInfo = customMetadataList.find(m => m.name === entry.gesture)?.display;
      if (!displayInfo) return;

      const newEntry: HistoryEntry = {
        id: entry.id || `${Date.now()}-${Math.random().toString(16).substring(2)}`,
        timestamp: entry.timestamp instanceof Date ? entry.timestamp : new Date(entry.timestamp || Date.now()),
        gesture: entry.gesture,
        actionType: entry.actionType || 'none',
        gestureCategory: displayInfo.category as GestureCategoryIconType,
        success: entry.success,
        reason: entry.reason || (entry.actionType !== 'none' ? 'AWAITING_RESULT' : null),
        details: entry.details,
        display: displayInfo,
      };
      set(produce((draft: HistorySlice) => {
        draft.historyEntries.unshift(newEntry);
        if (draft.historyEntries.length > MAX_HISTORY_ITEMS) {
          draft.historyEntries.pop();
        }
      }));
    },

    handleBackendActionResult: (result) => {
      if (!result?.gestureName || result.pluginId === 'none') return;
      
      const newHistory = get().historyEntries.map(entry => {
        if (entry.gesture === result.gestureName && entry.actionType === result.pluginId && entry.reason === 'AWAITING_RESULT') {
          return { ...entry, success: result.success, reason: result.message || (result.success ? 'OK' : 'FAILED') };
        }
        return entry;
      });

      if (newHistory.length > 0 && newHistory[0] !== get().historyEntries[0]) {
        set({ historyEntries: newHistory });
      }
      
      pubsub.publish(UI_EVENTS.ACTION_RESULT_RECEIVED, result);
    },

    clearHistory: () => set({ historyEntries: [] }),
  }
});