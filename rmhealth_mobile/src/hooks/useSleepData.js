/**
 * useSleepData.js — Hook for sleep/rest context from Health Connect.
 *
 * DESIGN:
 *  - Only active when SLEEP_MODE_ENABLED=true AND HEALTH_CONNECT_ENABLED=true.
 *  - Polls every 5 minutes (sleep data changes infrequently).
 *  - Persists history via SleepHistoryService for calendar/trend access.
 *  - Returns null when disabled — consuming components must handle null gracefully.
 *  - Sleep data is CONTEXTUAL/PREVENTIVE only. It NEVER modifies clinical
 *    severity, triggers emergency alerts, or overrides MedicalEngine/CJM.
 *
 * © 2025-2026 Morales Zepeda Raúl | INDAUTOR 03-2025-070109072500-01
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { FEATURES } from '../config/features';
import { getSleepData, getSleepHistory } from '../services/HealthConnectService';
import { SleepHistoryService } from '../services/SleepHistoryService';
import { groupSleepByDate, calculateSleepAverages } from '../utils/sleepUtils';

// Sleep data changes slowly — 5 minute polling is sufficient
const SLEEP_POLL_INTERVAL_MS = 5 * 60 * 1000;

export function useSleepData() {
  const [sleepData, setSleepData]       = useState(null);
  const [sleepHistory, setSleepHistory] = useState([]);
  const [groupedDays, setGroupedDays]   = useState([]);
  const [averages, setAverages]         = useState(null);
  const [isLoading, setIsLoading]       = useState(false);
  const [lastSync, setLastSync]         = useState(null);
  const [error, setError]               = useState(null);

  const intervalRef  = useRef(null);
  const isMountedRef = useRef(true);

  // Guard: both flags must be enabled
  const isEnabled = FEATURES.SLEEP_MODE_ENABLED && FEATURES.HEALTH_CONNECT_ENABLED;

  /**
   * Refresh current night's sleep data (24h window).
   */
  const refresh = useCallback(async () => {
    if (!isEnabled) return null;

    setIsLoading(true);
    setError(null);

    try {
      const data = await getSleepData();
      if (isMountedRef.current) {
        setSleepData(data);
        setLastSync(new Date().toISOString());
        console.log('[useSleepData] Refresh complete:', data ? `${data.totalMinutes}min` : 'no data');
      }
      return data;
    } catch (err) {
      console.warn('[useSleepData] Error:', err?.message || err);
      if (isMountedRef.current) {
        setError(err?.message || 'Sleep data unavailable');
      }
      return null;
    } finally {
      if (isMountedRef.current) setIsLoading(false);
    }
  }, [isEnabled]);

  /**
   * Load full sleep history: reads from Health Connect + merges with local persistence.
   * @param {number} days - Number of days to fetch (default 30).
   */
  const refreshHistory = useCallback(async (days = 30) => {
    if (!isEnabled) return [];

    setIsLoading(true);
    setError(null);

    try {
      // 1. Load persisted history from AsyncStorage
      const persisted = await SleepHistoryService.loadHistory();

      // 2. Read fresh data from Health Connect
      const fresh = await getSleepHistory(days);

      // 3. Merge: persisted + fresh (with dedup)
      let merged;
      if (fresh && fresh.length > 0) {
        merged = await SleepHistoryService.saveRecords(fresh);
      } else {
        merged = persisted;
      }

      if (isMountedRef.current) {
        setSleepHistory(merged);
        setGroupedDays(groupSleepByDate(merged));
        setAverages(calculateSleepAverages(merged));
        setLastSync(new Date().toISOString());
        console.log('[useSleepData] History refreshed:',
          merged.length, 'records,',
          fresh?.length || 0, 'new from HC');
      }

      return merged;
    } catch (err) {
      console.warn('[useSleepData] History error:', err?.message || err);
      if (isMountedRef.current) {
        setError(err?.message || 'Sleep history unavailable');
      }
      return [];
    } finally {
      if (isMountedRef.current) setIsLoading(false);
    }
  }, [isEnabled]);

  /**
   * Load persisted history only (no Health Connect call).
   * Used on initial mount to show cached data immediately.
   */
  const loadCachedHistory = useCallback(async () => {
    if (!isEnabled) return;
    try {
      const persisted = await SleepHistoryService.loadHistory();
      if (isMountedRef.current && persisted.length > 0) {
        setSleepHistory(persisted);
        setGroupedDays(groupSleepByDate(persisted));
        setAverages(calculateSleepAverages(persisted));
      }
    } catch (err) {
      console.warn('[useSleepData] Cache load error:', err?.message || err);
    }
  }, [isEnabled]);

  // Start polling when enabled
  useEffect(() => {
    isMountedRef.current = true;

    if (!isEnabled) {
      // Feature disabled — ensure clean state
      setSleepData(null);
      setSleepHistory([]);
      setGroupedDays([]);
      setAverages(null);
      setLastSync(null);
      setError(null);
      return;
    }

    // Load cached history immediately (fast, no HC call)
    loadCachedHistory();

    // Then fetch fresh data from Health Connect
    refresh();

    // Poll every 5 minutes
    intervalRef.current = setInterval(refresh, SLEEP_POLL_INTERVAL_MS);

    return () => {
      isMountedRef.current = false;
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isEnabled, refresh, loadCachedHistory]);

  return {
    sleepData,        // null when disabled or no data (last 24h)
    sleepHistory,     // Array of all persisted records
    groupedDays,      // Array of { date, records, totalMinutes, ... }
    averages,         // { avg_7d, avg_30d, days_with_data_7d, ... }
    isLoading,
    lastSync,
    error,
    refresh,          // manual refresh trigger (current night)
    refreshHistory,   // manual refresh trigger (full history)
    isEnabled,        // convenience for conditional rendering
  };
}
