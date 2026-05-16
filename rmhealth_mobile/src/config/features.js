/**
 * features.js — Banderas de funcionalidad de RmHealth.
 *
 * Controla qué módulos opcionales están activos. Cambiar aquí para
 * habilitar/deshabilitar features sin tocar lógica de negocio.
 *
 * IMPORTANTE: HEALTH_CONNECT_ENABLED = false hasta confirmar
 * compatibilidad con New Architecture en el dispositivo objetivo.
 *
 * Para reactivar Health Connect:
 *   1. Cambiar HEALTH_CONNECT_ENABLED a true
 *   2. Comentar el bloque en react-native.config.js
 *   3. Restaurar useWatchData.js con la implementación real
 *   4. Rebuild del APK
 *
 * © 2025-2026 Morales Zepeda Raúl | INDAUTOR 03-2025-070109072500-01
 */

export const FEATURES = {
  /**
   * Integración de wearables compatibles via Health Connect.
   * false = modo manual, sin módulo nativo de HC.
   * true  = activa sync FC, SpO2, Temp (y BP con calibración).
   */
  HEALTH_CONNECT_ENABLED: true,

  /**
   * Auto-análisis al recibir datos del reloj.
   * Solo tiene efecto si HEALTH_CONNECT_ENABLED = true.
   */
  WATCH_AUTO_ANALYSIS: true,

  /**
   * Badge visual "Health Connect · Live" en HomeScreen.
   * Se activa automáticamente cuando HEALTH_CONNECT_ENABLED = true
   * y hay datos recientes del reloj.
   */
  WATCH_BADGE_VISIBLE: false,

  /**
   * Firebase Cloud Messaging — Notificaciones push.
   * false = desactivado, no se registra token FCM.
   * true  = solicita permiso de notificaciones y registra token en backend.
   * Requiere google-services.json en android/app/.
   * Canal complementario a SMS/Twilio, NO reemplazo.
   */
  FCM_NOTIFICATIONS_ENABLED: false,
};
