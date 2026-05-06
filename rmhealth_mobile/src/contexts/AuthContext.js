/**
 * RMHealth AuthContext — Global Authentication State (M1 + M8)
 *
 * Manages:
 * - User session with JWT access + refresh tokens
 * - Secure token storage via expo-secure-store (never AsyncStorage)
 * - Persistent session (auto-logout removed for continuous monitoring)
 * - Token refresh before expiry
 *
 * © 2025 MORALES ZEPEDA RAUL | Registro INDAUTOR: 03-2025-070109072500-01
 */

import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { Alert, AppState } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL
  || 'https://rmhealth-api-292048010515.us-central1.run.app/api';

// Secure storage keys
const KEYS = {
  ACCESS_TOKEN: 'rmhealth_access_token',
  REFRESH_TOKEN: 'rmhealth_refresh_token',
  USER_DATA: 'rmhealth_user_data',
};

// Session is persistent; auto-logout removed per founder requirements.

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

  // Inactivity tracking
  const lastActivityRef = useRef(Date.now());
  const inactivityTimerRef = useRef(null);
  const warningShownRef = useRef(false);

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

  // ── API Helpers ──
  const authFetch = async (endpoint, options = {}) => {
    const url = `${API_BASE_URL}${endpoint}`;
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    const response = await fetch(url, { ...options, headers });
    return response;
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
    resetInactivityTimer();

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
    clearInactivityTimer();
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

    // Force re-login after password change
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

  const refreshAccessToken = async () => {
    try {
      const refreshToken = await SecureStore.getItemAsync(KEYS.REFRESH_TOKEN);
      const userData = await SecureStore.getItemAsync(KEYS.USER_DATA);

      if (!refreshToken || !userData) {
        return false;
      }

      const parsedUser = JSON.parse(userData);
      const response = await authFetch('/auth/refresh', {
        method: 'POST',
        body: JSON.stringify({
          refresh_token: refreshToken,
          user_id: parsedUser.id,
        }),
      });

      if (!response.ok) {
        return false;
      }

      const data = await response.json();
      await saveTokens(data.access_token, data.refresh_token);
      setAccessToken(data.access_token);
      return true;
    } catch (e) {
      return false;
    }
  };

  // ── Inactivity Timer ──

  const resetInactivityTimer = useCallback(() => {
    lastActivityRef.current = Date.now();
    warningShownRef.current = false;
  }, []);

  const clearInactivityTimer = useCallback(() => {
    if (inactivityTimerRef.current) {
      clearInterval(inactivityTimerRef.current);
      inactivityTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!isAuthenticated) {
      clearInactivityTimer();
      return;
    }

    // Persistent session requested by founder. 
    // Inactivity logout removed to prevent monitoring interruptions.
    // The session remains open until explicit logout or token revocation.
    
    return () => clearInactivityTimer();
  }, [isAuthenticated]);

  // Track app state changes for activity
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active' && isAuthenticated) {
        resetInactivityTimer();
      }
    });
    return () => subscription?.remove();
  }, [isAuthenticated]);

  // ── Restore Session on App Start ──

  useEffect(() => {
    const restoreSession = async () => {
      try {
        const storedToken = await SecureStore.getItemAsync(KEYS.ACCESS_TOKEN);
        const storedUser = await SecureStore.getItemAsync(KEYS.USER_DATA);

        if (storedToken && storedUser) {
          setAccessToken(storedToken);
          setUser(JSON.parse(storedUser));
          setIsAuthenticated(true);

          // Try to refresh token silently
          const refreshed = await refreshAccessToken();
          if (!refreshed) {
            // Token refresh failed — still use stored token (may work if not expired)
          }
        }
      } catch (e) {
        console.warn('[AuthContext] Session restore failed:', e);
      } finally {
        setIsLoading(false);
      }
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
    resetInactivityTimer,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}
