/**
 * SleepHistoryService.js — Persistent local storage for sleep history.
 *
 * DESIGN:
 *  - Uses AsyncStorage (same pattern as LocalHistoryService, AdherenceTracker).
 *  - Stores normalized sleep records keyed by RMHEALTH_SLEEP_HISTORY_V1.
 *  - Deduplicates on save using stable IDs from sleepUtils.
 *  - Retains up to 90 days of history.
 *  - Health Connect may not always return data — history preserves past reads.
 *  - Sleep data is CONTEXTUAL/PREVENTIVE only. NEVER diagnostic.
 *
 * © 2025-2026 Morales Zepeda Raúl | INDAUTOR 03-2025-070109072500-01
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { mergeSleepHistory } from '../utils/sleepUtils';

const SLEEP_HISTORY_KEY = '@rmhealth/sleep_history_v1';
const MAX_DAYS = 90;

export const SleepHistoryService = {
  /**
   * Load all persisted sleep records.
   * @returns {Promise<Array>} Array of normalized sleep records.
   */
  async loadHistory() {
    try {
      const raw = await AsyncStorage.getItem(SLEEP_HISTORY_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      console.error('[SleepHistory] Load failed:', e?.message || e);
      return [];
    }
  },

  /**
   * Save new sleep records, merging with existing history.
   * Deduplicates and trims to MAX_DAYS.
   * @param {Array} newRecords - Normalized sleep records from Health Connect.
   * @returns {Promise<Array>} The merged, deduped history.
   */
  async saveRecords(newRecords) {
    try {
      if (!newRecords || newRecords.length === 0) {
        return await this.loadHistory();
      }
      const existing = await this.loadHistory();
      const merged = mergeSleepHistory(existing, newRecords, MAX_DAYS);
      await AsyncStorage.setItem(SLEEP_HISTORY_KEY, JSON.stringify(merged));
      console.log('[SleepHistory] Saved:', merged.length, 'records (new:', newRecords.length, ')');
      return merged;
    } catch (e) {
      console.error('[SleepHistory] Save failed:', e?.message || e);
      return await this.loadHistory();
    }
  },

  /**
   * Replace entire history (used after merge operations).
   * @param {Array} records - Complete history to store.
   */
  async replaceHistory(records) {
    try {
      const trimmed = records.slice(0, MAX_DAYS * 3); // generous limit
      await AsyncStorage.setItem(SLEEP_HISTORY_KEY, JSON.stringify(trimmed));
    } catch (e) {
      console.error('[SleepHistory] Replace failed:', e?.message || e);
    }
  },

  /**
   * Get the count of stored records.
   */
  async getCount() {
    const history = await this.loadHistory();
    return history.length;
  },
};
