/**
 * HealthConnectService.js
 * Integración de wearables compatibles vía Health Connect → RMHealth
 * (Probado inicialmente con Galaxy Watch 8)
 *
 * Parámetros automáticos activos: FC, SpO2, Temperatura, TAS, TAD
 * Parámetros manuales: Glucosa
 *
 * CardioWave: cuando esté disponible, este servicio recibirá datos vía
 * 5G/eSIM directamente sin Health Connect. Reemplazar getLatestWatchData()
 * con CardioWaveSDK.stream() — sin cambios en HomeScreen.
 *
 * © 2025-2026 Morales Zepeda Raúl | INDAUTOR 03-2025-070109072500-01
 */

import * as TaskManager from 'expo-task-manager';
import * as SecureStore from 'expo-secure-store';
import { apiService } from '../api/client';

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
const DATA_WINDOW_HOURS    = 72;   // FC, SpO2, Temp — ventana amplia
const BP_WINDOW_HOURS      = 168;  // PA — 1 semana (mediciones infrecuentes)

// Permisos completos — incluye BloodPressure para leer presión arterial.
const HC_PERMISSIONS = [
  { accessType: 'read', recordType: 'HeartRate'        },
  { accessType: 'read', recordType: 'OxygenSaturation' },
  { accessType: 'read', recordType: 'BodyTemperature'  },
  { accessType: 'read', recordType: 'BloodPressure'    },
];

// Permiso mínimo para el botón "Leer desde Health Connect" (Fase 1).
// Solo Heart Rate — no SpO2, no Temp, no BP.
const HC_HEART_RATE_ONLY = [
  { accessType: 'read', recordType: 'HeartRate' },
];

// ── Inicializar ─────────────────────────────────────────────────
async function initHealthConnect() {
  if (!HC) return { available: false, status: null, reason: "NO_MODULE" };
  try {
    const status = await HC.getSdkStatus();
    console.log("[HC] getSdkStatus:", status);
    
    if (status === 3) {
      await HC.initialize();
      return { available: true, status };
    }
    
    let reason = "UNKNOWN_STATUS";
    if (status === 1) reason = "SDK_UNAVAILABLE";
    if (status === 2) reason = "SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED";
    
    return { available: false, status, reason };
  } catch (error) {
    console.log("[HC] init error:", error);
    return { available: false, status: null, reason: "INITIALIZE_ERROR" };
  }
}

// ── Verificar permisos concedidos ───────────────────────────────
// Usa getGrantedPermissions() para saber exactamente qué permisos tiene RMHealth.
// IMPORTANTE: Debe inicializar HC primero, si no getGrantedPermissions falla silenciosamente.
export async function checkGrantedPermissions() {
  if (!HC) return [];
  try {
    const initResult = await initHealthConnect();
    if (!initResult.available) return [];
    const granted = await HC.getGrantedPermissions();
    console.log('[HC] Permisos CONCEDIDOS:', JSON.stringify(granted));
    return granted || [];
  } catch (err) {
    console.log('[HC] getGrantedPermissions error:', err?.message || err);
    return [];
  }
}

export async function requestWatchPermissions() {
  if (!HC) return { available: false, status: null, reason: "NO_MODULE" };
  const initResult = await initHealthConnect();
  if (!initResult.available) {
    console.log("[HC] requestWatchPermissions abortado, initResult:", initResult);
    return initResult;
  }
  try {
    const granted = await HC.requestPermission(HC_PERMISSIONS);
    console.log("[HC] requestPermission result:", JSON.stringify(granted));
    if (!granted || granted.length === 0) return false;
    
    // Verificar explícitamente que BloodPressure fue concedido
    const hasBP = granted.some(
      (p) => p.recordType === 'BloodPressure' && p.accessType === 'read'
    );
    if (!hasBP) {
      console.log('[HC] ⚠️ BloodPressure NO fue concedido. Permisos obtenidos:', 
        granted.map(p => p.recordType).join(', '));
    }
    
    return true;
  } catch (error) {
    console.log("[HC] requestPermission error:", error);
    return false;
  }
}

// ── Abrir Ajustes de Health Connect ─────────────────────────────
export async function openHCSettings() {
  if (!HC) return false;
  try {
    await HC.openHealthConnectSettings();
    return true;
  } catch (error) {
    console.log("[HC] openHCSettings error:", error);
    return false;
  }
}

// ── Solicitar SOLO permiso de Frecuencia Cardíaca ────────────────
// Usado por el botón "Leer desde Health Connect" (Fase 1).
// No solicita SpO2, temperatura ni presión arterial.
export async function requestHeartRatePermission() {
  if (!HC) return { available: false, status: null, reason: "NO_MODULE" };
  const initResult = await initHealthConnect();
  if (!initResult.available) {
    console.log("[HC] requestHeartRatePermission abortado, initResult:", initResult);
    return initResult;
  }
  try {
    const granted = await HC.requestPermission(HC_HEART_RATE_ONLY);
    console.log("[HC] requestPermission result:", JSON.stringify(granted));
    // granted es array de permisos concedidos — verificar que contiene HeartRate
    if (!granted || granted.length === 0) return false;
    return granted.some(
      (p) => p.recordType === 'HeartRate' && p.accessType === 'read'
    );
  } catch (error) {
    console.log("[HC] requestPermission error:", error);
    return false;
  }
}

// ── Leer SOLO Frecuencia Cardíaca ───────────────────────────────
// Devuelve número (bpm) o null. No lee SpO2/Temp/BP.
export async function getLatestHeartRate() {
  if (!HC) return null;
  const initResult = await initHealthConnect();
  if (!initResult.available) return null;
  const now   = new Date();
  const start = new Date(now.getTime() - DATA_WINDOW_HOURS * 60 * 60 * 1000);
  try {
    const hrData = await HC.readRecords('HeartRate', {
      timeRangeFilter: {
        operator : 'between',
        startTime: start.toISOString(),
        endTime  : now.toISOString(),
      },
    });
    if (!hrData?.records?.length) return null;
    const latest = hrData.records[0]; // más reciente
    const sample = latest.samples?.[latest.samples.length - 1];
    return sample?.beatsPerMinute != null
      ? Math.round(sample.beatsPerMinute)
      : null;
  } catch {
    return null;
  }
}

// ── Leer datos del reloj ────────────────────────────────────────
/**
 * Devuelve el objeto watchData con los últimos vitales del reloj,
 * o null si Health Connect no está disponible o no hay datos recientes.
 *
 * IMPORTANTE: Health Connect devuelve records en orden DESCENDENTE
 * (el más reciente en records[0]). Siempre usamos records[0].
 *
 * @returns {Promise<WatchData|null>}
 *
 * @typedef {Object} WatchData
 * @property {'watch'} source
 * @property {number|null} fc        - Frecuencia cardíaca (bpm)
 * @property {number|null} spo2      - Saturación de oxígeno (%)
 * @property {number|null} temperatura - Temperatura corporal (°C)
 * @property {number|null} tas       - Presión sistólica (mmHg)
 * @property {number|null} tad       - Presión diastólica (mmHg)
 * @property {string} timestamp      - ISO timestamp del dato más reciente
 * @property {string} deviceName
 */
export async function getLatestWatchData() {
  if (!HC) return null;
  const initResult = await initHealthConnect();
  if (!initResult.available) return null;

  const now   = new Date();
  const start = new Date(now.getTime() - DATA_WINDOW_HOURS * 60 * 60 * 1000);
  const timeRange = {
    operator : 'between',
    startTime: start.toISOString(),
    endTime  : now.toISOString(),
  };

  try {
    // Helper: get the LAST record (most recent) — HC returns ascending order
    const lastRecord = (records) => records && records.length > 0 ? records[records.length - 1] : null;

    let latestMeasurementTime = null; // track the real measurement timestamp

    // ── Frecuencia Cardíaca ──────────────────────────────────
    let fc = null;
    const hrData = await HC.readRecords('HeartRate', { timeRangeFilter: timeRange });
    if (hrData?.records?.length > 0) {
      const latest = lastRecord(hrData.records);
      const sample = latest.samples?.[latest.samples.length - 1];
      fc = sample ? Math.round(sample.beatsPerMinute) : null;
      const hrTime = latest.endTime || latest.startTime || sample?.time;
      console.log('[HC] HR: records=', hrData.records.length,
        'latest.endTime=', hrTime,
        'value=', fc, 'bpm');
      if (hrTime && (!latestMeasurementTime || hrTime > latestMeasurementTime)) {
        latestMeasurementTime = hrTime;
      }
    }

    // ── SpO2 ─────────────────────────────────────────────────
    let spo2 = null;
    const spo2Data = await HC.readRecords('OxygenSaturation', { timeRangeFilter: timeRange });
    if (spo2Data?.records?.length > 0) {
      const latest = lastRecord(spo2Data.records);
      spo2 = latest?.percentage != null ? Math.round(latest.percentage) : null;
      const spo2Time = latest.time || latest.endTime || latest.startTime;
      console.log('[HC] SpO2: records=', spo2Data.records.length,
        'time=', spo2Time,
        'value=', spo2, '%');
      if (spo2Time && (!latestMeasurementTime || spo2Time > latestMeasurementTime)) {
        latestMeasurementTime = spo2Time;
      }
    }

    // ── Temperatura ──────────────────────────────────────────
    let temperatura = null;
    const tempData = await HC.readRecords('BodyTemperature', { timeRangeFilter: timeRange });
    if (tempData?.records?.length > 0) {
      const latest = lastRecord(tempData.records);
      temperatura = latest?.temperature?.inCelsius != null
        ? parseFloat(latest.temperature.inCelsius.toFixed(1))
        : null;
    }

    // ── Presión Arterial ─────────────────────────────────────
    let tas = null;
    let tad = null;
    const bpData = await HC.readRecords('BloodPressure', { timeRangeFilter: timeRange });

    if (bpData?.records?.length > 0) {
      const latest = lastRecord(bpData.records);
      tas = latest?.systolic?.inMillimetersOfMercury != null
        ? Math.round(latest.systolic.inMillimetersOfMercury) : null;
      tad = latest?.diastolic?.inMillimetersOfMercury != null
        ? Math.round(latest.diastolic.inMillimetersOfMercury) : null;
      const bpTime = latest.time || latest.endTime || latest.startTime;
      console.log('[HC] BP: records=', bpData.records.length,
        'time=', bpTime,
        'value=', tas, '/', tad);
      if (bpTime && (!latestMeasurementTime || bpTime > latestMeasurementTime)) {
        latestMeasurementTime = bpTime;
      }
    }

    // Si no hay ningún dato útil, devolver null (fallback a manual)
    if (fc === null && spo2 === null && temperatura === null && tas === null && tad === null) return null;

    // Use actual measurement time, fall back to current time
    const effectiveTimestamp = latestMeasurementTime || now.toISOString();
    console.log('[HC] 📊 Datos leídos — medición real:', latestMeasurementTime, 'vs ahora:', now.toISOString());

    return {
      source      : 'watch',
      fc,
      spo2,
      temperatura,
      tas,
      tad,
      timestamp   : effectiveTimestamp,
      deviceName  : 'Health Connect',
    };
  } catch (err) {
    console.log('[HC] getLatestWatchData error:', err?.message || err);
    return null;
  }
}

// ── Background Sync (Tarea Expo) ────────────────────────────────
// Registra la tarea de sincronización en background.
// Android puede diferir el intervalo hasta ~30 min (Doze mode) — aceptable.
TaskManager.defineTask(BACKGROUND_SYNC_TASK, async () => {
  try {
    const watchData = await getLatestWatchData();
    
    if (watchData) {
      // Intentar obtener el token almacenado de la sesión
      const token = await SecureStore.getItemAsync('rmhealth_access_token');
      if (token) {
        // Enviar a RMHealth backend
        await apiService.sendVitals(watchData, token);
        console.log('[HC] Background sync exitoso:', watchData);
      } else {
        console.log('[HC] Background sync abortado: Usuario no autenticado');
      }
    }
    
    return TaskManager.TaskManagerTaskBody?.SUCCESS ?? 'success';
  } catch (error) {
    console.log('[HC] Background sync error:', error);
    return TaskManager.TaskManagerTaskBody?.FAILED ?? 'failed';
  }
});

export const WATCH_TASK_NAME = BACKGROUND_SYNC_TASK;
