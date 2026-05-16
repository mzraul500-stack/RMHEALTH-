# Google Play Compliance Checklist — RMHealth FCM

## Objetivo
Verificar que la implementación de Firebase Cloud Messaging cumple con las políticas de Google Play Store para notificaciones push.

---

## ✅ Checklist de Cumplimiento

### 1. Permiso POST_NOTIFICATIONS (Android 13+)
- [x] Declarado en `AndroidManifest.xml` (línea 5)
- [x] Declarado en `app.json` > `android.permissions`
- [x] Se solicita en tiempo de ejecución via `Notifications.requestPermissionsAsync()`
- [x] Si el usuario deniega, la app **continúa funcionando** sin bloqueos
- [x] No se solicita al iniciar la app — solo cuando el feature flag está activo

### 2. Contenido de Notificaciones
- [x] Las notificaciones son **informativas**, no promocionales
- [x] No contienen datos clínicos sensibles (HR, BP, SpO2, etc.)
- [x] El contenido es genérico: "Se generó un aviso informativo"
- [x] No se envían notificaciones sin acción del sistema (solo tras detección de anomalía)

### 3. Frecuencia
- [x] Las notificaciones se envían **solo cuando se detecta un patrón preventivo**
- [x] No hay notificaciones recurrentes automáticas tipo marketing
- [x] No hay notificaciones de engagement/retención

### 4. Canal de Notificación (Android 8+)
- [x] Canal `rmhealth_preventive` creado programáticamente
- [x] Nombre visible: "Avisos Preventivos"
- [x] Descripción clara del propósito
- [x] El usuario puede desactivar el canal desde Configuración del sistema

### 5. Política de Privacidad
- [ ] **PENDIENTE**: Actualizar política de privacidad para mencionar:
  - Uso de Firebase Cloud Messaging
  - Qué datos se transmiten (ningún dato clínico)
  - Cómo desactivar notificaciones

### 6. Datos Transmitidos
- [x] El token FCM se transmite al backend via HTTPS
- [x] No se transmiten datos clínicos en el payload push
- [x] El payload contiene solo: tipo de aviso y ID de referencia
- [x] Los detalles se consultan in-app mediante API autenticada

### 7. Almacenamiento de Tokens
- [x] Tokens almacenados en tabla `fcm_tokens` en PostgreSQL
- [x] Se pueden desactivar (`active = FALSE`)
- [x] Se actualizan automáticamente cuando el token se renueva

### 8. Consentimiento del Usuario
- [x] El permiso de notificaciones es explícito (POST_NOTIFICATIONS)
- [x] El feature flag está desactivado por defecto
- [ ] **PENDIENTE**: Considerar agregar toggle en la pantalla de configuración de la app

---

## 📋 Declaración de Seguridad de Datos (Play Console)

Al llenar el formulario de "Data Safety" en Google Play Console:

| Pregunta | Respuesta |
|----------|-----------|
| ¿Recopila identificadores de dispositivo? | Sí — token FCM para push notifications |
| ¿Se comparten con terceros? | No — solo con Firebase (Google) para entrega de notificaciones |
| ¿Se puede eliminar? | Sí — el token se desactiva al cerrar sesión |
| ¿Se envían datos de salud? | No — el payload push no contiene datos de salud |
| ¿Se usa cifrado en tránsito? | Sí — HTTPS |

---

## ⚠️ Pendientes antes de publicar

1. Actualizar política de privacidad en `LegalScreen.js`
2. Agregar toggle de notificaciones en `PrivacySettingsScreen.js`
3. Activar feature flag en versión estable probada
4. Verificar en el formulario de Data Safety de Play Console

---

© 2025-2026 MORALES ZEPEDA RAUL | INDAUTOR 03-2025-070109072500-01
