/**
 * useSleepData.js — Hook for sleep/rest context from Health Connect.
 *
 * DESIGN:
 *  - Only active when SLEEP_MODE_ENABLED=true AND HEALTH_CONNECT_ENABLED=true.
 *  - Polls every 5 minutes (sleep data changes infrequently).
 *  - Returns null when disabled — consuming components must handle null gracefully.
 *  - Sleep data is CONTEXTUAL/PREVENTIVE only. It NEVER modifies clinical
 *    severity, triggers emergency alerts, or overrides MedicalEngine/CJM.
 *
 * © 2025-2026 Morales Zepeda Raúl | INDAUTOR 03-2025-070109072500-01
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { FEATURES } from '../config/features';
import { getSleepData } from '../services/HealthConnectService';

// Sleep data changes slowly — 5 minute polling is sufficient
const SLEEP_POLL_INTERVAL_MS = 5 * 60 * 1000;

export function useSleepData() {
  const [sleepData, setSleepData]   = useState(null);
  const [isLoading, setIsLoading]   = useState(false);
  const [lastSync, setLastSync]     = useState(null);
  const [error, setError]           = useState(null);

  const intervalRef  = useRef(null);
  const isMountedRef = useRef(true);

  // Guard: both flags must be enabled
  const isEnabled = FEATURES.SLEEP_MODE_ENABLED && FEATURES.HEALTH_CONNECT_ENABLED;

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

  // Start polling when enabled
  useEffect(() => {
    isMountedRef.current = true;

    if (!isEnabled) {
      // Feature disabled — ensure clean state
      setSleepData(null);
      setLastSync(null);
      setError(null);
      return;
    }

    // Initial fetch
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
  }, [isEnabled, refresh]);

  return {
    sleepData,    // null when disabled or no data
    isLoading,
    lastSync,
    error,
    refresh,      // manual refresh trigger
    isEnabled,    // convenience for conditional rendering
  };
}
