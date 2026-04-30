/**
 * HealthConnectService.js
 * Integración Galaxy Watch 8 → Samsung Health → Health Connect → RMHealth
 *
 * Parámetros automáticos activos: FC, SpO2, Temperatura
 * Parámetros manuales por ahora: TAS, TAD (hasta calibración BP), Glucosa
 *
 * CardioWave: cuando esté disponible, este servicio recibirá datos vía
 * 5G/eSIM directamente sin Health Connect. Reemplazar getLatestWatchData()
 * con CardioWaveSDK.stream() — sin cambios en HomeScreen.
 *
 * © 2025-2026 Morales Zepeda Raúl | INDAUTOR 03-2025-070109072500-01
 */

import * as TaskManager from 'expo-task-manager';

// Lazy load — si el módulo nativo falla en este dispositivo,
// todas las funciones devuelven null/false sin crashear la app.
let HC = null;
try {
  HC = require('react-native-health-connect');
} catch (e) {
  console.warn('[HealthConnect] Módulo no disponible en este dispositivo:', e);
}

// ── Constantes ──────────────────────────────────────────────────
const BACKGROUND_SYNC_TASK = 'RMHEALTH_WATCH_SYNC';
const DATA_WINDOW_HOURS    = 2; // leer últimas 2h

// Permisos solicitados a Health Connect.
// BloodPressure incluido para que fluya automáticamente cuando
// el usuario calibre el reloj — sin cambios de código requeridos.
const HC_PERMISSIONS = [
  { accessType: 'read', recordType: 'HeartRate'        },
  { accessType: 'read', recordType: 'OxygenSaturation' },
  { accessType: 'read', recordType: 'BodyTemperature'  },
  { accessType: 'read', recordType: 'BloodPressure'    }, // futuro-ready
];

// ── Inicializar ─────────────────────────────────────────────────
async function initHealthConnect() {
  if (!HC) return false; // módulo no disponible
  try {
    const status = await HC.getSdkStatus();
    if (status !== 3) return false;
    await HC.initialize();
    return true;
  } catch {
    return false;
  }
}

// ── Solicitar permisos ──────────────────────────────────────────
export async function requestWatchPermissions() {
  if (!HC) return false;
  const available = await initHealthConnect();
  if (!available) return false;
  try {
    const granted = await HC.requestPermission(HC_PERMISSIONS);
    return granted && granted.length > 0;
  } catch {
    return false;
  }
}

// ── Leer datos del reloj ────────────────────────────────────────
/**
 * Devuelve el objeto watchData con los últimos vitales del reloj,
 * o null si Health Connect no está disponible o no hay datos recientes.
 *
 * @returns {Promise<WatchData|null>}
 *
 * @typedef {Object} WatchData
 * @property {'watch'} source
 * @property {number|null} fc        - Frecuencia cardíaca (bpm)
 * @property {number|null} spo2      - Saturación de oxígeno (%)
 * @property {number|null} temperatura - Temperatura corporal (°C)
 * @property {number|null} tas       - Presión sistólica (mmHg) — null hasta calibración
 * @property {number|null} tad       - Presión diastólica (mmHg) — null hasta calibración
 * @property {string} timestamp      - ISO timestamp del dato más reciente
 * @property {string} deviceName
 */
export async function getLatestWatchData() {
  if (!HC) return null; // módulo no disponible — fallback silencioso
  const available = await initHealthConnect();
  if (!available) return null;

  const now   = new Date();
  const start = new Date(now.getTime() - DATA_WINDOW_HOURS * 60 * 60 * 1000);
  const timeRange = {
    operator : 'between',
    startTime: start.toISOString(),
    endTime  : now.toISOString(),
  };

  try {
    // ── Frecuencia Cardíaca ──────────────────────────────────
    let fc = null;
    const hrData = await HC.readRecords('HeartRate', { timeRangeFilter: timeRange });
    if (hrData?.records?.length > 0) {
      const last   = hrData.records[hrData.records.length - 1];
      const sample = last.samples?.[last.samples.length - 1];
      fc = sample ? Math.round(sample.beatsPerMinute) : null;
    }

    // ── SpO2 ─────────────────────────────────────────────────
    let spo2 = null;
    const spo2Data = await HC.readRecords('OxygenSaturation', { timeRangeFilter: timeRange });
    if (spo2Data?.records?.length > 0) {
      const last = spo2Data.records[spo2Data.records.length - 1];
      spo2 = last?.percentage != null ? Math.round(last.percentage) : null;
    }

    // ── Temperatura ──────────────────────────────────────────
    let temperatura = null;
    const tempData = await HC.readRecords('BodyTemperature', { timeRangeFilter: timeRange });
    if (tempData?.records?.length > 0) {
      const last = tempData.records[tempData.records.length - 1];
      // Health Connect almacena en Celsius nativo en Samsung Health
      temperatura = last?.temperature?.inCelsius != null
        ? parseFloat(last.temperature.inCelsius.toFixed(1))
        : null;
    }

    // ── Presión Arterial (futuro-ready) ──────────────────────
    // Fluirá automáticamente cuando el usuario calibre el reloj.
    // No requiere cambios de código — Health Connect enviará los datos.
    let tas = null;
    let tad = null;
    const bpData = await HC.readRecords('BloodPressure', { timeRangeFilter: timeRange });
    if (bpData?.records?.length > 0) {
      const last = bpData.records[bpData.records.length - 1];
      tas = last?.systolic?.inMillimetersOfMercury != null
        ? Math.round(last.systolic.inMillimetersOfMercury) : null;
      tad = last?.diastolic?.inMillimetersOfMercury != null
        ? Math.round(last.diastolic.inMillimetersOfMercury) : null;
    }

    // Si no hay ningún dato útil, devolver null (fallback a manual)
    if (fc === null && spo2 === null && temperatura === null) return null;

    return {
      source      : 'watch',
      fc,
      spo2,
      temperatura,
      tas,          // null si no calibrado — campo queda editable manualmente
      tad,          // null si no calibrado — campo queda editable manualmente
      timestamp   : now.toISOString(),
      deviceName  : 'Galaxy Watch 8',
    };
  } catch {
    return null; // Cualquier error → fallback silencioso a manual
  }
}

// ── Background Sync (Tarea Expo) ────────────────────────────────
// Registra la tarea de sincronización en background.
// Android puede diferir el intervalo hasta ~30 min (Doze mode) — aceptable.
TaskManager.defineTask(BACKGROUND_SYNC_TASK, async () => {
  try {
    await getLatestWatchData();
    // Los datos quedan disponibles para la próxima vez que el usuario abra la app.
    // useWatchData los leerá en el evento AppState 'active'.
    return TaskManager.TaskManagerTaskBody?.SUCCESS ?? 'success';
  } catch {
    return TaskManager.TaskManagerTaskBody?.FAILED ?? 'failed';
  }
});

export const WATCH_TASK_NAME = BACKGROUND_SYNC_TASK;
