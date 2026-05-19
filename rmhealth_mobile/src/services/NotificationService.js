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

/**
 * Cancel ALL scheduled notifications (clean slate before re-sync)
 */
export async function cancelAllReminders() {
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
    console.log('[NotificationService] All scheduled notifications cancelled.');
  } catch (error) {
    console.error('[NotificationService] Error canceling all notifications:', error);
  }
}

/**
 * Returns currently scheduled notifications (for debug/verification)
 */
export async function getScheduledReminders() {
  try {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    console.log('[NotificationService] Currently scheduled:', scheduled.length);
    return scheduled;
  } catch (error) {
    console.error('[NotificationService] Error getting scheduled:', error);
    return [];
  }
}

/**
 * Sync ALL medication reminders — call on app startup.
 * 
 * Strategy: cancel all existing medication notifications, then re-schedule
 * for each active medication. This avoids duplicates and ensures all
 * reminders survive app restarts / device reboots.
 * 
 * @param {Array} medications - List of medication objects with { id, name, dosage, time, frequency }
 * @returns {Promise<Object>} Map of medicationId → notificationId
 */
export async function syncAllMedicationReminders(medications) {
  if (!medications || medications.length === 0) {
    console.log('[NotificationService] No medications to sync.');
    return {};
  }

  const hasPermission = await requestNotificationPermissions();
  if (!hasPermission) {
    console.log('[NotificationService] Notification permission denied. Skipping sync.');
    return {};
  }

  // Cancel all existing scheduled notifications to avoid duplicates
  await cancelAllReminders();

  const idMap = {};
  let scheduled = 0;
  let skipped = 0;

  for (const med of medications) {
    const time = parseTimeString(med.time);
    if (!time) {
      console.log(`[NotificationService] Skipping "${med.name}" — no valid time.`);
      skipped++;
      continue;
    }

    try {
      const id = await Notifications.scheduleNotificationAsync({
        content: {
          title: '💊 Hora de tu medicina',
          body: `Es hora de tomar ${med.name} (${med.dosage || ''})`,
          subtitle: med.frequency || '',
          sound: true,
          data: { medicationId: med.id },
        },
        trigger: {
          type: 'daily',
          hour: time.hour,
          minute: time.minute,
        },
      });
      idMap[med.id] = id;
      scheduled++;
    } catch (error) {
      console.error(`[NotificationService] Error scheduling "${med.name}":`, error);
      skipped++;
    }
  }

  console.log(`[NotificationService] Sync complete: ${scheduled} scheduled, ${skipped} skipped.`);
  return idMap;
}
