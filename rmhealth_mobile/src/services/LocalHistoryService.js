import AsyncStorage from '@react-native-async-storage/async-storage';

const HISTORY_KEY = '@rmhealth_vitals_history';
const MAX_RECORDS = 100;

/**
 * LocalHistoryService — Stores vital signs results locally.
 * This ensures history is available even when the backend DB is offline.
 *
 * SECURITY NOTE (Audit V-08): Health data is stored in AsyncStorage (unencrypted).
 * SecureStore has a ~2KB per-item limit, making it impractical for 100 records.
 * TODO: Migrate to encrypted storage (e.g. react-native-encrypted-storage) or
 * backend-only persistence before external pilot expansion.
 * Current mitigation: Data is local-only, max 100 records, device-scoped.
 */
export const LocalHistoryService = {
  /**
   * Save a vital signs result to local history
   * @param {Object} result - The API response from /api/vital-signs
   * @param {Object} inputValues - The original input values sent
   */
  async saveRecord(result, inputValues) {
    try {
      const existing = await this.getHistory();
      
      const record = {
        id: Date.now().toString(),
        timestamp: new Date().toISOString(),
        tipo_emergencia: result.display_severity || result.analysis?.nivel_criticidad || 'NORMAL',
        descripcion: (result.analysis?.factores_riesgo || []).join(', ') || 'Sin factores de riesgo',
        estado: result.emergency_eligible ? 'activa' : 'normal',
        ml_level: result.ml_triage?.level || 'N/A',
        ml_confidence: result.ml_triage?.confidence || 0,
        score: result.clinical_score || result.analysis?.score_riesgo || 0,
        recomendacion: result.analysis?.recomendacion || '',
        display_severity: result.display_severity || result.analysis?.nivel_criticidad || 'NORMAL',
        emergency_eligible: result.emergency_eligible || false,
        vitals: {
          hr: inputValues.frecuencia_cardiaca,
          spo2: inputValues.oxigeno,
          sys: inputValues.presion_sistolica,
          dia: inputValues.presion_diastolica,
          glucose: inputValues.glucosa,
          temp: inputValues.temperatura,
        },
        db_persisted: result.db_persisted || false,
      };

      existing.unshift(record); // newest first
      const trimmed = existing.slice(0, MAX_RECORDS);
      
      await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(trimmed));
      return record;
    } catch (e) {
      console.error('[LocalHistory] Save failed:', e);
      return null;
    }
  },

  /**
   * Save SOS emergency record
   */
  async saveSOS(result) {
    try {
      const existing = await this.getHistory();
      
      const record = {
        id: `sos_${Date.now()}`,
        timestamp: new Date().toISOString(),
        tipo_emergencia: 'SOS_MANUAL',
        descripcion: 'Protocolo de emergencia activado manualmente',
        estado: 'activa',
        ml_level: result?.ml_triage?.level || 'CRITICO',
        ml_confidence: result?.ml_triage?.confidence || 1.0,
        score: 100,
        recomendacion: 'PROTOCOLO DE EMERGENCIA ACTIVADO',
        vitals: {},
        db_persisted: result?.db_persisted || false,
        is_sos: true,
      };

      existing.unshift(record);
      const trimmed = existing.slice(0, MAX_RECORDS);
      
      await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(trimmed));
      return record;
    } catch (e) {
      console.error('[LocalHistory] SOS save failed:', e);
      return null;
    }
  },

  /**
   * Get all local history records
   */
  async getHistory() {
    try {
      const json = await AsyncStorage.getItem(HISTORY_KEY);
      return json ? JSON.parse(json) : [];
    } catch (e) {
      console.error('[LocalHistory] Read failed:', e);
      return [];
    }
  },

  /**
   * Clear all history
   */
  async clear() {
    await AsyncStorage.removeItem(HISTORY_KEY);
  },
};
