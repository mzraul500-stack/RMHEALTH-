/**
 * RMHealth Dashboard — API Client
 * Handles all backend communication with JWT auth.
 * © 2025 MORALES ZEPEDA RAUL
 */

const DashboardAPI = (() => {
  // Auto-detect API base: same origin in production, configurable for dev
  const API_BASE = window.location.origin;
  let _token = null;

  function setToken(t) { _token = t; }
  function getToken() { return _token; }

  async function _fetch(path, options = {}) {
    const headers = { 'Content-Type': 'application/json', ...options.headers };
    if (_token) headers['Authorization'] = `Bearer ${_token}`;

    const response = await fetch(`${API_BASE}${path}`, { ...options, headers });

    if (response.status === 401) {
      // Token expired — force logout
      Auth.logout();
      throw new Error('Sesión expirada');
    }

    if (!response.ok) {
      const err = await response.json().catch(() => ({ detail: 'Error del servidor' }));
      throw new Error(err.detail || `HTTP ${response.status}`);
    }

    return response.json();
  }

  return {
    setToken,
    getToken,

    // Auth
    login: (email, password) =>
      _fetch('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      }),

    verify2FA: (userId, code) =>
      _fetch('/api/auth/verify-2fa', {
        method: 'POST',
        body: JSON.stringify({ user_id: userId, code }),
      }),

    getMe: () => _fetch('/api/auth/me'),

    // Doctor endpoints
    getDashboardSummary: () => _fetch('/api/doctor/dashboard/summary'),
    getPatients: () => _fetch('/api/doctor/patients'),
    getPatientVitals: (id) => _fetch(`/api/doctor/patients/${id}/vitals`),
    getPatientAlerts: (id) => _fetch(`/api/doctor/patients/${id}/alerts`),
    getPatientMedications: (id) => _fetch(`/api/doctor/patients/${id}/medications`),
    getPatientProfile: (id) => _fetch(`/api/doctor/patients/${id}/profile`),
    generateInvite: () =>
      _fetch('/api/doctor/patients/invite', { method: 'POST' }),
    unlinkPatient: (id) =>
      _fetch(`/api/doctor/patients/${id}/unlink`, { method: 'DELETE' }),
  };
})();
