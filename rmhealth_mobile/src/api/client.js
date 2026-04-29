// API configuration — loaded from environment variables.
// Set EXPO_PUBLIC_API_BASE_URL and EXPO_PUBLIC_API_TOKEN in your .env file.
// See .env.example for reference.
const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL
  || 'https://rmhealth-api-292048010515.us-central1.run.app/api';

const STATIC_TOKEN = process.env.EXPO_PUBLIC_API_TOKEN;

if (!STATIC_TOKEN) {
  console.warn(
    '[RMHealth] WARNING: EXPO_PUBLIC_API_TOKEN is not set. ' +
    'Authenticated API calls require a JWT token from AuthContext.'
  );
}

/**
 * Resolve the best auth token available.
 * Priority: 1) JWT from AuthContext, 2) Static env token.
 */
function resolveToken(authToken) {
  const token = authToken || STATIC_TOKEN;
  if (!token) {
    throw new Error('No authentication token available. Log in or set EXPO_PUBLIC_API_TOKEN in .env');
  }
  return token;
}

/**
 * Service to handle communications with RMHealth Backend.
 * All methods accept an optional `authToken` parameter (JWT from AuthContext).
 * Falls back to the static EXPO_PUBLIC_API_TOKEN for backward compatibility.
 */
export const apiService = {
  /**
   * Sends vital signs to the server
   * @param {Object} vitalsData - The vital signs data to send
   * @param {string} [authToken] - JWT from AuthContext (preferred)
   */
  sendVitals: async (vitalsData, authToken = null) => {
    const token = resolveToken(authToken);
    try {
      const response = await fetch(`${API_BASE_URL}/vital-signs`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(vitalsData),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        console.error(`[RMHealth API] Status ${response.status} — Detail: ${errorBody}`);
        throw new Error(`API Error: ${response.status} — ${errorBody}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error sending vitals to API:', error);
      throw error;
    }
  },

  /**
   * Fetch vital signs history (last 30 days) — M4
   * @param {string} [authToken] - JWT from AuthContext
   */
  getVitalHistory: async (authToken = null) => {
    const token = resolveToken(authToken);
    try {
      const response = await fetch(`${API_BASE_URL}/vital-signs`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`API Error: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error fetching vital history:', error);
      return { status: 'error', records: [], count: 0 };
    }
  },

  /**
   * Fetch 7-day trend stats for bar charts — M4
   * @param {string} [authToken] - JWT from AuthContext
   */
  getVitalTrends: async (authToken = null) => {
    const token = resolveToken(authToken);
    try {
      const response = await fetch(`${API_BASE_URL}/vital-signs/trends`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`API Error: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error fetching vital trends:', error);
      return { status: 'error', stats: {}, daily: [] };
    }
  },

  /**
   * Simple health check (no auth required)
   */
  checkHealth: async () => {
    try {
      const response = await fetch(`${API_BASE_URL.replace('/api', '')}/health`);
      return await response.json();
    } catch (error) {
      console.error('Health check failed:', error);
      return { status: 'offline' };
    }
  },

  /**
   * Fetch emergency history
   * @param {string} [authToken] - JWT from AuthContext
   */
  getEmergencyHistory: async (authToken = null) => {
    const token = resolveToken(authToken);
    try {
      const response = await fetch(`${API_BASE_URL}/emergencies/history`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`API Error: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error fetching emergency history:', error);
      return { status: 'error', history: [], count: 0 };
    }
  },

  /**
   * Fetch preventive alerts for a user
   * @param {string} userId - The user ID
   * @param {string} [authToken] - JWT from AuthContext
   */
  getPreventiveAlerts: async (userId, authToken = null) => {
    const token = resolveToken(authToken);
    try {
      const response = await fetch(`${API_BASE_URL}/users/${encodeURIComponent(userId)}/preventive-alerts`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`API Error: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error fetching preventive alerts:', error);
      return { status: 'error', alerts: [], count: 0 };
    }
  },

  /**
   * Acknowledge (mark as seen) a preventive alert
   * @param {string} alertId - The alert UUID
   * @param {string} [authToken] - JWT from AuthContext
   */
  acknowledgeAlert: async (alertId, authToken = null) => {
    const token = resolveToken(authToken);
    try {
      const response = await fetch(`${API_BASE_URL}/preventive-alerts/${alertId}/acknowledge`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`API Error: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error acknowledging alert:', error);
      return { status: 'error' };
    }
  },

  /**
   * Respond to a preventive alert (false alarm or need help)
   * @param {string} alertId - The alert UUID
   * @param {string} responseType - 'false_alarm' or 'need_help'
   * @param {string} [reason] - Required for false_alarm responses
   * @param {string} [authToken] - JWT from AuthContext
   */
  respondToAlert: async (alertId, responseType, reason = null, authToken = null) => {
    const token = resolveToken(authToken);
    try {
      const response = await fetch(`${API_BASE_URL}/preventive-alerts/${alertId}/respond`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ response_type: responseType, reason }),
      });

      if (!response.ok) {
        throw new Error(`API Error: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error responding to alert:', error);
      return { status: 'error' };
    }
  },

  // ── Medications CRUD (M5) ───────────────────────────────────────

  getMedications: async (authToken = null) => {
    const token = resolveToken(authToken);
    try {
      const response = await fetch(`${API_BASE_URL}/medications`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (!response.ok) throw new Error(`API Error: ${response.status}`);
      return await response.json();
    } catch (error) {
      console.error('[API] getMedications error:', error);
      return { status: 'error', medications: [] };
    }
  },

  createMedication: async (medData, authToken = null) => {
    const token = resolveToken(authToken);
    try {
      const response = await fetch(`${API_BASE_URL}/medications`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(medData),
      });
      if (!response.ok) throw new Error(`API Error: ${response.status}`);
      return await response.json();
    } catch (error) {
      console.error('[API] createMedication error:', error);
      return { status: 'error' };
    }
  },

  updateMedication: async (medId, medData, authToken = null) => {
    const token = resolveToken(authToken);
    try {
      const response = await fetch(`${API_BASE_URL}/medications/${medId}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(medData),
      });
      if (!response.ok) throw new Error(`API Error: ${response.status}`);
      return await response.json();
    } catch (error) {
      console.error('[API] updateMedication error:', error);
      return { status: 'error' };
    }
  },

  deleteMedication: async (medId, authToken = null) => {
    const token = resolveToken(authToken);
    try {
      const response = await fetch(`${API_BASE_URL}/medications/${medId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (!response.ok) throw new Error(`API Error: ${response.status}`);
      return await response.json();
    } catch (error) {
      console.error('[API] deleteMedication error:', error);
      return { status: 'error' };
    }
  },

  recordDose: async (medId, authToken = null) => {
    const token = resolveToken(authToken);
    try {
      const response = await fetch(`${API_BASE_URL}/medications/${medId}/dose`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (!response.ok) throw new Error(`API Error: ${response.status}`);
      return await response.json();
    } catch (error) {
      console.error('[API] recordDose error:', error);
      return { status: 'error' };
    }
  },

  getAdherence: async (authToken = null) => {
    const token = resolveToken(authToken);
    try {
      const response = await fetch(`${API_BASE_URL}/medications/adherence`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (!response.ok) throw new Error(`API Error: ${response.status}`);
      return await response.json();
    } catch (error) {
      console.error('[API] getAdherence error:', error);
      return { status: 'error', adherence_pct: 0 };
    }
  },

  // ── Multi-Actor Link Management (M7) ────────────────────────────

  getMyDoctors: async (authToken = null) => {
    const token = resolveToken(authToken);
    try {
      const response = await fetch(`${API_BASE_URL}/patient/links`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (!response.ok) throw new Error(`API Error: ${response.status}`);
      return await response.json();
    } catch (error) {
      console.error('[API] getMyDoctors error:', error);
      return { status: 'error', links: [] };
    }
  },

  acceptDoctorInvite: async (inviteCode, authToken = null) => {
    const token = resolveToken(authToken);
    try {
      const response = await fetch(`${API_BASE_URL}/patient/links/accept`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ invite_code: inviteCode }),
      });
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.detail || `Error ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      console.error('[API] acceptDoctorInvite error:', error);
      return { status: 'error', message: error.message };
    }
  },

  revokeDoctorLink: async (linkId, authToken = null) => {
    const token = resolveToken(authToken);
    try {
      const response = await fetch(`${API_BASE_URL}/patient/links/${linkId}/revoke`, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (!response.ok) throw new Error(`API Error: ${response.status}`);
      return await response.json();
    } catch (error) {
      console.error('[API] revokeDoctorLink error:', error);
      return { status: 'error' };
    }
  },
};
