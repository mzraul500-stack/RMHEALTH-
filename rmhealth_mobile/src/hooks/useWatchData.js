/**
 * useWatchData.js — Monitoreo EN TIEMPO REAL de wearables vía Health Connect.
 *
 * DISEÑO:
 *  - Polling automático cada 30 segundos.
 *  - Los permisos se solicitan UNA VEZ al primer montaje (lazy).
 *  - refreshWatchData() también disponible para lectura manual inmediata.
 *  - Si Health Connect no está disponible, opera silenciosamente sin errores.
 *
 * © 2025-2026 Morales Zepeda Raúl | INDAUTOR 03-2025-070109072500-01
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { FEATURES } from '../config/features';
import {
  requestWatchPermissions,
  getLatestWatchData,
} from '../services/HealthConnectService';

// Intervalo de polling en milisegundos (30 segundos)
const POLL_INTERVAL_MS = 30000;

export function useWatchData() {
  const [watchData, setWatchData]               = useState(null);
  const [isWatchAvailable, setIsWatchAvailable] = useState(false);
  const [permissionsGranted, setPermissionsGranted] = useState(false);
  const [lastSync, setLastSync]                 = useState(null);
  const [isLoading, setIsLoading]               = useState(false);
  const [error, setError]                       = useState(null);

  const intervalRef     = useRef(null);
  const permGrantedRef  = useRef(false);
  const isMountedRef    = useRef(true);

  // ── Función interna de lectura ──────────────────────────────────
  const fetchWatchData = useCallback(async (isManual = false) => {
    // Feature flag check dentro de la función, no como early return del hook
    if (!FEATURES.HEALTH_CONNECT_ENABLED) return;

    if (isManual) {
      setIsLoading(true);
      setError(null);
    }

    try {
      // Si aún no tenemos permisos, solicitarlos
      if (!permGrantedRef.current) {
        console.log('[useWatchData] Solicitando permisos HC...');
        const permissionResult = await requestWatchPermissions();

        if (typeof permissionResult === 'object' && permissionResult !== null) {
          console.log('[useWatchData] Permisos denegados/error:', JSON.stringify(permissionResult));
          setIsWatchAvailable(false);
          setPermissionsGranted(false);
          if (isManual) {
            if (permissionResult.reason === 'SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED') {
              setError('Health Connect requiere actualización.');
            } else if (permissionResult.reason === 'NO_MODULE' || permissionResult.reason === 'INITIALIZE_ERROR') {
              setError('Health Connect no disponible en este dispositivo.');
            } else {
              setError(`Error HC SDK: ${permissionResult.reason} (Status: ${permissionResult.status})`);
            }
          }
          return;
        }

        const granted = permissionResult;
        permGrantedRef.current = granted;
        setPermissionsGranted(granted);
        setIsWatchAvailable(granted);
        console.log('[useWatchData] Permisos HC:', granted ? '✅ CONCEDIDOS' : '❌ DENEGADOS');

        if (!granted) {
          if (isManual) {
            setError('RMHealth necesita permiso para leer los datos seleccionados desde Health Connect.');
            // Importar dinámicamente para evitar ciclos
            const { openHCSettings } = require('../services/HealthConnectService');
            setTimeout(() => {
              openHCSettings();
            }, 1500);
          }
          return;
        }
      }

      // Leer TODOS los datos disponibles (FC, SpO2, Temp, BP)
      const result = await getLatestWatchData();

      if (!isMountedRef.current) return;

      if (result === null) {
        console.log('[useWatchData] getLatestWatchData retornó NULL');
        if (isManual) {
          setError('No se encontraron datos recientes en Health Connect. Verifica que tu reloj o app de salud esté sincronizando datos.');
        }
        return;
      }

      console.log('[useWatchData] ✅ Datos recibidos: FC=', result.fc,
        'SpO2=', result.spo2, 'TAS=', result.tas, 'TAD=', result.tad);

      // Actualizar estado
      setWatchData(result);
      setLastSync(new Date().toISOString());
      setIsWatchAvailable(true);
      setError(null);
    } catch (e) {
      console.warn('[useWatchData] Error:', e?.message || e);
      if (isManual) setError('Error al leer Health Connect.');
    } finally {
      if (isManual && isMountedRef.current) setIsLoading(false);
    }
  }, []);

  // ── Lectura manual (botón) ──────────────────────────────────────
  const refreshWatchData = useCallback(async () => {
    await fetchWatchData(true);
  }, [fetchWatchData]);

  // ── Lifecycle: polling automático simple ────────────────────────
  useEffect(() => {
    isMountedRef.current = true;
    console.log('[useWatchData] ▶ Hook montado. HEALTH_CONNECT_ENABLED=', FEATURES.HEALTH_CONNECT_ENABLED);

    if (!FEATURES.HEALTH_CONNECT_ENABLED) {
      console.log('[useWatchData] ⛔ Feature deshabilitada, no inicia polling');
      return;
    }

    // Primera lectura inmediata
    console.log('[useWatchData] ▶ Iniciando polling cada 30s...');
    fetchWatchData(false);

    // Polling cada 30 segundos
    intervalRef.current = setInterval(() => {
      fetchWatchData(false);
    }, POLL_INTERVAL_MS);

    return () => {
      console.log('[useWatchData] ⏹ Desmontando hook, limpiando intervalo');
      isMountedRef.current = false;
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [fetchWatchData]);

  return {
    watchData,
    isWatchAvailable,
    permissionsGranted,
    lastSync,
    isLoading,
    error,
    refreshWatchData,
  };
}
