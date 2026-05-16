/**
 * PushNotificationService.js — Firebase Cloud Messaging (FCM) Token Management.
 *
 * Manages device push token registration and notification listeners
 * using expo-notifications (already installed). Does NOT add
 * @react-native-firebase/messaging.
 *
 * Flow:
 *   1. Check feature flag FCM_NOTIFICATIONS_ENABLED
 *   2. Request POST_NOTIFICATIONS permission (Android 13+)
 *   3. Get device push token via expo-notifications
 *   4. Send token to backend POST /api/devices/fcm-token
 *   5. Listen for token refreshes and re-register
 *   6. Handle incoming push notifications
 *
 * Security (JIDOKA):
 *   - Push payload NEVER contains clinical data
 *   - If permission denied, app continues normally
 *   - If FCM fails, app continues normally
 *   - Feature flag controls activation
 *
 * © 2025-2026 MORALES ZEPEDA RAUL | INDAUTOR 03-2025-070109072500-01
 */

import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { FEATURES } from '../config/features';

// API configuration — same pattern as api/client.js
const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL
  || 'https://rmhealth-api-292048010515.us-central1.run.app/api';
const STATIC_TOKEN = process.env.EXPO_PUBLIC_API_TOKEN;

const TAG = '[PushNotificationService]';

// ── Internal state ───────────────────────────────────────────────────────
let _tokenRefreshSubscription = null;
let _notificationReceivedSubscription = null;
let _notificationResponseSubscription = null;
let _currentToken = null;

/**
 * Register for push notifications and send the FCM token to backend.
 *
 * @param {string} userId - The authenticated user's ID.
 * @param {string} [authToken] - JWT from AuthContext (preferred) or EXPO_PUBLIC_API_TOKEN.
 * @returns {Promise<string|null>} The push token, or null if unavailable.
 */
export async function registerForPushNotifications(userId, authToken = null) {
  // Guard: feature flag
  if (!FEATURES.FCM_NOTIFICATIONS_ENABLED) {
    console.log(`${TAG} FCM disabled by feature flag. Skipping registration.`);
    return null;
  }

  // Guard: platform
  if (Platform.OS !== 'android') {
    console.log(`${TAG} Push notifications only supported on Android for now.`);
    return null;
  }

  try {
    // 1. Check/request permission
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      console.log(`${TAG} Requesting notification permission...`);
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      console.warn(
        `${TAG} Notification permission denied by user. ` +
        'App will continue without push notifications.'
      );
      return null;
    }

    // 2. Get device push token (native FCM token)
    const tokenData = await Notifications.getDevicePushTokenAsync();
    const fcmToken = tokenData?.data;

    if (!fcmToken) {
      console.warn(`${TAG} Could not obtain FCM token. google-services.json may be missing.`);
      return null;
    }

    _currentToken = fcmToken;
    const tokenSuffix = fcmToken.length > 12 ? `...${fcmToken.slice(-8)}` : '***';
    console.log(`${TAG} FCM token obtained: ${tokenSuffix}`);

    // 3. Register token with backend
    await _sendTokenToBackend(userId, fcmToken, authToken);

    // 4. Set up notification channel for Android
    await _setupNotificationChannel();

    return fcmToken;
  } catch (error) {
    console.error(`${TAG} Registration failed (non-blocking):`, error?.message || error);
    return null;
  }
}

/**
 * Set up listeners for token refresh and incoming notifications.
 *
 * @param {string} userId - The authenticated user's ID.
 * @param {string} [authToken] - JWT from AuthContext.
 * @param {Function} [onNotificationTap] - Callback when user taps a notification.
 */
export function setupPushListeners(userId, authToken = null, onNotificationTap = null) {
  if (!FEATURES.FCM_NOTIFICATIONS_ENABLED) {
    return;
  }

  // Clean up existing listeners
  cleanupPushListeners();

  // Listen for token refresh
  _tokenRefreshSubscription = Notifications.addPushTokenListener((tokenEvent) => {
    const newToken = tokenEvent?.data;
    if (newToken && newToken !== _currentToken) {
      console.log(`${TAG} Token refreshed, re-registering...`);
      _currentToken = newToken;
      _sendTokenToBackend(userId, newToken, authToken).catch((err) => {
        console.error(`${TAG} Token refresh registration failed:`, err?.message);
      });
    }
  });

  // Listen for notifications received while app is in foreground
  _notificationReceivedSubscription = Notifications.addNotificationReceivedListener(
    (notification) => {
      const data = notification?.request?.content?.data || {};
      console.log(
        `${TAG} Notification received in foreground: ` +
        `type=${data.type || 'unknown'}, alert_id=${data.alert_id || 'none'}`
      );
      // No clinical data in payload — notification is purely informative
    }
  );

  // Listen for user tapping on a notification
  _notificationResponseSubscription = Notifications.addNotificationResponseReceivedListener(
    (response) => {
      const data = response?.notification?.request?.content?.data || {};
      console.log(
        `${TAG} Notification tapped: ` +
        `type=${data.type || 'unknown'}, alert_id=${data.alert_id || 'none'}`
      );

      if (onNotificationTap && typeof onNotificationTap === 'function') {
        onNotificationTap(data);
      }
    }
  );

  console.log(`${TAG} Push notification listeners active.`);
}

/**
 * Clean up all push notification listeners.
 * Call this on logout or component unmount.
 */
export function cleanupPushListeners() {
  if (_tokenRefreshSubscription) {
    _tokenRefreshSubscription.remove();
    _tokenRefreshSubscription = null;
  }
  if (_notificationReceivedSubscription) {
    _notificationReceivedSubscription.remove();
    _notificationReceivedSubscription = null;
  }
  if (_notificationResponseSubscription) {
    _notificationResponseSubscription.remove();
    _notificationResponseSubscription = null;
  }
}

/**
 * Get the current FCM token (if registered).
 * @returns {string|null}
 */
export function getCurrentPushToken() {
  return _currentToken;
}

// ── Internal helpers ─────────────────────────────────────────────────────

/**
 * Send FCM token to backend for storage.
 * Uses the same auth pattern as api/client.js.
 */
async function _sendTokenToBackend(userId, fcmToken, authToken) {
  const token = authToken || STATIC_TOKEN;
  if (!token) {
    console.warn(`${TAG} No auth token available. FCM token NOT sent to backend.`);
    return;
  }

  const deviceId = Constants.installationId || Constants.sessionId || 'unknown';

  try {
    const response = await fetch(`${API_BASE_URL}/devices/fcm-token`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        usuario_id: userId,
        fcm_token: fcmToken,
        platform: 'android',
        device_id: deviceId,
      }),
    });

    if (response.ok) {
      console.log(`${TAG} FCM token registered with backend successfully.`);
    } else {
      const errorText = await response.text().catch(() => 'unknown');
      console.warn(
        `${TAG} Backend token registration failed: ` +
        `HTTP ${response.status} — ${errorText.substring(0, 200)}`
      );
    }
  } catch (error) {
    console.error(
      `${TAG} Network error registering FCM token (non-blocking):`,
      error?.message || error
    );
    // Non-blocking: app continues without push registration
  }
}

/**
 * Set up Android notification channel for preventive alerts.
 * Required for Android 8+ (API 26+).
 */
async function _setupNotificationChannel() {
  if (Platform.OS !== 'android') return;

  try {
    await Notifications.setNotificationChannelAsync('rmhealth_preventive', {
      name: 'Avisos Preventivos',
      description: 'Avisos informativos de RMHealth cuando se detectan valores fuera de rangos preventivos.',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#FF6B6B',
      sound: 'default',
    });
    console.log(`${TAG} Android notification channel "rmhealth_preventive" configured.`);
  } catch (error) {
    console.error(`${TAG} Error setting up notification channel:`, error?.message);
  }
}
