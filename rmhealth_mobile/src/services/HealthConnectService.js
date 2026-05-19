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


// Permisos completos — lectura Y escritura para sincronización bidireccional.
// WRITE permite que RMHealth escriba datos de vuelta a Health Connect,
// habilitando que Samsung Health y otras apps lean las mediciones.
const HC_PERMISSIONS = [
  { accessType: 'read',  recordType: 'HeartRate'        },
  { accessType: 'read',  recordType: 'OxygenSaturation' },
  { accessType: 'read',  recordType: 'BodyTemperature'  },
  { accessType: 'read',  recordType: 'BloodPressure'    },
  { accessType: 'write', recordType: 'HeartRate'        },
  { accessType: 'write', recordType: 'OxygenSaturation' },
  { accessType: 'write', recordType: 'BodyTemperature'  },
  { accessType: 'write', recordType: 'BloodPressure'    },
  // Sleep context (preventive, non-diagnostic) — permission requested only when SLEEP_MODE_ENABLED=true
  { accessType: 'read',  recordType: 'SleepSession'     },
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
    // BP usa su propia ventana de tiempo más amplia (BP_WINDOW_HOURS)
    // porque las mediciones de presión son menos frecuentes que FC/SpO2
    let tas = null;
    let tad = null;
    const bpStart = new Date(now.getTime() - BP_WINDOW_HOURS * 60 * 60 * 1000);
    const bpTimeRange = {
      operator : 'between',
      startTime: bpStart.toISOString(),
      endTime  : now.toISOString(),
    };
    console.log('[HC] BP query window:', bpStart.toISOString(), '→', now.toISOString(),
      '(' + BP_WINDOW_HOURS + 'h)');

    const bpData = await HC.readRecords('BloodPressure', { timeRangeFilter: bpTimeRange });

    if (bpData?.records?.length > 0) {
      // ── DIAGNÓSTICO PROFUNDO: entender por qué solo hay 1 registro ──
      console.log('[HC] BP: TOTAL records found =', bpData.records.length);
      bpData.records.forEach((rec, idx) => {
        const recTime = rec.time || rec.endTime || rec.startTime;
        const recSys  = rec.systolic?.inMillimetersOfMercury;
        const recDia  = rec.diastolic?.inMillimetersOfMercury;
        const recMeta = rec.metadata;
        console.log('[HC] BP record[' + idx + ']:',
          'time=' + recTime,
          'sys=' + recSys, 'dia=' + recDia,
          'dataOrigin=' + (recMeta?.dataOrigin?.packageName || recMeta?.dataOrigin || 'unknown'),
          'id=' + (recMeta?.id || rec.metadata?.id || 'N/A'),
          'lastModified=' + (recMeta?.lastModifiedTime || 'N/A'));
        // Dump completo del primer registro para entender la estructura
        if (idx === 0) {
          try {
            console.log('[HC] BP record[0] FULL DUMP:', JSON.stringify(rec).substring(0, 500));
          } catch(e) { console.log('[HC] BP dump error:', e); }
        }
      });

      const latest = lastRecord(bpData.records);
      tas = latest?.systolic?.inMillimetersOfMercury != null
        ? Math.round(latest.systolic.inMillimetersOfMercury) : null;
      tad = latest?.diastolic?.inMillimetersOfMercury != null
        ? Math.round(latest.diastolic.inMillimetersOfMercury) : null;
      const bpTime = latest.time || latest.endTime || latest.startTime;

      const bpAgeMs = bpTime ? (now.getTime() - new Date(bpTime).getTime()) : 0;
      const bpAgeHours = (bpAgeMs / (1000 * 60 * 60)).toFixed(1);
      console.log('[HC] BP LATEST: time=' + bpTime,
        'value=' + tas + '/' + tad,
        'age=' + bpAgeHours + 'h');

      if (bpTime && (!latestMeasurementTime || bpTime > latestMeasurementTime)) {
        latestMeasurementTime = bpTime;
      }
    } else {
      console.log('[HC] BP: NO records found in window');
    }

    // Si no hay ningún dato útil, devolver null (fallback a manual)
    if (fc === null && spo2 === null && temperatura === null && tas === null && tad === null) return null;

    // Use actual measurement time, fall back to current time
    const effectiveTimestamp = latestMeasurementTime || now.toISOString();
    console.log('[HC] 📊 Datos leídos — medición real:', latestMeasurementTime, 'vs ahora:', now.toISOString());

    // bpTime: the actual measurement time of the latest BP record
    // Used by useWatchData → BPSyncBridge to detect stale BP readings
    const bpLatest = bpData?.records?.length > 0 ? lastRecord(bpData.records) : null;
    const bpTime = bpLatest ? (bpLatest.time || bpLatest.endTime || bpLatest.startTime) : null;

    return {
      source      : 'watch',
      fc,
      spo2,
      temperatura,
      tas,
      tad,
      bpTime,
      timestamp   : effectiveTimestamp,
      deviceName  : 'Health Connect',
    };
  } catch (err) {
    console.log('[HC] getLatestWatchData error:', err?.message || err);
    return null;
  }
}

// ── Escribir Presión Arterial a Health Connect ──────────────────
/**
 * Escribe un registro de presión arterial a Health Connect.
 * Permite sincronización bidireccional:
 *  - Samsung Health → Health Connect → RMHealth (lectura)
 *  - RMHealth → Health Connect → Samsung Health (escritura)
 *
 * @param {number} systolic  - Presión sistólica (mmHg)
 * @param {number} diastolic - Presión diastólica (mmHg)
 * @param {Date}   [measurementTime] - Fecha/hora de la medición (default: now)
 * @returns {Promise<boolean>} true si se escribió exitosamente
 */
export async function writeBloodPressure(systolic, diastolic, measurementTime = null) {
  if (!HC) {
    console.log('[HC] writeBloodPressure: módulo no disponible');
    return false;
  }
  const initResult = await initHealthConnect();
  if (!initResult.available) {
    console.log('[HC] writeBloodPressure: HC no disponible:', initResult.reason);
    return false;
  }

  try {
    const time = measurementTime || new Date();
    const isoTime = time instanceof Date ? time.toISOString() : time;

    const records = [{
      recordType: 'BloodPressure',
      systolic:  { value: systolic,  unit: 'millimetersOfMercury' },
      diastolic: { value: diastolic, unit: 'millimetersOfMercury' },
      time: isoTime,
      bodyPosition: 0,         // unknown
      measurementLocation: 0,  // unknown
    }];

    const result = await HC.insertRecords(records);
    console.log('[HC] writeBloodPressure ✅ escrito:', systolic + '/' + diastolic,
      'time=', isoTime, 'result=', JSON.stringify(result));
    return true;
  } catch (err) {
    console.log('[HC] writeBloodPressure ❌ error:', err?.message || err);
    return false;
  }
}

// ── DIAGNÓSTICO: Probar escritura/lectura de BP en Health Connect ──
/**
 * Escribe un BP de prueba, relee todos los registros y logea la diferencia.
 * Luego elimina el registro de prueba.
 * Esto confirma si Health Connect está funcionando correctamente para BP.
 */
export async function diagnoseBPSync() {
  if (!HC) return { ok: false, reason: 'NO_MODULE' };
  const initResult = await initHealthConnect();
  if (!initResult.available) return { ok: false, reason: 'HC_UNAVAILABLE' };

  try {
    // 1. Leer registros ANTES de escribir
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 168 * 60 * 60 * 1000);
    const bpBefore = await HC.readRecords('BloodPressure', {
      timeRangeFilter: {
        operator: 'between',
        startTime: weekAgo.toISOString(),
        endTime: now.toISOString(),
      },
    });
    const countBefore = bpBefore?.records?.length || 0;
    console.log('[HC-DIAG] BP records BEFORE write:', countBefore);

    // 2. Escribir un registro de prueba con valores distintos (999/888 = claramente test)
    const testTime = new Date();
    const testRecords = [{
      recordType: 'BloodPressure',
      systolic:  { value: 120, unit: 'millimetersOfMercury' },
      diastolic: { value: 80,  unit: 'millimetersOfMercury' },
      time: testTime.toISOString(),
      bodyPosition: 0,
      measurementLocation: 0,
    }];
    const writeResult = await HC.insertRecords(testRecords);
    console.log('[HC-DIAG] Write result:', JSON.stringify(writeResult));

    // 3. Esperar un momento y releer
    await new Promise(r => setTimeout(r, 1000));
    const bpAfter = await HC.readRecords('BloodPressure', {
      timeRangeFilter: {
        operator: 'between',
        startTime: weekAgo.toISOString(),
        endTime: new Date().toISOString(),
      },
    });
    const countAfter = bpAfter?.records?.length || 0;
    console.log('[HC-DIAG] BP records AFTER write:', countAfter);
    
    // Dump todos
    bpAfter?.records?.forEach((rec, i) => {
      console.log('[HC-DIAG] record[' + i + ']:', 
        'time=' + (rec.time || rec.endTime),
        'sys=' + rec.systolic?.inMillimetersOfMercury,
        'dia=' + rec.diastolic?.inMillimetersOfMercury,
        'id=' + (rec.metadata?.id || 'N/A'),
        'origin=' + (rec.metadata?.dataOrigin?.packageName || rec.metadata?.dataOrigin || 'N/A'));
    });

    // 4. Limpiar: borrar el registro de prueba
    if (writeResult && writeResult.length > 0) {
      try {
        await HC.deleteRecordsByUuids('BloodPressure', writeResult, []);
        console.log('[HC-DIAG] ✅ Test record cleaned up:', writeResult[0]);
      } catch(e) {
        console.log('[HC-DIAG] ⚠️ Cleanup failed (will expire naturally):', e?.message);
      }
    }

    const success = countAfter > countBefore;
    console.log('[HC-DIAG] Pipeline test:', success ? '✅ WORKING' : '❌ FAILED',
      '(before=' + countBefore + ', after=' + countAfter + ')');
    
    return { ok: success, before: countBefore, after: countAfter, writeResult };
  } catch (err) {
    console.log('[HC-DIAG] ❌ error:', err?.message || err);
    return { ok: false, reason: err?.message || String(err) };
  }
}

// ── Read Sleep Session Data (preventive context, non-diagnostic) ─
// Returns sleep data from the last 24h for contextual wellness monitoring.
// Quality is a simple heuristic: >=7h=good, 5-7h=fair, <5h=poor.
// This data NEVER modifies clinical severity or triggers emergency alerts.
const SLEEP_WINDOW_HOURS = 24;

export async function getSleepData() {
  if (!HC) return null;
  const initResult = await initHealthConnect();
  if (!initResult.available) return null;

  const now   = new Date();
  const start = new Date(now.getTime() - SLEEP_WINDOW_HOURS * 60 * 60 * 1000);

  try {
    const sleepRecords = await HC.readRecords('SleepSession', {
      timeRangeFilter: {
        operator: 'between',
        startTime: start.toISOString(),
        endTime: now.toISOString(),
      },
    });

    const records = sleepRecords?.records;
    if (!records || records.length === 0) {
      console.log('[HC-Sleep] No sleep sessions found in last', SLEEP_WINDOW_HOURS, 'hours');
      return null;
    }

    // Calculate total sleep duration across all sessions
    let totalMinutes = 0;
    const sessions = [];

    for (const rec of records) {
      const sessionStart = new Date(rec.startTime);
      const sessionEnd   = new Date(rec.endTime);
      const durationMin  = (sessionEnd - sessionStart) / (1000 * 60);

      // Extract sleep stages if available
      const stages = [];
      if (rec.stages && Array.isArray(rec.stages)) {
        for (const stage of rec.stages) {
          stages.push({
            type: stage.stage || 'unknown', // 0=unknown, 1=awake, 2=sleeping, 3=out_of_bed, 4=light, 5=deep, 6=rem
            startTime: stage.startTime,
            endTime: stage.endTime,
          });
        }
      }

      totalMinutes += durationMin;
      sessions.push({
        start: rec.startTime,
        end: rec.endTime,
        durationMinutes: Math.round(durationMin),
        stages,
      });
    }

    // Simple quality heuristic (non-diagnostic)
    const totalHours = totalMinutes / 60;
    let quality = 'poor';
    if (totalHours >= 7) quality = 'good';
    else if (totalHours >= 5) quality = 'fair';

    console.log('[HC-Sleep] Found', records.length, 'sessions, total:', Math.round(totalMinutes), 'min, quality:', quality);

    return {
      totalMinutes: Math.round(totalMinutes),
      totalHours: Math.round(totalHours * 10) / 10,
      quality,
      sessions,
      sessionCount: records.length,
      readAt: now.toISOString(),
      source: 'health_connect',
      is_non_diagnostic: true,
    };
  } catch (error) {
    console.log('[HC-Sleep] Error reading sleep data:', error?.message || error);
    return null;
  }
}

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
