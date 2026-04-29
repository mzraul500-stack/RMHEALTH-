/**
 * RMHealth Dashboard — Auth Module
 * Handles login flow, token persistence, and session management.
 * © 2025 MORALES ZEPEDA RAUL
 */

const Auth = (() => {
  const TOKEN_KEY = 'rmhealth_dashboard_token';
  const USER_KEY = 'rmhealth_dashboard_user';

  function saveSession(token, user) {
    sessionStorage.setItem(TOKEN_KEY, token);
    sessionStorage.setItem(USER_KEY, JSON.stringify(user));
    DashboardAPI.setToken(token);
  }

  function loadSession() {
    const token = sessionStorage.getItem(TOKEN_KEY);
    const user = JSON.parse(sessionStorage.getItem(USER_KEY) || 'null');
    if (token) DashboardAPI.setToken(token);
    return { token, user };
  }

  function logout() {
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(USER_KEY);
    DashboardAPI.setToken(null);
    document.getElementById('login-screen').classList.add('active');
    document.getElementById('dashboard-screen').classList.remove('active');
  }

  function getUser() {
    return JSON.parse(sessionStorage.getItem(USER_KEY) || 'null');
  }

  async function login(email, password) {
    const result = await DashboardAPI.login(email, password);

    // Check if 2FA is required
    if (result.requires_2fa) {
      return { requires_2fa: true, user_id: result.user_id };
    }

    // Direct login (no 2FA)
    if (result.access_token) {
      const user = result.user || { email };
      saveSession(result.access_token, user);
      return { success: true, user };
    }

    throw new Error('Respuesta inesperada del servidor');
  }

  async function verify2FA(userId, code) {
    const result = await DashboardAPI.verify2FA(userId, code);
    if (result.access_token) {
      const user = result.user || {};
      saveSession(result.access_token, user);
      return { success: true, user };
    }
    throw new Error('Código inválido');
  }

  return { login, verify2FA, logout, loadSession, getUser, saveSession };
})();
