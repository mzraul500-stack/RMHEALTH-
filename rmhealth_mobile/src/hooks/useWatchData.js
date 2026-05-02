/**
 * useWatchData.js — Integración real Galaxy Watch 8 vía Health Connect.
 *
 * DISEÑO DE SEGURIDAD:
 *  - NO hay polling automático al montar el componente.
 *  - refreshWatchData() es la ÚNICA entrada de datos del reloj.
 *  - Debe ser llamada explícitamente por el botón del usuario.
 *  - Si Health Connect no está disponible, devuelve null silenciosamente.
 *  - Los permisos se solicitan en el momento del primer refresh (lazy).
 *
 * © 2025-2026 Morales Zepeda Raúl | INDAUTOR 03-2025-070109072500-01
 */

import { useState, useCallback } from 'react';
import { FEATURES } from '../config/features';
import {
  requestHeartRatePermission,
  getLatestHeartRate,
} from '../services/HealthConnectService';


/**
 * @returns {{
 *   watchData: import('../services/HealthConnectService').WatchData | null,
 *   isWatchAvailable: boolean,
 *   permissionsGranted: boolean,
 *   lastSync: string | null,
 *   isLoading: boolean,
 *   error: string | null,
 *   refreshWatchData: () => Promise<void>
 * }}
 */
export function useWatchData() {
  const [watchData, setWatchData]               = useState(null);
  const [isWatchAvailable, setIsWatchAvailable] = useState(false);
  const [permissionsGranted, setPermissionsGranted] = useState(false);
  const [lastSync, setLastSync]                 = useState(null);
  const [isLoading, setIsLoading]               = useState(false);
  const [error, setError]                       = useState(null);

  // Si la feature está deshabilitada, devolver stub sin imports nativos.
  if (!FEATURES.HEALTH_CONNECT_ENABLED) {
    return {
      watchData: null, isWatchAvailable: false,
      permissionsGranted: false, lastSync: null,
      isLoading: false, error: null,
      refreshWatchData: async () => {},
    };
  }

  /**
   * refreshWatchData — Llamar SOLO desde interacción explícita del usuario.
   * 1. Solicita permisos si aún no se han concedido (lazy permission).
   * 2. Lee los datos más recientes del reloj.
   * 3. Actualiza el estado — HomeScreen reacciona vía useEffect.
   */
  const refreshWatchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      // 1. Verificar disponibilidad + solicitar SOLO permiso Heart Rate
      const granted = await requestHeartRatePermission();
      setPermissionsGranted(granted);
      setIsWatchAvailable(granted);

      if (!granted) {
        setError('Permiso de frecuencia cardíaca no concedido o sin datos disponibles.');
        return;
      }

      // 2. Leer SOLO Frecuencia Cardíaca (no SpO2, no Temp, no BP)
      const fc = await getLatestHeartRate();
      if (fc === null) {
        setError('Sin datos recientes del reloj. Asegúrate de que el Galaxy Watch 8 esté sincronizado con Samsung Health.');
        return;
      }

      // 3. Actualizar estado con solo FC — HomeScreen lo carga en campo FC
      setWatchData({ source: 'watch', fc, timestamp: new Date().toISOString(), deviceName: 'Galaxy Watch 8' });
      setLastSync(new Date().toISOString());
    } catch (e) {
      console.warn('[useWatchData] Error:', e);
      setError('Error al leer Health Connect. Intenta de nuevo.');
    } finally {
      setIsLoading(false);
    }
  }, []);


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
