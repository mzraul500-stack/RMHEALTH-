/**
 * useWatchData.js — Monitoreo EN TIEMPO REAL de wearables vía Health Connect.
 *
 * DISEÑO:
 *  - Polling automático cada 15 segundos (lectura directa, sin re-verificar permisos).
 *  - Los permisos se solicitan UNA VEZ al primer botón manual.
 *  - refreshWatchData() disponible para lectura manual inmediata.
 *  - Si Health Connect no está disponible, opera silenciosamente sin errores.
 *
 * © 2025-2026 Morales Zepeda Raúl | INDAUTOR 03-2025-070109072500-01
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { FEATURES } from '../config/features';
import {
  requestWatchPermissions,
  getLatestWatchData,
  openHCSettings,
} from '../services/HealthConnectService';

// Intervalo de polling en milisegundos (15 segundos para mayor responsividad)
const POLL_INTERVAL_MS = 15000;

export function useWatchData() {
  const [watchData, setWatchData]               = useState(null);
  const [isWatchAvailable, setIsWatchAvailable] = useState(false);
  const [permissionsGranted, setPermissionsGranted] = useState(false);
  const [lastSync, setLastSync]                 = useState(null);
  const [isLoading, setIsLoading]               = useState(false);
  const [error, setError]                       = useState(null);

  const intervalRef    = useRef(null);
  const isMountedRef   = useRef(true);
  const pollCountRef   = useRef(0);

  // ── Lectura directa (polling automático) ──────────────────────
  // NO verifica permisos — simplemente intenta leer.
  // Si no hay permisos, getLatestWatchData() devuelve null sin crashear.
  const pollData = useCallback(async () => {
    if (!FEATURES.HEALTH_CONNECT_ENABLED) return;

    pollCountRef.current += 1;
    const pollNum = pollCountRef.current;

    try {
      console.log(`[useWatchData] 🔄 Poll #${pollNum} iniciando...`);
      const result = await getLatestWatchData();

      if (!isMountedRef.current) return;

      if (result === null) {
        console.log(`[useWatchData] Poll #${pollNum}: sin datos`);
        return;
      }

      console.log(`[useWatchData] Poll #${pollNum} ✅ FC=${result.fc} SpO2=${result.spo2} TAS=${result.tas} TAD=${result.tad}`);

      // Siempre actualizar — nuevo objeto = React detecta cambio
      setWatchData({ ...result, _pollId: pollNum });
      setLastSync(new Date().toISOString());
      setIsWatchAvailable(true);
      setPermissionsGranted(true);
      setError(null);
    } catch (e) {
      console.log(`[useWatchData] Poll #${pollNum} error:`, e?.message || e);
      // Silencioso — no molestar al usuario con errores de polling
    }
  }, []);

  // ── Lectura manual (botón) ────────────────────────────────────
  // SÍ verifica/solicita permisos — el usuario hizo click explícito.
  const refreshWatchData = useCallback(async () => {
    if (!FEATURES.HEALTH_CONNECT_ENABLED) return;

    setIsLoading(true);
    setError(null);

    try {
      // Solicitar permisos (abre diálogo si no concedidos)
      console.log('[useWatchData] Lectura manual — solicitando permisos...');
      const permissionResult = await requestWatchPermissions();

      if (typeof permissionResult === 'object' && permissionResult !== null) {
        console.log('[useWatchData] HC no disponible:', JSON.stringify(permissionResult));
        setIsWatchAvailable(false);
        setPermissionsGranted(false);
        if (permissionResult.reason === 'SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED') {
          setError('Health Connect requiere actualización.');
        } else if (permissionResult.reason === 'NO_MODULE' || permissionResult.reason === 'INITIALIZE_ERROR') {
          setError('Health Connect no disponible en este dispositivo.');
        } else {
          setError(`Error HC SDK: ${permissionResult.reason} (Status: ${permissionResult.status})`);
        }
        openHCSettings();
        return;
      }

      if (!permissionResult) {
        setError('RMHealth necesita permiso para leer los datos desde Health Connect.');
        openHCSettings();
        return;
      }

      setPermissionsGranted(true);
      setIsWatchAvailable(true);

      // Leer datos
      const result = await getLatestWatchData();
      if (!isMountedRef.current) return;

      if (result === null) {
        setError('No se encontraron datos recientes en Health Connect. Verifica que tu reloj esté sincronizando datos.');
        return;
      }

      console.log('[useWatchData] ✅ Manual: FC=', result.fc, 'SpO2=', result.spo2, 'TAS=', result.tas, 'TAD=', result.tad);
      setWatchData({ ...result, _pollId: Date.now() });
      setLastSync(new Date().toISOString());
      setError(null);
    } catch (e) {
      console.warn('[useWatchData] Error manual:', e?.message || e);
      setError('Error al leer Health Connect.');
    } finally {
      if (isMountedRef.current) setIsLoading(false);
    }
  }, []);

  // ── Lifecycle: polling automático ─────────────────────────────
  useEffect(() => {
    isMountedRef.current = true;
    console.log('[useWatchData] ▶ Hook montado. HC_ENABLED=', FEATURES.HEALTH_CONNECT_ENABLED);

    if (!FEATURES.HEALTH_CONNECT_ENABLED) {
      console.log('[useWatchData] ⛔ Feature deshabilitada');
      return;
    }

    // Primera lectura inmediata (sin esperar 15s)
    console.log('[useWatchData] ▶ Primera lectura + polling cada 15s');
    pollData();

    // Polling continuo cada 15 segundos
    intervalRef.current = setInterval(pollData, POLL_INTERVAL_MS);

    return () => {
      console.log('[useWatchData] ⏹ Desmontando hook');
      isMountedRef.current = false;
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [pollData]);

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
