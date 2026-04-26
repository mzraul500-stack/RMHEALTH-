// API configuration — loaded from environment variables.
// Set EXPO_PUBLIC_API_BASE_URL and EXPO_PUBLIC_API_TOKEN in your .env file.
// See .env.example for reference.
const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL
  || 'https://rmhealth-api-292048010515.us-central1.run.app/api';

const AUTH_TOKEN = process.env.EXPO_PUBLIC_API_TOKEN;

if (!AUTH_TOKEN) {
  console.warn(
    '[RMHealth] WARNING: EXPO_PUBLIC_API_TOKEN is not set. ' +
    'API calls will fail. Create a .env file with EXPO_PUBLIC_API_TOKEN=your_token'
  );
}

/**
 * Service to handle communications with RMHealth Backend.
 * Tokens are loaded from environment variables — never hardcoded.
 */
export const apiService = {
  /**
   * Sends vital signs to the server
   * @param {Object} vitalsData - The vital signs data to send
   */
  sendVitals: async (vitalsData) => {
    if (!AUTH_TOKEN) {
      throw new Error('API token not configured. Set EXPO_PUBLIC_API_TOKEN in .env');
    }
    try {
      const response = await fetch(`${API_BASE_URL}/vital-signs`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${AUTH_TOKEN}`,
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

  getEmergencyHistory: async () => {
    if (!AUTH_TOKEN) {
      return { status: 'error', history: [], count: 0 };
    }
    try {
      const response = await fetch(`${API_BASE_URL}/emergencies/history`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${AUTH_TOKEN}`,
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
   */
  getPreventiveAlerts: async (userId) => {
    if (!AUTH_TOKEN) {
      return { status: 'error', alerts: [], count: 0 };
    }
    try {
      const response = await fetch(`${API_BASE_URL}/users/${encodeURIComponent(userId)}/preventive-alerts`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${AUTH_TOKEN}`,
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
   */
  acknowledgeAlert: async (alertId) => {
    if (!AUTH_TOKEN) {
      return { status: 'error' };
    }
    try {
      const response = await fetch(`${API_BASE_URL}/preventive-alerts/${alertId}/acknowledge`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${AUTH_TOKEN}`,
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
  }
};
