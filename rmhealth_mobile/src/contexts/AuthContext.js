/**
 * RMHealth AuthContext — Global Authentication State (M1 + M8)
 *
 * SIMPLE PERMANENT SESSION:
 * This is a continuous medical monitoring app. The session NEVER
 * expires automatically. It ends ONLY when:
 *   1. User presses "Cerrar Sesión" (explicit logout)
 *   2. User changes password (revokes all tokens)
 *   3. Account is deleted
 *
 * Token refresh is handled LAZILY by the 401 interceptor in client.js.
 * This file does NOT attempt background refresh, proactive renewal,
 * retry loops, or any other complexity that could break the session.
 *
 * © 2025 MORALES ZEPEDA RAUL | Registro INDAUTOR: 03-2025-070109072500-01
 */

import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { Alert } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL
  || 'https://rmhealth-api-292048010515.us-central1.run.app/api';

// Secure storage keys — shared with client.js 401 interceptor
const KEYS = {
  ACCESS_TOKEN: 'rmhealth_access_token',
  REFRESH_TOKEN: 'rmhealth_refresh_token',
  USER_DATA: 'rmhealth_user_data',
};

const AuthContext = createContext(null);

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [accessToken, setAccessToken] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  // Prevent concurrent refresh calls
  const refreshInProgressRef = useRef(null);

  // ── Secure Storage Helpers ──
  const saveTokens = async (access, refresh) => {
    await SecureStore.setItemAsync(KEYS.ACCESS_TOKEN, access);
    if (refresh) {
      await SecureStore.setItemAsync(KEYS.REFRESH_TOKEN, refresh);
    }
  };

  const saveUser = async (userData) => {
    await SecureStore.setItemAsync(KEYS.USER_DATA, JSON.stringify(userData));
  };

  const clearStorage = async () => {
    await SecureStore.deleteItemAsync(KEYS.ACCESS_TOKEN);
    await SecureStore.deleteItemAsync(KEYS.REFRESH_TOKEN);
    await SecureStore.deleteItemAsync(KEYS.USER_DATA);
  };

  // ── API Helper ──
  const authFetch = async (endpoint, options = {}) => {
    const url = `${API_BASE_URL}${endpoint}`;
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers,
    };
    return await fetch(url, { ...options, headers });
  };

  // ── Auth Actions ──

  const register = async (email, password, confirmPassword, fullName) => {
    const response = await authFetch('/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        email,
        password,
        confirm_password: confirmPassword,
        full_name: fullName,
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.detail || 'Error al registrar');
    }
    return data;
  };

  const login = async (email, password) => {
    const response = await authFetch('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.detail || 'Error de autenticación');
    }
    return data;
  };

  const verify2FA = async (userId, code) => {
    const response = await authFetch('/auth/verify-2fa', {
      method: 'POST',
      body: JSON.stringify({ user_id: userId, code }),
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.detail || 'Código inválido');
    }

    // Save tokens and user data securely
    await saveTokens(data.access_token, data.refresh_token);
    await saveUser(data.user);

    setAccessToken(data.access_token);
    setUser(data.user);
    setIsAuthenticated(true);

    return data;
  };

  const resend2FA = async (userId) => {
    const response = await authFetch('/auth/resend-2fa', {
      method: 'POST',
      body: JSON.stringify({ user_id: userId }),
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.detail || 'Error al reenviar el código');
    }

    return data;
  };

  /**
   * EXPLICIT LOGOUT — the ONLY way to end a session.
   * Triggered ONLY by the user pressing "Cerrar Sesión".
   * No automatic process should ever call this.
   */
  const logout = async () => {
    try {
      if (accessToken) {
        await authFetch('/auth/logout', {
          method: 'POST',
          headers: { Authorization: `Bearer ${accessToken}` },
        });
      }
    } catch (e) {
      // Logout should always succeed locally
    }

    await clearStorage();
    setUser(null);
    setAccessToken(null);
    setIsAuthenticated(false);
    console.log('[AuthContext] Session cleared by EXPLICIT user logout');
  };

  const changePassword = async (currentPassword, newPassword) => {
    const response = await authFetch('/auth/change-password', {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({
        current_password: currentPassword,
        new_password: newPassword,
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.detail || 'Error al cambiar contraseña');
    }

    // Force re-login after password change (backend revokes all tokens)
    await logout();
    return data;
  };

  const forgotPassword = async (email) => {
    const response = await authFetch('/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });

    const data = await response.json();
    return data;
  };

  // ── Token Refresh ──
  // Called by client.js 401 interceptor when an API call gets 401.
  // Also available for manual refresh if needed.
  // NEVER clears the session — worst case, the token stays stale
  // and client.js handles retries per-request.

  const refreshAccessToken = useCallback(async () => {
    // Deduplicate: if a refresh is already in flight, wait for it
    if (refreshInProgressRef.current) {
      return refreshInProgressRef.current;
    }

    const doRefresh = async () => {
      try {
        const refreshToken = await SecureStore.getItemAsync(KEYS.REFRESH_TOKEN);
        const userData = await SecureStore.getItemAsync(KEYS.USER_DATA);

        if (!refreshToken || !userData) {
          console.warn('[AuthContext] No refresh token available');
          return { success: false };
        }

        const parsedUser = JSON.parse(userData);

        // 15s timeout for the refresh call
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);

        let response;
        try {
          response = await authFetch('/auth/refresh', {
            method: 'POST',
            body: JSON.stringify({
              refresh_token: refreshToken,
              user_id: parsedUser.id,
            }),
            signal: controller.signal,
          });
        } finally {
          clearTimeout(timeoutId);
        }

        if (response.ok) {
          const data = await response.json();
          await saveTokens(data.access_token, data.refresh_token);
          setAccessToken(data.access_token);
          console.log('[AuthContext] Token refreshed successfully');
          return { success: true };
        }

        // ANY failure — log it but NEVER clear the session
        console.warn(`[AuthContext] Refresh failed with status ${response.status} — session preserved`);
        return { success: false };

      } catch (e) {
        // Network error, timeout, etc. — NEVER clear the session
        console.warn('[AuthContext] Refresh error:', e?.name || e?.message, '— session preserved');
        return { success: false };
      } finally {
        refreshInProgressRef.current = null;
      }
    };

    refreshInProgressRef.current = doRefresh();
    return refreshInProgressRef.current;
  }, []);

  // ── Restore Session on App Start ──
  // Read tokens from SecureStore → mark authenticated → done.
  // NO background refresh. NO network calls. NO conditions that clear session.
  // Token refresh happens lazily via client.js 401 interceptor on first API call.

  useEffect(() => {
    const restoreSession = async () => {
      console.log('[AuthContext] Restoring session from SecureStore...');
      try {
        const storedToken = await SecureStore.getItemAsync(KEYS.ACCESS_TOKEN);
        const storedUser = await SecureStore.getItemAsync(KEYS.USER_DATA);

        if (storedToken && storedUser) {
          const parsedUser = JSON.parse(storedUser);
          setAccessToken(storedToken);
          setUser(parsedUser);
          setIsAuthenticated(true);
          console.log('[AuthContext] Session restored for:', parsedUser.email);
        } else {
          console.log('[AuthContext] No stored session — showing login');
        }
      } catch (e) {
        console.warn('[AuthContext] Error reading SecureStore:', e);
        // On error, DON'T clear anything — just show login screen
      }
      setIsLoading(false);
    };

    restoreSession();
  }, []);

  const value = {
    user,
    accessToken,
    isAuthenticated,
    isLoading,
    register,
    login,
    verify2FA,
    resend2FA,
    logout,
    changePassword,
    forgotPassword,
    refreshAccessToken,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}
