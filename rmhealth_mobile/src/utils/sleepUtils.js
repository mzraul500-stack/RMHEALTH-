/**
 * sleepUtils.js — Pure utility functions for sleep data processing.
 *
 * DESIGN:
 *  - All functions are pure (no side effects, no API calls).
 *  - Sleep date assignment: if sleep crosses midnight, assign to wake-up date.
 *  - Duration calculations in minutes, formatted for display.
 *  - Grouping, dedup, and averages for calendar/history views.
 *  - All user-facing text returns are in Spanish.
 *
 * © 2025-2026 Morales Zepeda Raúl | INDAUTOR 03-2025-070109072500-01
 */

/**
 * Generate a stable ID for a sleep session to enable deduplication.
 * Based on startTime + endTime + source.
 */
export function generateSleepId(startTime, endTime, source = 'health_connect') {
  const raw = `${startTime}|${endTime}|${source}`;
  // Simple hash — not crypto, just for dedup
  let hash = 0;
  for (let i = 0; i < raw.length; i++) {
    const char = raw.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0; // Convert to 32bit integer
  }
  return `sleep_${Math.abs(hash).toString(36)}`;
}

/**
 * Determine the "sleep date" for a session.
 * If sleep crosses midnight, assign to the wake-up (end) date.
 * @returns {string} YYYY-MM-DD
 */
export function getSleepDate(startTime, endTime) {
  const end = new Date(endTime);
  const year = end.getFullYear();
  const month = String(end.getMonth() + 1).padStart(2, '0');
  const day = String(end.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Format minutes into "Xh YYmin" display string.
 */
export function formatSleepDuration(minutes) {
  if (!minutes || minutes <= 0) return '--';
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h === 0) return `${m} min`;
  return `${h}h ${m.toString().padStart(2, '0')}min`;
}

/**
 * Format a date string to a human-readable Spanish format.
 * e.g. "Lunes 19 mayo 2026"
 */
export function formatDateSpanish(dateStr) {
  const date = new Date(dateStr + 'T12:00:00'); // noon to avoid timezone issues
  const days = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  const months = [
    'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
    'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
  ];
  return `${days[date.getDay()]} ${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
}

/**
 * Format time from ISO string to "HH:MM" local time.
 */
export function formatTimeShort(isoString) {
  if (!isoString) return '--';
  const d = new Date(isoString);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
}

/**
 * Normalize a raw Health Connect sleep record into our standard format.
 */
export function normalizeSleepRecord(record, source = 'health_connect') {
  const startTime = record.startTime;
  const endTime = record.endTime;
  const durationMinutes = Math.round((new Date(endTime) - new Date(startTime)) / 60000);
  const date = getSleepDate(startTime, endTime);

  // Extract stages
  const stages = {
    awake_minutes: 0,
    light_minutes: 0,
    deep_minutes: 0,
    rem_minutes: 0,
    unknown_minutes: 0,
  };

  if (record.stages && Array.isArray(record.stages)) {
    for (const stage of record.stages) {
      const stageStart = new Date(stage.startTime);
      const stageEnd = new Date(stage.endTime);
      const stageMin = Math.round((stageEnd - stageStart) / 60000);
      const stageType = typeof stage.stage === 'number' ? stage.stage : parseInt(stage.stage, 10);

      switch (stageType) {
        case 1: stages.awake_minutes += stageMin; break;
        case 4: stages.light_minutes += stageMin; break;
        case 5: stages.deep_minutes += stageMin; break;
        case 6: stages.rem_minutes += stageMin; break;
        default: stages.unknown_minutes += stageMin; break;
      }
    }
  }

  const sourcePackage = record.metadata?.dataOrigin?.packageName
    || record.metadata?.dataOrigin
    || null;

  return {
    id: generateSleepId(startTime, endTime, source),
    date,
    sleep_start_time: startTime,
    sleep_end_time: endTime,
    duration_minutes: durationMinutes,
    duration_hours: Math.round((durationMinutes / 60) * 10) / 10,
    source,
    source_package: sourcePackage,
    stages,
    is_real_data: true,
    synced_to_backend: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

/**
 * Deduplicate sleep records by their stable ID.
 * Newer records (by updated_at) take priority.
 */
export function deduplicateSleepRecords(records) {
  const map = new Map();
  for (const rec of records) {
    const existing = map.get(rec.id);
    if (!existing || rec.updated_at > existing.updated_at) {
      map.set(rec.id, rec);
    }
  }
  return Array.from(map.values());
}

/**
 * Merge new records into existing history with dedup.
 * Returns merged array sorted by date descending, trimmed to maxDays.
 */
export function mergeSleepHistory(existingRecords, newRecords, maxDays = 90) {
  const all = [...existingRecords, ...newRecords];
  const deduped = deduplicateSleepRecords(all);

  // Sort by date descending (newest first)
  deduped.sort((a, b) => b.date.localeCompare(a.date));

  // Trim to max days
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - maxDays);
  const cutoffStr = cutoffDate.toISOString().split('T')[0];

  return deduped.filter(r => r.date >= cutoffStr);
}

/**
 * Group sleep records by date.
 * Returns array of { date, records[], totalMinutes, startTime, endTime }.
 */
export function groupSleepByDate(records) {
  const map = new Map();

  for (const rec of records) {
    if (!map.has(rec.date)) {
      map.set(rec.date, []);
    }
    map.get(rec.date).push(rec);
  }

  const grouped = [];
  for (const [date, recs] of map.entries()) {
    const totalMinutes = recs.reduce((sum, r) => sum + (r.duration_minutes || 0), 0);

    // Find earliest start and latest end for the day
    const starts = recs.map(r => r.sleep_start_time).filter(Boolean).sort();
    const ends = recs.map(r => r.sleep_end_time).filter(Boolean).sort();

    grouped.push({
      date,
      records: recs,
      totalMinutes,
      startTime: starts[0] || null,
      endTime: ends[ends.length - 1] || null,
      sessionCount: recs.length,
      source: recs[0]?.source || 'health_connect',
    });
  }

  // Sort by date descending
  grouped.sort((a, b) => b.date.localeCompare(a.date));
  return grouped;
}

/**
 * Calculate daily sleep summary with averages.
 */
export function calculateSleepAverages(records) {
  if (!records || records.length === 0) {
    return {
      avg_7d: null,
      avg_30d: null,
      days_with_data_7d: 0,
      days_with_data_30d: 0,
      total_records: 0,
    };
  }

  const now = new Date();
  const cutoff7d = new Date(now);
  cutoff7d.setDate(cutoff7d.getDate() - 7);
  const cutoff30d = new Date(now);
  cutoff30d.setDate(cutoff30d.getDate() - 30);

  const cutoff7dStr = cutoff7d.toISOString().split('T')[0];
  const cutoff30dStr = cutoff30d.toISOString().split('T')[0];

  // Group by date first to get daily totals
  const grouped = groupSleepByDate(records);

  const days7d = grouped.filter(g => g.date >= cutoff7dStr);
  const days30d = grouped.filter(g => g.date >= cutoff30dStr);

  const avg7d = days7d.length > 0
    ? Math.round(days7d.reduce((s, d) => s + d.totalMinutes, 0) / days7d.length)
    : null;
  const avg30d = days30d.length > 0
    ? Math.round(days30d.reduce((s, d) => s + d.totalMinutes, 0) / days30d.length)
    : null;

  return {
    avg_7d: avg7d,
    avg_30d: avg30d,
    days_with_data_7d: days7d.length,
    days_with_data_30d: days30d.length,
    total_records: records.length,
  };
}
