import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

// Configure notification behavior
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

/**
 * Request user permission for notifications
 */
export async function requestNotificationPermissions() {
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;
  
  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  
  return finalStatus === 'granted';
}

/**
 * Parses time strings like "08:00 AM" to hour and minute
 */
function parseTimeString(timeStr) {
  if (!timeStr) return null;
  const match = timeStr.match(/(\d+):(\d+)\s*(AM|PM)/i);
  if (!match) return null;
  
  let hour = parseInt(match[1], 10);
  const minute = parseInt(match[2], 10);
  const ampm = match[3].toUpperCase();
  
  if (ampm === 'PM' && hour < 12) hour += 12;
  if (ampm === 'AM' && hour === 12) hour = 0;
  
  return { hour, minute };
}

/**
 * Schedules a daily reminder for a medication
 * Returns the notification ID
 */
export async function scheduleMedicationReminder(medication) {
  const hasPermission = await requestNotificationPermissions();
  if (!hasPermission) return null;
  
  const time = parseTimeString(medication.time);
  if (!time) return null;

  try {
    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title: '💊 Hora de tu medicina',
        body: `Es hora de tomar ${medication.name} (${medication.dosage})`,
        subtitle: medication.frequency || '',
        sound: true,
        data: { medicationId: medication.id },
      },
      trigger: {
        type: 'daily',
        hour: time.hour,
        minute: time.minute,
      },
    });
    console.log(`[NotificationService] Scheduled "${medication.name}" at ${time.hour}:${time.minute} → ID: ${id}`);
    return id;
  } catch (error) {
    console.error('[NotificationService] Error scheduling notification:', error);
    return null;
  }
}

/**
 * Cancels a previously scheduled reminder
 */
export async function cancelMedicationReminder(notificationId) {
  if (notificationId) {
    try {
      await Notifications.cancelScheduledNotificationAsync(notificationId);
    } catch (error) {
      console.error('[NotificationService] Error canceling notification:', error);
    }
  }
}
