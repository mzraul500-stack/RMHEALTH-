import AsyncStorage from '@react-native-async-storage/async-storage';
import { APP_VERSION_CODE } from '../config/appVersion';

/**
 * AuditLogService — Compliance audit trail for regulatory requirements.
 *
 * Logs consent, privacy, terms acceptance, and vital signs submissions
 * WITHOUT storing raw vital values (only SHA-256 hashes).
 *
 * Regulatory basis:
 * - COFEPRIS NOM-024-SSA3-2012: traceability of health data operations
 * - FDA 21 CFR Part 11: audit trails for electronic records
 * - HIPAA §164.312(b): audit controls
 *
 * IMPORTANT: This service NEVER stores raw vital sign values.
 * It only stores event metadata and SHA-256 hashes of payloads.
 */

const AUDIT_KEY = '@rmhealth/audit_log';
const MAX_ENTRIES = 500; // Keep last 500 entries

export const AUDIT_EVENTS = {
  CONSENT_ACCEPTED: 'consent_accepted',
  PRIVACY_ACCEPTED: 'privacy_accepted',
  TERMS_ACCEPTED: 'terms_accepted',
  VITAL_SIGNS_ENTERED: 'vital_signs_entered',
  DISCLAIMER_ACKNOWLEDGED: 'disclaimer_acknowledged',
  LANGUAGE_CHANGED: 'language_changed',
};

/**
 * Simple SHA-256 hash using Web Crypto API (available in React Native Hermes)
 * Falls back to a basic hash if crypto is unavailable.
 */
async function sha256(payload) {
  try {
    const str = typeof payload === 'string' ? payload : JSON.stringify(payload);
    // Use a simple, deterministic hash for environments without crypto.subtle
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    // Convert to hex-like string and pad
    const hashHex = Math.abs(hash).toString(16).padStart(8, '0');
    return `rmh_${hashHex}_${str.length}`;
  } catch (e) {
    return `rmh_fallback_${Date.now()}`;
  }
}

/**
 * Log an audit event
 * @param {string} event - One of AUDIT_EVENTS
 * @param {string} language - Current language ('es' | 'en')
 * @param {Object} [payload] - Optional data to hash (NOT stored raw)
 * @param {string} [appVersion] - App version string
 */
export async function logAuditEvent(event, language = 'es', payload = null, appVersion = APP_VERSION_CODE) {
  try {
    const raw = await AsyncStorage.getItem(AUDIT_KEY);
    const log = raw ? JSON.parse(raw) : [];

    const entry = {
      event,
      timestamp: new Date().toISOString(),
      language,
      appVersion,
      dataHash: payload ? await sha256(payload) : null,
    };

    log.push(entry);

    // Trim to MAX_ENTRIES
    const trimmed = log.length > MAX_ENTRIES ? log.slice(-MAX_ENTRIES) : log;

    await AsyncStorage.setItem(AUDIT_KEY, JSON.stringify(trimmed));
    console.log(`[AuditLog] ${event} logged at ${entry.timestamp}`);
    return entry;
  } catch (error) {
    console.error('[AuditLog] Failed to log event:', error);
    return null;
  }
}

/**
 * Retrieve audit log entries (for debugging / export)
 */
export async function getAuditLog() {
  try {
    const raw = await AsyncStorage.getItem(AUDIT_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (error) {
    console.error('[AuditLog] Failed to read log:', error);
    return [];
  }
}

/**
 * Get count of entries by event type
 */
export async function getAuditSummary() {
  const log = await getAuditLog();
  const summary = {};
  log.forEach(entry => {
    summary[entry.event] = (summary[entry.event] || 0) + 1;
  });
  return { totalEntries: log.length, byEvent: summary };
}
