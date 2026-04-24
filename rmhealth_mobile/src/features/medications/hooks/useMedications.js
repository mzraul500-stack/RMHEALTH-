import { useState, useEffect, useCallback, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import mockData from '../data/medications_mock.json';
import { scheduleMedicationReminder, cancelMedicationReminder, requestNotificationPermissions } from '../../../services/NotificationService';
import { saveDailySnapshot } from '../services/AdherenceTracker';

// Storage key — namespaced to avoid collisions with other modules
const STORAGE_KEY = '@rmhealth/medications';

/**
 * useMedications — Custom Hook (Medication Memory Controller)
 *
 * Centralizes all read/write operations for the medication list.
 * The UI layer (MedicationScreen) stays "stateless" and only renders
 * whatever this hook provides.
 *
 * Persistence: @react-native-async-storage/async-storage
 * Fallback:    medications_mock.json (first launch only)
 *
 * Error handling:
 *   - Corrupted JSON → resets to mock data, logs warning
 *   - Full storage   → alerts via returned `error` state
 */
export function useMedications() {
  const [medications, setMedications] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  // Track whether initial load is done (to avoid saving snapshot on first render)
  const hasLoaded = useRef(false);

  // ─── LOAD ──────────────────────────────────────────────────────
  useEffect(() => {
    loadMedications();
    requestNotificationPermissions(); // Ask for permissions on hook mount
  }, []);

  // ─── AUTO-SAVE ADHERENCE SNAPSHOT ──────────────────────────────
  // Every time medications change (after initial load), persist today's adherence
  useEffect(() => {
    if (hasLoaded.current && medications.length > 0) {
      saveDailySnapshot(medications);
    }
  }, [medications]);

  const loadMedications = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const raw = await AsyncStorage.getItem(STORAGE_KEY);

      if (raw !== null) {
        // Defensive JSON parsing — if the file is corrupted,
        // we fall back to mock data instead of crashing.
        try {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            setMedications(parsed);
          } else {
            console.warn('[useMedications] Stored data is not an array. Resetting to defaults.');
            await persistToStorage(mockData);
            setMedications(mockData);
          }
        } catch (parseError) {
          console.warn('[useMedications] Corrupted storage detected. Resetting to defaults.', parseError);
          await persistToStorage(mockData);
          setMedications(mockData);
        }
      } else {
        // First launch — seed from mock data and persist
        await persistToStorage(mockData);
        setMedications(mockData);
      }
    } catch (storageError) {
      console.error('[useMedications] AsyncStorage read failed:', storageError);
      setError('No se pudo cargar la lista de medicamentos.');
      // Graceful degradation: show mock data in memory even if disk fails
      setMedications(mockData);
    } finally {
      setIsLoading(false);
      hasLoaded.current = true;
    }
  };

  // ─── PERSIST (Internal) ────────────────────────────────────────
  const persistToStorage = async (data) => {
    try {
      const serialized = JSON.stringify(data);
      await AsyncStorage.setItem(STORAGE_KEY, serialized);
    } catch (writeError) {
      console.error('[useMedications] AsyncStorage write failed:', writeError);
      // Storage full or hardware failure — surface to UI
      setError('Almacenamiento lleno. No se guardaron los cambios.');
    }
  };

  // ─── TOGGLE TAKEN ──────────────────────────────────────────────
  const toggleTaken = useCallback(async (id) => {
    setMedications((currentMeds) => {
      const updated = currentMeds.map((med) =>
        med.id === id
          ? {
              ...med,
              taken: !med.taken,
              lastUpdated: new Date().toISOString(),
            }
          : med
      );
      // Fire-and-forget persistence (non-blocking UI)
      persistToStorage(updated);
      return updated;
    });
  }, []);

  // ─── ADD MEDICATION ────────────────────────────────────────────
  const addMedication = useCallback(async (newMed) => {
    // Schedule local notification
    const notificationId = await scheduleMedicationReminder(newMed);

    const enriched = {
      ...newMed,
      notificationId, // Store the ID to cancel it later
      createdAt: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
    };

    setMedications((currentMeds) => {
      const updated = [...currentMeds, enriched];
      persistToStorage(updated);
      return updated;
    });
  }, []);

  // ─── DELETE MEDICATION ─────────────────────────────────────────
  const deleteMedication = useCallback(async (id) => {
    setMedications((currentMeds) => {
      const medToDelete = currentMeds.find((med) => med.id === id);
      if (medToDelete?.notificationId) {
        cancelMedicationReminder(medToDelete.notificationId);
      }

      const updated = currentMeds.filter((med) => med.id !== id);
      persistToStorage(updated);
      return updated;
    });
  }, []);

  // ─── CLEAR ERROR ───────────────────────────────────────────────
  const clearError = useCallback(() => setError(null), []);

  return {
    medications,
    isLoading,
    error,
    toggleTaken,
    addMedication,
    deleteMedication,
    clearError,
  };
}
