/**
 * HealthConnectService.js
 * Integración de wearables compatibles vía Health Connect → RMHealth
 * (Probado inicialmente con Galaxy Watch 8)
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
const DATA_WINDOW_HOURS    = 72;  // FC, SpO2, Temp — ampliado a 72h para asegurar que muestre datos
const BP_WINDOW_HOURS      = 168; // PA — ampliado a 1 semana para diagnóstico

// Permisos completos para sync futuro (SpO2, Temp, BP).
// BloodPressure incluido para que fluya automáticamente cuando
// el usuario calibre el reloj — sin cambios de código requeridos.
const HC_PERMISSIONS = [
  { accessType: 'read', recordType: 'HeartRate'        },
  { accessType: 'read', recordType: 'OxygenSaturation' },
  { accessType: 'read', recordType: 'BodyTemperature'  },
  { accessType: 'read', recordType: 'BloodPressure'    }, // futuro-ready
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
    return true; // Si devolvió arreglo, asumimos que concedió los permisos
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
    const last   = hrData.records[hrData.records.length - 1];
    const sample = last.samples?.[last.samples.length - 1];
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
    // ── Frecuencia Cardíaca ──────────────────────────────────
    let fc = null;
    const hrData = await HC.readRecords('HeartRate', { timeRangeFilter: timeRange });
    console.log('[HC] HeartRate records:', hrData?.records?.length ?? 0);
    if (hrData?.records?.length > 0) {
      const last   = hrData.records[hrData.records.length - 1];
      const sample = last.samples?.[last.samples.length - 1];
      fc = sample ? Math.round(sample.beatsPerMinute) : null;
    }

    // ── SpO2 ─────────────────────────────────────────────────
    let spo2 = null;
    const spo2Data = await HC.readRecords('OxygenSaturation', { timeRangeFilter: timeRange });
    console.log('[HC] OxygenSaturation records:', spo2Data?.records?.length ?? 0);
    if (spo2Data?.records?.length > 0) {
      const last = spo2Data.records[spo2Data.records.length - 1];
      spo2 = last?.percentage != null ? Math.round(last.percentage) : null;
    }

    // ── Temperatura ──────────────────────────────────────────
    let temperatura = null;
    const tempData = await HC.readRecords('BodyTemperature', { timeRangeFilter: timeRange });
    console.log('[HC] BodyTemperature records:', tempData?.records?.length ?? 0);
    if (tempData?.records?.length > 0) {
      const last = tempData.records[tempData.records.length - 1];
      // Health Connect almacena en Celsius nativo en Samsung Health
      temperatura = last?.temperature?.inCelsius != null
        ? parseFloat(last.temperature.inCelsius.toFixed(1))
        : null;
    }

    // ── Presión Arterial (ventana extendida 24h) ─────────────────
    let tas = null;
    let tad = null;
    try {
      // BP se mide pocas veces al día — usar ventana de 24h
      const bpStart = new Date(now.getTime() - BP_WINDOW_HOURS * 60 * 60 * 1000);
      const bpTimeRange = {
        operator : 'between',
        startTime: bpStart.toISOString(),
        endTime  : now.toISOString(),
      };
      const bpData = await HC.readRecords('BloodPressure', { timeRangeFilter: bpTimeRange });
      console.log('[HC] BloodPressure records (24h):', bpData?.records?.length ?? 0);
      if (bpData?.records?.length > 0) {
        const last = bpData.records[bpData.records.length - 1];
        console.log('[HC] BP último registro (raw):', JSON.stringify(last));
        tas = last?.systolic?.inMillimetersOfMercury != null
          ? Math.round(last.systolic.inMillimetersOfMercury) : null;
        tad = last?.diastolic?.inMillimetersOfMercury != null
          ? Math.round(last.diastolic.inMillimetersOfMercury) : null;
        console.log('[HC] BP extraído: TAS=', tas, 'TAD=', tad);
      } else {
        // Diagnóstico: buscar en 72h para ver si Samsung ALGUNA VEZ escribió BP
        const diagStart = new Date(now.getTime() - 72 * 60 * 60 * 1000);
        const diagRange = {
          operator : 'between',
          startTime: diagStart.toISOString(),
          endTime  : now.toISOString(),
        };
        const diagData = await HC.readRecords('BloodPressure', { timeRangeFilter: diagRange });
        const diagCount = diagData?.records?.length ?? 0;
        console.log('[HC] BP: 0 registros en 24h. Diagnóstico 72h:', diagCount, 'registros encontrados');
        if (diagCount > 0) {
          // Hay datos pero fuera de 24h — usar el más reciente de todas formas
          const last = diagData.records[diagData.records.length - 1];
          console.log('[HC] BP diagnóstico — usando último registro de 72h:', JSON.stringify(last));
          tas = last?.systolic?.inMillimetersOfMercury != null
            ? Math.round(last.systolic.inMillimetersOfMercury) : null;
          tad = last?.diastolic?.inMillimetersOfMercury != null
            ? Math.round(last.diastolic.inMillimetersOfMercury) : null;
          console.log('[HC] BP recuperado de historial: TAS=', tas, 'TAD=', tad);
        } else {
          console.log('[HC] BP: Samsung Health Monitor NO ha escrito presión arterial a Health Connect en 72h');
          console.log('[HC] BP: Verificar que Samsung Health Monitor tiene permiso de ESCRITURA en Health Connect');
        }
      }
    } catch (bpErr) {
      console.log('[HC] BP lectura error (puede no estar soportado):', bpErr?.message || bpErr);
    }

    console.log('[HC] Resumen: FC=', fc, 'SpO2=', spo2, 'Temp=', temperatura, 'TAS=', tas, 'TAD=', tad);

    // Si no hay ningún dato útil, devolver null (fallback a manual)
    if (fc === null && spo2 === null && temperatura === null && tas === null && tad === null) return null;

    return {
      source      : 'watch',
      fc,
      spo2,
      temperatura,
      tas,          // null si no calibrado — campo queda editable manualmente
      tad,          // null si no calibrado — campo queda editable manualmente
      timestamp   : now.toISOString(),
      deviceName  : 'Health Connect',
    };
  } catch (err) {
    console.log('[HC] getLatestWatchData error general:', err?.message || err);
    return null; // Cualquier error → fallback silencioso a manual
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
