/**
 * useWatchData.js — STUB temporal
 * Health Connect deshabilitado hasta estabilizar la integración.
 * Reactivar importando desde HealthConnectService cuando el
 * módulo nativo esté confirmado estable.
 *
 * © 2025-2026 Morales Zepeda Raúl | INDAUTOR 03-2025-070109072500-01
 */

/**
 * @returns {{ watchData: null, isWatchAvailable: false,
 *             permissionsGranted: false, lastSync: null,
 *             refreshWatchData: () => Promise<void> }}
 */
export function useWatchData() {
  return {
    watchData:          null,
    isWatchAvailable:   false,
    permissionsGranted: false,
    lastSync:           null,
    refreshWatchData:   async () => {},
  };
}
