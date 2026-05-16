import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { Alert } from 'react-native';

const LOCATION_TASK_NAME = 'background-location-task';

/**
 * LocationService — Real-time and Background tracking for RMHealth.
 * Fulfills the "Always Protected" mission by ensuring coordinates are 
 * available even if the user is unconscious.
 */
export const LocationService = {
  /**
   * Request critical permissions.
   * Explains to the user why "Always Allow" is vital.
   */
  async requestPermissions(language = 'es') {
    const { status: fgStatus } = await Location.requestForegroundPermissionsAsync();
    
    if (fgStatus !== 'granted') {
      Alert.alert(
        language === 'en' ? 'Permission Required' : 'Permiso Necesario',
        language === 'en' 
          ? 'Location access is vital to send help if you faint.' 
          : 'El acceso a la ubicación es vital para enviar ayuda si te desmayas.'
      );
      return false;
    }

    const { status: bgStatus } = await Location.requestBackgroundPermissionsAsync();
    if (bgStatus !== 'granted') {
      Alert.alert(
        language === 'en' ? 'Rescue Protection' : 'Protección de Rescate',
        language === 'en'
          ? 'To send an ambulance if you lose consciousness, please select "Allow all the time".'
          : 'Para poder enviar una ambulancia si pierdes el conocimiento, por favor selecciona "Permitir siempre".'
      );
      return false;
    }

    return true;
  },

  /**
   * Get current one-shot position
   */
  async getCurrentLocation() {
    try {
      // Try to get a fast last known position first
      const lastKnown = await Location.getLastKnownPositionAsync();
      
      // Request a fresh one but with a strict timeout of 5 seconds
      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
        timeout: 5000,
      });

      return {
        lat: location?.coords?.latitude || lastKnown?.coords?.latitude || 16.8634,
        lon: location?.coords?.longitude || lastKnown?.coords?.longitude || -99.8901,
      };
    } catch (e) {
      console.warn('[LocationService] Timeout or error getting position, using fallback:', e);
      // Try one last time for any known position
      const fallback = await Location.getLastKnownPositionAsync();
      return { 
        lat: fallback?.coords?.latitude || 16.8634, 
        lon: fallback?.coords?.longitude || -99.8901 
      };
    }
  },

  /**
   * Start persistent background monitoring
   */
  async startBackgroundTracking() {
    try {
      const { status: bgStatus } = await Location.getBackgroundPermissionsAsync();
      if (bgStatus !== 'granted') {
        console.log('[LocationService] Background tracking aborted: Permission not granted.');
        return;
      }

      const hasStarted = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME);
      if (!hasStarted) {
        await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, {
          accuracy: Location.Accuracy.Balanced,
          timeInterval: 300000, // 5 min intervals to save battery
          distanceInterval: 100,
          foregroundService: {
            notificationTitle: "RMHealth Guardian",
            notificationBody: "Protección activa en segundo plano",
            notificationColor: "#EF4444",
          },
        });
        console.log('[LocationService] Background tracking started.');
      }
    } catch (e) {
      console.log('[LocationService] Failed to start bg tracking:', e?.message || e);
    }
  }
};

// Define the background task
TaskManager.defineTask(LOCATION_TASK_NAME, ({ data, error }) => {
  if (error) {
    console.error('[TaskManager] Location error:', error);
    return;
  }
  if (data) {
    const { locations } = data;
    // Log location (in production, we'd sync this to the backend periodically)
    // console.log('[Background Location Update]', locations[0].coords);
  }
});
