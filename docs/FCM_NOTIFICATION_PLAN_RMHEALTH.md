# FCM Notification Plan — RMHealth

## Objetivo
Implementar Firebase Cloud Messaging (FCM) como canal **complementario** a SMS/Twilio para avisos preventivos informativos.

## Diferenciador
> RMHealth avisa automáticamente a contactos de confianza preestablecidos cuando detecta valores fuera de rangos preventivos.

FCM fortalece este diferenciador agregando un canal push que:
- Es más rápido que SMS
- No tiene costo por mensaje
- Permite fallback si Twilio falla
- No requiere que el usuario tenga saldo

---

## Arquitectura del Flujo Push

```
┌─────────────┐     ┌──────────────┐     ┌────────────────┐     ┌──────────────┐
│  RMHealth   │────▶│   Backend    │────▶│  Firebase      │────▶│  Dispositivo │
│  Motor ML   │     │  FastAPI     │     │  Cloud         │     │  Android     │
│             │     │              │     │  Messaging     │     │              │
│ Detecta     │     │ notification │     │                │     │ Muestra      │
│ anomalía    │     │ _service.py  │     │ Envía push     │     │ notificación │
│ preventiva  │     │              │     │                │     │ genérica     │
└─────────────┘     └──────────────┘     └────────────────┘     └──────────────┘
                          │                                           │
                          │ SMS/Twilio (paralelo)                     │ Usuario abre app
                          ▼                                           ▼
                    ┌──────────────┐                           ┌──────────────┐
                    │  Contacto de │                           │ Ve detalles  │
                    │  confianza   │                           │ clínicos     │
                    │  (SMS)       │                           │ en app       │
                    └──────────────┘                           └──────────────┘
```

---

## Payload Aprobado (JIDOKA)

### ✅ PERMITIDO
```json
{
  "notification": {
    "title": "Aviso preventivo RMHealth",
    "body": "Se generó un aviso informativo. Abre RMHealth para revisar detalles."
  },
  "data": {
    "type": "preventive_notice",
    "alert_id": "uuid-de-la-alerta"
  }
}
```

### ❌ PROHIBIDO en payload push
- Frecuencia cardíaca exacta
- Presión arterial exacta
- SpO2 exacta
- Glucosa exacta
- Temperatura exacta
- Ubicación exacta (lat/lon)
- Diagnóstico o nivel clínico
- Nombre del paciente
- Datos personales identificables

> Los detalles clínicos se consultan **dentro de la app** mediante API autenticada.

---

## Componentes Implementados

### Backend
| Archivo | Cambio |
|---------|--------|
| `services/notification_service.py` | Funciones `send_push_notification()` y `send_preventive_push()` |
| `rmhealth_api.py` | Tabla `fcm_tokens` + endpoint `POST /api/devices/fcm-token` |
| `requirements.txt` | `firebase-admin==6.6.0` |

### Mobile
| Archivo | Cambio |
|---------|--------|
| `src/services/PushNotificationService.js` | Registro de token, listeners, canal Android |
| `src/config/features.js` | `FCM_NOTIFICATIONS_ENABLED: false` |
| `android/build.gradle` | Classpath `com.google.gms:google-services:4.4.2` |
| `android/app/build.gradle` | Plugin `com.google.gms.google-services` |

---

## Seguridad

### Sanitización de payload
El backend tiene un filtro de claves prohibidas (`FORBIDDEN_KEYS`) que bloquea automáticamente cualquier dato clínico que intente incluirse en el payload push:

```python
FORBIDDEN_KEYS = {
    "heart_rate", "ritmo_cardiaco", "spo2", "presion", "systolic",
    "diastolic", "glucose", "glucosa", "temperatura", "temperature",
    "lat", "lon", "ubicacion", "location", "diagnosis", "diagnostico",
    "criticidad", "nivel_criticidad", "score_riesgo",
}
```

### Credenciales
- `google-services.json` protegido por `.gitignore` (raíz del proyecto)
- `FIREBASE_SERVICE_ACCOUNT_PATH` en variables de entorno del backend
- Feature flags controlan activación: `FCM_ENABLED` (backend), `FCM_NOTIFICATIONS_ENABLED` (mobile)

### Fallback
- Si FCM falla → SMS/Twilio sigue funcionando
- Si Twilio falla → FCM puede cubrir al usuario principal
- Si ambos fallan → alerta se persiste en base de datos

---

## Feature Flags

| Flag | Ubicación | Default | Efecto |
|------|-----------|---------|--------|
| `FCM_ENABLED` | Backend `.env` | `false` | Habilita envío de push desde servidor |
| `FCM_NOTIFICATIONS_ENABLED` | Mobile `features.js` | `false` | Habilita registro de token y listeners |

---

## Requisitos para Activación

1. Colocar `google-services.json` en `rmhealth_mobile/android/app/`
2. Colocar service account JSON en backend y configurar `FIREBASE_SERVICE_ACCOUNT_PATH`
3. Cambiar `FCM_ENABLED=true` en backend `.env`
4. Cambiar `FCM_NOTIFICATIONS_ENABLED: true` en `features.js`
5. Rebuild APK
6. Deploy backend (cuando sea autorizado)

---

© 2025-2026 MORALES ZEPEDA RAUL | INDAUTOR 03-2025-070109072500-01
