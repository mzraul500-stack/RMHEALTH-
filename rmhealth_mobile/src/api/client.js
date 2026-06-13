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

// ── Timeout & Retry Configuration ─────────────────────────────
// Cloud Run cold starts can take 8-15s. Default fetch has no timeout,
// causing React Native to surface a generic "Network Error" too early.
const DEFAULT_TIMEOUT_MS = 20000;   // 20s for normal endpoints
const ANALYSIS_TIMEOUT_MS = 30000;  // 30s for vital-signs analysis (cold start + ML model load)
const RETRY_DELAY_MS = 2500;        // 2.5s wait before retry
const MAX_RETRIES = 1;              // one automatic retry for cold-start errors

/**
 * Errors that indicate a Cloud Run cold start (safe to retry).
 * Does NOT retry on 401, 403, 422 or successful error responses.
 */
function isColdStartError(error, response) {
  if (error) {
    const msg = error.message || '';
    return (
      error.name === 'AbortError' ||               // timeout
      msg.includes('Network') ||                    // network failure
      msg.includes('fetch') ||                      // fetch failed
      msg.includes('Failed to fetch') ||
      msg.includes('timeout')
    );
  }
  if (response) {
    return response.status === 503 || response.status === 504;
  }
  return false;
}

/**
 * Enhanced fetch with timeout + one retry for cold-start scenarios.
 * @param {string} url 
 * @param {Object} options - fetch options
 * @param {number} timeoutMs - timeout in milliseconds
 * @param {Function} onRetry - optional callback when retrying (for UX status)
 * @returns {Promise<Response>}
 */
async function fetchWithRetry(url, options = {}, timeoutMs = DEFAULT_TIMEOUT_MS, onRetry = null) {
  let lastError = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      // If 503/504 and we have retries left, wait and retry
      if (isColdStartError(null, response) && attempt < MAX_RETRIES) {
        console.warn(`[RMHealth API] Cold start detected (${response.status}), retrying in ${RETRY_DELAY_MS}ms...`);
        if (onRetry) onRetry(attempt + 1);
        await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
        continue;
      }

      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      lastError = error;

      if (isColdStartError(error) && attempt < MAX_RETRIES) {
        console.warn(`[RMHealth API] Cold start timeout, retrying in ${RETRY_DELAY_MS}ms...`, error.message);
        if (onRetry) onRetry(attempt + 1);
        await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
        continue;
      }

      throw error;
    }
  }

  // Should not reach here, but safety net
  throw lastError || new Error('fetchWithRetry exhausted retries');
}

/**
 * Classify an API error for user-facing messages.
 * @param {Error} error
 * @param {number} [statusCode]
 * @returns {{ type: string, esMsg: string, enMsg: string }}
 */
function classifyError(error, statusCode = null) {
  if (statusCode === 401 || statusCode === 403) {
    return {
      type: 'auth',
      esMsg: 'Revalidando tu sesión. Intenta de nuevo en un momento.',
      enMsg: 'Revalidating your session. Please try again in a moment.',
    };
  }
  if (statusCode === 429) {
    return {
      type: 'rate_limit',
      esMsg: 'Demasiados intentos. Espera un momento y vuelve a intentar.',
      enMsg: 'Too many attempts. Wait a moment and try again.',
    };
  }
  if (statusCode === 500 || statusCode === 503 || statusCode === 504) {
    return {
      type: 'server',
      esMsg: 'El servicio está temporalmente no disponible. Intenta de nuevo en unos segundos.',
      enMsg: 'The service is temporarily unavailable. Try again in a few seconds.',
    };
  }
  const msg = error?.message || '';
  const isOffline = msg.includes('Network') || msg.includes('fetch') || msg.includes('Failed to fetch');
  const isTimeout = error?.name === 'AbortError' || msg.includes('timeout');
  if (isTimeout) {
    return {
      type: 'timeout',
      esMsg: 'No se pudo conectar con el servidor. Revisa tu conexión e intenta de nuevo.',
      enMsg: 'Could not connect to the server. Check your connection and try again.',
    };
  }
  if (isOffline) {
    return {
      type: 'offline',
      esMsg: 'Sin conexión a Internet. Revisa tu red e intenta de nuevo.',
      enMsg: 'No internet connection. Check your network and try again.',
    };
  }
  return {
    type: 'unknown',
    esMsg: 'Ocurrió un error inesperado. Intenta de nuevo.',
    enMsg: 'An unexpected error occurred. Please try again.',
  };
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
 * 401 Interceptor — Auto-refresh token and retry on auth errors.
 *
 * When any API call returns 401, this function:
 * 1. Reads the refresh token from SecureStore
 * 2. Calls /auth/refresh to get new tokens
 * 3. Saves new tokens to SecureStore
 * 4. Retries the original request with the new access token
 *
 * This makes token expiration completely transparent to the user.
 * The interceptor reads/writes SecureStore directly (shared with AuthContext)
 * to avoid circular imports.
 */
let _refreshPromise = null;

async function refreshTokenAndRetry(originalUrl, originalOptions, timeoutMs) {
  // Deduplicate concurrent refresh calls
  if (!_refreshPromise) {
    _refreshPromise = (async () => {
      try {
        const SecureStore = require('expo-secure-store');
        const refreshToken = await SecureStore.getItemAsync('rmhealth_refresh_token');
        const userData = await SecureStore.getItemAsync('rmhealth_user_data');

        if (!refreshToken || !userData) {
          console.warn('[API Client] No refresh token available for 401 retry');
          return null;
        }

        const parsedUser = JSON.parse(userData);
        const controller = new AbortController();
        const tid = setTimeout(() => controller.abort(), 15000);

        try {
          const res = await fetch(`${API_BASE_URL}/auth/refresh`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              refresh_token: refreshToken,
              user_id: parsedUser.id,
            }),
            signal: controller.signal,
          });

          clearTimeout(tid);

          if (!res.ok) {
            console.warn(`[API Client] Token refresh failed: ${res.status}`);
            return null;
          }

          const data = await res.json();
          // Save new tokens to SecureStore (AuthContext will pick them up)
          await SecureStore.setItemAsync('rmhealth_access_token', data.access_token);
          if (data.refresh_token) {
            await SecureStore.setItemAsync('rmhealth_refresh_token', data.refresh_token);
          }
          await SecureStore.setItemAsync('rmhealth_last_refresh_ts', Date.now().toString());

          console.log('[API Client] Token refreshed via 401 interceptor');
          return data.access_token;
        } catch (e) {
          clearTimeout(tid);
          console.warn('[API Client] Token refresh error:', e?.message);
          return null;
        }
      } finally {
        _refreshPromise = null;
      }
    })();
  }

  const newToken = await _refreshPromise;
  if (!newToken) return null;

  // Retry the original request with the new token
  const retryOptions = {
    ...originalOptions,
    headers: {
      ...originalOptions.headers,
      'Authorization': `Bearer ${newToken}`,
    },
  };

  // Remove signal from retry (create fresh one)
  delete retryOptions.signal;

  try {
    return await fetchWithRetry(originalUrl, retryOptions, timeoutMs);
  } catch (e) {
    console.warn('[API Client] Retry after refresh failed:', e?.message);
    return null;
  }
}

/**
 * Enhanced fetch that handles 401 automatically via token refresh.
 * Use this instead of fetchWithRetry for authenticated endpoints.
 */
async function fetchAuthenticated(url, options = {}, timeoutMs = DEFAULT_TIMEOUT_MS, onRetry = null) {
  const response = await fetchWithRetry(url, options, timeoutMs, onRetry);

  // If 401, try to refresh token and retry once
  if (response.status === 401) {
    console.log('[API Client] Got 401 — attempting auto-refresh...');
    const retryResponse = await refreshTokenAndRetry(url, options, timeoutMs);
    if (retryResponse) {
      return retryResponse;
    }
  }

  return response;
}

/**
 * Service to handle communications with RMHealth Backend.
 * All methods accept an optional `authToken` parameter (JWT from AuthContext).
 * Falls back to the static EXPO_PUBLIC_API_TOKEN for backward compatibility.
 */
export const apiService = {
  /**
   * Sends vital signs to the server.
   * Uses 30s timeout + 1 automatic retry for Cloud Run cold starts.
   * @param {Object} vitalsData - The vital signs data to send
   * @param {string} [authToken] - JWT from AuthContext (preferred)
   * @param {Function} [onRetry] - callback(attemptNumber) for UX status updates
   */
  sendVitals: async (vitalsData, authToken = null, onRetry = null) => {
    const token = resolveToken(authToken);
    try {
      const response = await fetchAuthenticated(
        `${API_BASE_URL}/vital-signs`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(vitalsData),
        },
        ANALYSIS_TIMEOUT_MS,
        onRetry
      );

      if (!response.ok) {
        const errorBody = await response.text();
        console.error(`[RMHealth API] Status ${response.status} — Detail: ${errorBody}`);
        const err = new Error(`API Error: ${response.status} — ${errorBody}`);
        err.statusCode = response.status;
        throw err;
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

// Export error classifier for screens to use
export { classifyError };
