/**
 * Health Connect Service
 *
 * Reads real vital signs from Samsung Galaxy Watch (and other Android
 * wearables) via the Health Connect API. This replaces the simulated
 * data from useVitalsSimulation once a real device is available.
 *
 * Requirements:
 *   - Android only (iOS uses HealthKit — separate module)
 *   - npm install react-native-health-connect expo-build-properties
 *   - Must use custom dev client (npx expo run:android), NOT Expo Go
 *   - Health Connect app installed on device
 *
 * @see https://developer.android.com/health-and-fitness/guides/health-connect
 * @module services/healthConnect
 */

// Lazy load — evita crash nativo si el módulo no está enlazado.
// Este archivo está deshabilitado (FEATURES.HEALTH_CONNECT_ENABLED = false).
// Reactivar cuando HC sea compatible con New Architecture.
let _HC = null;
try {
  _HC = require('react-native-health-connect');
} catch {
  // Módulo no disponible — todas las funciones devuelven null/false
}
const initialize       = _HC?.initialize       ?? (() => Promise.resolve(false));
const requestPermission = _HC?.requestPermission ?? (() => Promise.resolve([]));
const readRecords       = _HC?.readRecords       ?? (() => Promise.resolve({ records: [] }));

// Record types that RMHealth needs from the smartwatch
const REQUIRED_PERMISSIONS = [
  { accessType: 'read', recordType: 'HeartRate' },
  { accessType: 'read', recordType: 'OxygenSaturation' },
  { accessType: 'read', recordType: 'BloodPressure' },
  { accessType: 'read', recordType: 'BloodGlucose' },
  { accessType: 'read', recordType: 'Steps' },
];

/**
 * Time range filter for the last N minutes of data.
 *
 * @param {number} minutes - How far back to query.
 * @returns {object} Health Connect time range filter.
 */
const getTimeRange = (minutes = 5) => {
  const end = new Date();
  const start = new Date(end.getTime() - minutes * 60 * 1000);
  return {
    operator: 'between',
    startTime: start.toISOString(),
    endTime: end.toISOString(),
  };
};

/**
 * Initialize the Health Connect SDK.
 *
 * @returns {Promise<boolean>} True if initialized successfully.
 */
export const initHealthConnect = async () => {
  try {
    const isInitialized = await initialize();
    if (!isInitialized) {
      console.warn('[HealthConnect] Failed to initialize. Is the Health Connect app installed?');
    }
    return isInitialized;
  } catch (error) {
    console.error('[HealthConnect] Initialization error:', error.message);
    return false;
  }
};

/**
 * Request all required health data permissions from the user.
 *
 * @returns {Promise<boolean>} True if all permissions were granted.
 */
export const requestHealthPermissions = async () => {
  try {
    const granted = await requestPermission(REQUIRED_PERMISSIONS);
    // granted is an array of granted permissions
    const allGranted = granted.length === REQUIRED_PERMISSIONS.length;
    if (!allGranted) {
      console.warn(
        '[HealthConnect] Not all permissions granted.',
        `Requested: ${REQUIRED_PERMISSIONS.length}, Granted: ${granted.length}`
      );
    }
    return allGranted;
  } catch (error) {
    console.error('[HealthConnect] Permission request error:', error.message);
    return false;
  }
};

/**
 * Read the latest heart rate from Health Connect.
 *
 * @param {number} lookbackMinutes - Minutes of history to query.
 * @returns {Promise<number|null>} Latest heart rate in BPM, or null.
 */
export const readHeartRate = async (lookbackMinutes = 5) => {
  try {
    const result = await readRecords('HeartRate', {
      timeRangeFilter: getTimeRange(lookbackMinutes),
    });
    if (result.records.length === 0) return null;

    // Get the most recent sample
    const latest = result.records[result.records.length - 1];
    return latest.samples?.[0]?.beatsPerMinute ?? null;
  } catch (error) {
    console.error('[HealthConnect] Heart rate read error:', error.message);
    return null;
  }
};

/**
 * Read the latest SpO2 from Health Connect.
 *
 * @param {number} lookbackMinutes - Minutes of history to query.
 * @returns {Promise<number|null>} SpO2 percentage (0-100), or null.
 */
export const readOxygenSaturation = async (lookbackMinutes = 10) => {
  try {
    const result = await readRecords('OxygenSaturation', {
      timeRangeFilter: getTimeRange(lookbackMinutes),
    });
    if (result.records.length === 0) return null;

    const latest = result.records[result.records.length - 1];
    return latest.percentage ?? null;
  } catch (error) {
    console.error('[HealthConnect] SpO2 read error:', error.message);
    return null;
  }
};

/**
 * Read the latest blood pressure from Health Connect.
 * Note: Only Samsung Galaxy Watch supports BP via Health Connect.
 *
 * @param {number} lookbackMinutes - Minutes of history to query.
 * @returns {Promise<{systolic: number, diastolic: number}|null>}
 */
export const readBloodPressure = async (lookbackMinutes = 30) => {
  try {
    const result = await readRecords('BloodPressure', {
      timeRangeFilter: getTimeRange(lookbackMinutes),
    });
    if (result.records.length === 0) return null;

    const latest = result.records[result.records.length - 1];
    return {
      systolic: latest.systolic?.inMillimetersOfMercury ?? null,
      diastolic: latest.diastolic?.inMillimetersOfMercury ?? null,
    };
  } catch (error) {
    console.error('[HealthConnect] Blood pressure read error:', error.message);
    return null;
  }
};

/**
 * Read the latest blood glucose from Health Connect.
 * Requires an external CGM device (FreeStyle Libre, Dexcom).
 *
 * @param {number} lookbackMinutes - Minutes of history to query.
 * @returns {Promise<number|null>} Glucose in mg/dL, or null.
 */
export const readBloodGlucose = async (lookbackMinutes = 60) => {
  try {
    const result = await readRecords('BloodGlucose', {
      timeRangeFilter: getTimeRange(lookbackMinutes),
    });
    if (result.records.length === 0) return null;

    const latest = result.records[result.records.length - 1];
    // Health Connect stores glucose in mmol/L — convert to mg/dL
    const mmolL = latest.level?.inMillimolesPerLiter ?? null;
    return mmolL ? Math.round(mmolL * 18.0182) : null;
  } catch (error) {
    console.error('[HealthConnect] Glucose read error:', error.message);
    return null;
  }
};

/**
 * Read ALL vitals at once and return a unified object
 * compatible with the RMHealth API payload format.
 *
 * @returns {Promise<object>} Vitals object ready to send to the API.
 */
export const readAllVitals = async () => {
  const [heartRate, spo2, bloodPressure, glucose] = await Promise.all([
    readHeartRate(),
    readOxygenSaturation(),
    readBloodPressure(),
    readBloodGlucose(),
  ]);

  return {
    heartRate: heartRate,
    spo2: spo2,
    systolic: bloodPressure?.systolic ?? null,
    diastolic: bloodPressure?.diastolic ?? null,
    glucose: glucose,
    timestamp: new Date().toISOString(),
    source: 'health_connect',
    hasRealData: heartRate !== null || spo2 !== null,
  };
};
