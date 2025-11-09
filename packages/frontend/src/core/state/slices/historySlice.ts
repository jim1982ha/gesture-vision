/* FILE: packages/frontend/src/core/state/slices/historySlice.ts */
import type { StateCreator } from 'zustand';
import { produce } from 'immer';
import { MAX_HISTORY_ITEMS } from '#frontend/constants/index.js';
import type { HistoryEntry } from '#frontend/types/index.js';
import type { ActionResultPayload } from '#shared/index.js';
import { pubsub, UI_EVENTS } from '#shared/index.js';

export interface HistorySlice {
  historyEntries: HistoryEntry[];
  actions: {
    addHistoryEntry: (entry: Partial<HistoryEntry>) => void;
    handleBackendActionResult: (result: ActionResultPayload) => void;
    clearHistory: () => void;
  };
}

export const createHistorySlice: StateCreator<HistorySlice, [], [], HistorySlice> = (set, get) => ({
  historyEntries: [],
  actions: {
    addHistoryEntry: (entry) => {
      if (!entry?.gesture) return;
      const newEntry: HistoryEntry = {
        id: entry.id || `${Date.now()}-${Math.random().toString(16).substring(2)}`,
        timestamp: entry.timestamp instanceof Date ? entry.timestamp : new Date(entry.timestamp || Date.now()),
        gesture: entry.gesture,
        actionType: entry.actionType || 'none',
        gestureCategory: entry.gestureCategory || 'UNKNOWN',
        success: entry.success,
        reason: entry.reason || (entry.actionType !== 'none' ? 'AWAITING_RESULT' : null),
        details: entry.details,
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
      let entryUpdated = false;
      const currentHistory = get().historyEntries;

      const newHistory = currentHistory.map(entry => {
        if (!entryUpdated && entry.gesture === result.gestureName && entry.actionType === result.pluginId && entry.reason === 'AWAITING_RESULT') {
          entryUpdated = true;
          return { ...entry, success: result.success, reason: result.message || (result.success ? 'OK' : 'FAILED') };
        }
        return entry;
      });

      if (entryUpdated) {
        set({ historyEntries: newHistory });
      }
      
      pubsub.publish(UI_EVENTS.ACTION_RESULT_RECEIVED, result);
    },

    clearHistory: () => set({ historyEntries: [] }),
  }
});