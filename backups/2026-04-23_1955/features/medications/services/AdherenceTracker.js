import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * AdherenceTracker — Persistent daily adherence history.
 *
 * Stores a daily snapshot of medication adherence in AsyncStorage.
 * Format: { "2026-04-23": { total: 3, taken: 2, percentage: 67 }, ... }
 *
 * The tracker saves a snapshot at the END of each day (or when the user
 * leaves the Medications screen), and exposes the last 7/30 days for
 * the weekly and monthly views.
 */

const ADHERENCE_KEY = '@rmhealth/adherence_history';

/**
 * Get today's date as YYYY-MM-DD string
 */
function getTodayKey() {
  const now = new Date();
  return now.toISOString().split('T')[0];
}

/**
 * Save today's adherence snapshot
 * @param {Array} medications - Current medications array
 */
export async function saveDailySnapshot(medications) {
  try {
    const raw = await AsyncStorage.getItem(ADHERENCE_KEY);
    const history = raw ? JSON.parse(raw) : {};

    const today = getTodayKey();
    const total = medications.length;
    const taken = medications.filter(m => m.taken).length;
    const percentage = total === 0 ? 0 : Math.round((taken / total) * 100);

    history[today] = {
      total,
      taken,
      percentage,
      timestamp: new Date().toISOString(),
    };

    // Keep only last 90 days to prevent storage bloat
    const keys = Object.keys(history).sort();
    if (keys.length > 90) {
      const toRemove = keys.slice(0, keys.length - 90);
      toRemove.forEach(key => delete history[key]);
    }

    await AsyncStorage.setItem(ADHERENCE_KEY, JSON.stringify(history));
    return history[today];
  } catch (error) {
    console.error('[AdherenceTracker] Failed to save snapshot:', error);
    return null;
  }
}

/**
 * Get adherence history for the last N days
 * @param {number} days - Number of days to retrieve (default: 7)
 * @returns {Array} Array of { date, total, taken, percentage } sorted by date
 */
export async function getAdherenceHistory(days = 7) {
  try {
    const raw = await AsyncStorage.getItem(ADHERENCE_KEY);
    if (!raw) return generateEmptyHistory(days);

    const history = JSON.parse(raw);
    const result = [];

    for (let i = days - 1; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const key = date.toISOString().split('T')[0];

      if (history[key]) {
        result.push({
          date: key,
          dayLabel: getDayLabel(date),
          ...history[key],
        });
      } else {
        result.push({
          date: key,
          dayLabel: getDayLabel(date),
          total: 0,
          taken: 0,
          percentage: 0,
        });
      }
    }

    return result;
  } catch (error) {
    console.error('[AdherenceTracker] Failed to read history:', error);
    return generateEmptyHistory(days);
  }
}

/**
 * Calculate weekly average adherence
 */
export async function getWeeklyAverage() {
  const history = await getAdherenceHistory(7);
  const daysWithData = history.filter(d => d.total > 0);
  if (daysWithData.length === 0) return 0;

  const sum = daysWithData.reduce((acc, d) => acc + d.percentage, 0);
  return Math.round(sum / daysWithData.length);
}

/**
 * Get the 3-letter day label for a date in Spanish
 */
function getDayLabel(date) {
  const days = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
  return days[date.getDay()];
}

/**
 * Generate empty history array for N days
 */
function generateEmptyHistory(days) {
  const result = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    result.push({
      date: date.toISOString().split('T')[0],
      dayLabel: getDayLabel(date),
      total: 0,
      taken: 0,
      percentage: 0,
    });
  }
  return result;
}
