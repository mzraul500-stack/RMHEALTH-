import { useState, useEffect, useCallback, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import mockData from '../data/medications_mock.json';
import { scheduleMedicationReminder, cancelMedicationReminder, requestNotificationPermissions } from '../../../services/NotificationService';
import { saveDailySnapshot } from '../services/AdherenceTracker';

// Storage keys
const STORAGE_KEY = '@rmhealth/medications';
const DOSE_LOG_KEY = '@rmhealth/dose_log';

/**
 * Get today's date key (YYYY-MM-DD)
 */
function getTodayKey() {
  return new Date().toISOString().split('T')[0];
}

/**
 * useMedications — Custom Hook (Medication Memory Controller)
 *
 * Now with daily dose logging:
 * - Each medication's "taken" status resets daily
 * - When user marks as "taken", logs the exact timestamp
 * - Dose history is persisted separately from medication definitions
 * - Supports multiple doses per day per medication
 */
export function useMedications() {
  const [medications, setMedications] = useState([]);
  const [doseLog, setDoseLog] = useState({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const hasLoaded = useRef(false);

  // ─── LOAD ──────────────────────────────────────────────────────
  useEffect(() => {
    loadAll();
    requestNotificationPermissions();
  }, []);

  // ─── AUTO-SAVE ADHERENCE SNAPSHOT ──────────────────────────────
  useEffect(() => {
    if (hasLoaded.current && medications.length > 0) {
      // Build merged view with today's dose status for snapshot
      const todayKey = getTodayKey();
      const todayDoses = doseLog[todayKey] || {};
      const medsWithStatus = medications.map(med => ({
        ...med,
        taken: !!todayDoses[med.id],
      }));
      saveDailySnapshot(medsWithStatus);
    }
  }, [medications, doseLog]);

  const loadAll = async () => {
    try {
      setIsLoading(true);
      setError(null);

      // Load medications list
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      let meds = mockData;

      if (raw !== null) {
        try {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            meds = parsed;
          } else {
            await persistMeds(mockData);
          }
        } catch {
          console.warn('[useMedications] Corrupted storage. Resetting.');
          await persistMeds(mockData);
        }
      } else {
        await persistMeds(mockData);
      }

      setMedications(meds);

      // Load dose log
      const logRaw = await AsyncStorage.getItem(DOSE_LOG_KEY);
      if (logRaw) {
        try {
          const parsed = JSON.parse(logRaw);
          setDoseLog(parsed);
        } catch {
          setDoseLog({});
        }
      }
    } catch (storageError) {
      console.error('[useMedications] Load failed:', storageError);
      setError('No se pudo cargar la lista de medicamentos.');
      setMedications(mockData);
    } finally {
      setIsLoading(false);
      hasLoaded.current = true;
    }
  };

  // ─── PERSIST MEDICATIONS ───────────────────────────────────────
  const persistMeds = async (data) => {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
      console.error('[useMedications] Write failed:', e);
      setError('Almacenamiento lleno. No se guardaron los cambios.');
    }
  };

  // ─── PERSIST DOSE LOG ──────────────────────────────────────────
  const persistDoseLog = async (log) => {
    try {
      // Keep only last 90 days
      const keys = Object.keys(log).sort();
      if (keys.length > 90) {
        keys.slice(0, keys.length - 90).forEach(k => delete log[k]);
      }
      await AsyncStorage.setItem(DOSE_LOG_KEY, JSON.stringify(log));
    } catch (e) {
      console.error('[useMedications] Dose log write failed:', e);
    }
  };

  // ─── RECORD DOSE (Mark as taken TODAY) ─────────────────────────
  const recordDose = useCallback(async (medId) => {
    const todayKey = getTodayKey();
    const now = new Date().toISOString();

    setDoseLog(prev => {
      const updated = { ...prev };
      if (!updated[todayKey]) updated[todayKey] = {};

      if (updated[todayKey][medId]) {
        // Already taken today → undo (remove dose record)
        delete updated[todayKey][medId];
      } else {
        // Mark as taken
        updated[todayKey][medId] = {
          takenAt: now,
          confirmed: true,
        };
      }

      persistDoseLog(updated);
      return updated;
    });
  }, []);

  // ─── CHECK IF TAKEN TODAY ──────────────────────────────────────
  const isTakenToday = useCallback((medId) => {
    const todayKey = getTodayKey();
    return !!(doseLog[todayKey] && doseLog[todayKey][medId]);
  }, [doseLog]);

  // ─── GET DOSE HISTORY FOR A MEDICATION ─────────────────────────
  const getDoseHistory = useCallback((medId, days = 7) => {
    const result = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().split('T')[0];
      const dayLog = doseLog[key] || {};
      result.push({
        date: key,
        taken: !!dayLog[medId],
        takenAt: dayLog[medId]?.takenAt || null,
      });
    }
    return result;
  }, [doseLog]);

  // ─── ADD MEDICATION ────────────────────────────────────────────
  const addMedication = useCallback(async (newMed) => {
    const notificationId = await scheduleMedicationReminder(newMed);

    const enriched = {
      ...newMed,
      notificationId,
      createdAt: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
    };

    setMedications(currentMeds => {
      const updated = [...currentMeds, enriched];
      persistMeds(updated);
      return updated;
    });
  }, []);

  // ─── DELETE MEDICATION ─────────────────────────────────────────
  const deleteMedication = useCallback(async (id) => {
    setMedications(currentMeds => {
      const medToDelete = currentMeds.find(med => med.id === id);
      if (medToDelete?.notificationId) {
        cancelMedicationReminder(medToDelete.notificationId);
      }
      const updated = currentMeds.filter(med => med.id !== id);
      persistMeds(updated);
      return updated;
    });
  }, []);

  // ─── UPDATE MEDICATION ─────────────────────────────────────────
  const updateMedication = useCallback(async (id, updatedData) => {
    setMedications(currentMeds => {
      const updated = currentMeds.map(med =>
        med.id === id ? { ...med, ...updatedData, lastUpdated: new Date().toISOString() } : med
      );
      persistMeds(updated);
      return updated;
    });
  }, []);

  // ─── CLEAR ERROR ───────────────────────────────────────────────
  const clearError = useCallback(() => setError(null), []);

  return {
    medications,
    isLoading,
    error,
    recordDose,
    isTakenToday,
    getDoseHistory,
    addMedication,
    updateMedication,
    deleteMedication,
    clearError,
  };
}
