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

  /**
   * Gemini Chatbot — RM Coach con Vertex AI.
   * true  = intenta conectar al backend para respuestas educativas con Gemini.
   * false = solo usa motor local offline (FAQ, resumen, adherencia).
   * El fallback local siempre permanece activo como red de seguridad.
   */
  GEMINI_CHATBOT_ENABLED: true,

  /**
   * Sleep Mode — Read SleepSessionRecord via Health Connect.
   * true  = shows sleep card on Home + full screen in More menu.
   * false = hides all sleep functionality, no new permissions requested.
   * Requires HEALTH_CONNECT_ENABLED = true to function.
   */
  SLEEP_MODE_ENABLED: true,

  /**
   * Longitudinal Trend Analysis (24h/7d/30d/90d).
   * true  = queries GET /api/trends and displays trend insights.
   * false = no trend queries, app behaves as before.
   * TrendAnalysisService is contextual/preventive ONLY — never overrides
   * MedicalEngine severity or CJM clinical thresholds.
   */
  TREND_ANALYSIS_ENABLED: true,
};
