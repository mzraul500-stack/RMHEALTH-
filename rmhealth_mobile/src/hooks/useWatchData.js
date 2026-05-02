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
  requestWatchPermissions,
  getLatestWatchData,
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
      // 1. Solicitar permisos (solo si es la primera vez)
      const granted = await requestWatchPermissions();
      setPermissionsGranted(granted);
      setIsWatchAvailable(granted);

      if (!granted) {
        setError('Permisos de Health Connect no concedidos. Abre Health Connect y autoriza RMHealth.');
        return;
      }

      // 2. Leer FC (y SpO2/Temp si disponibles)
      const data = await getLatestWatchData();
      if (!data) {
        setError('Sin datos recientes del reloj. Asegúrate de que el Galaxy Watch 8 esté sincronizado con Samsung Health.');
        return;
      }

      // 3. Actualizar estado — HomeScreen reacciona vía useEffect(watchData)
      setWatchData(data);
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
