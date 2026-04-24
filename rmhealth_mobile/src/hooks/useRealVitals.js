import { useState, useEffect, useRef, useCallback } from 'react';
import { Platform, AppState } from 'react-native';
import { apiService } from '../api/client';
import {
  initHealthConnect,
  requestHealthPermissions,
  readAllVitals,
} from '../services/healthConnect';

/**
 * Custom hook that reads REAL vital signs from Health Connect.
 *
 * Falls back to null values (not simulated data) when Health Connect
 * is unavailable. The UI should show a "No data — connect your watch"
 * message instead of fake numbers.
 *
 * @param {string} patientId - Unique patient identifier.
 * @param {number} intervalMs - Polling interval in milliseconds (default: 10s).
 * @returns {object} Current vitals, connection status, and error state.
 */
export const useRealVitals = (patientId, intervalMs = 10000) => {
  const [vitals, setVitals] = useState({
    heartRate: null,
    spo2: null,
    systolic: null,
    diastolic: null,
    glucose: null,
    temperature: null, // Not available via Health Connect
    lastSync: null,
    isSyncing: false,
    isConnected: false,
    hasPermissions: false,
    error: null,
    source: 'none',
  });

  const timerRef = useRef(null);
  const appState = useRef(AppState.currentState);

  /**
   * Initialize Health Connect and request permissions.
   * Only runs on Android — returns false on iOS.
   */
  const setup = useCallback(async () => {
    if (Platform.OS !== 'android') {
      setVitals(prev => ({
        ...prev,
        error: 'Health Connect is Android only. iOS support coming soon.',
        source: 'unsupported_platform',
      }));
      return false;
    }

    try {
      const initialized = await initHealthConnect();
      if (!initialized) {
        setVitals(prev => ({
          ...prev,
          error: 'Health Connect not available. Install the Health Connect app.',
          isConnected: false,
        }));
        return false;
      }

      const permitted = await requestHealthPermissions();
      setVitals(prev => ({
        ...prev,
        isConnected: true,
        hasPermissions: permitted,
        error: permitted ? null : 'Some permissions were denied.',
      }));
      return permitted;
    } catch (error) {
      setVitals(prev => ({
        ...prev,
        error: `Setup failed: ${error.message}`,
        isConnected: false,
      }));
      return false;
    }
  }, []);

  /**
   * Read vitals from Health Connect and sync to API.
   */
  const pollVitals = useCallback(async () => {
    setVitals(prev => ({ ...prev, isSyncing: true }));

    try {
      const data = await readAllVitals();

      // Only send to API if we got real data
      if (data.hasRealData) {
        const payload = {
          usuario_id: patientId,
          oxigeno: data.spo2,
          presion_sistolica: data.systolic,
          presion_diastolica: data.diastolic,
          frecuencia_cardiaca: data.heartRate,
          temperatura: data.temperature || 36.6, // HC doesn't provide temp
          ubicacion_lat: null, // Will be filled by GPS module
          ubicacion_lon: null,
          dispositivo_id: 'samsung_galaxy_watch',
          emergencia_detectada: false,
        };

        await apiService.sendVitals(payload);
      }

      setVitals(prev => ({
        ...prev,
        heartRate: data.heartRate,
        spo2: data.spo2,
        systolic: data.systolic,
        diastolic: data.diastolic,
        glucose: data.glucose,
        lastSync: new Date().toLocaleTimeString(),
        isSyncing: false,
        error: null,
        source: data.hasRealData ? 'health_connect' : 'no_data',
      }));
    } catch (error) {
      setVitals(prev => ({
        ...prev,
        isSyncing: false,
        error: `Sync error: ${error.message}`,
      }));
    }
  }, [patientId]);

  // Setup on mount
  useEffect(() => {
    let isMounted = true;

    const init = async () => {
      const ready = await setup();
      if (ready && isMounted) {
        await pollVitals();
        timerRef.current = setInterval(pollVitals, intervalMs);
      }
    };

    init();

    // Pause polling when app goes to background
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active' && vitals.isConnected) {
        pollVitals();
      }
    });

    return () => {
      isMounted = false;
      if (timerRef.current) clearInterval(timerRef.current);
      subscription?.remove();
    };
  }, [setup, pollVitals, intervalMs]);

  return vitals;
};
