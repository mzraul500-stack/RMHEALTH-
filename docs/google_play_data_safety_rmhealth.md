# Google Play Data Safety Form — RMHealth

**Última actualización:** Mayo 22, 2026
**App:** RMHealth (com.rmhealth.vitalguardianapp)
**Desarrollador:** MORALES ZEPEDA RAUL
**Registro INDAUTOR:** 03-2025-070109072500-01

---

## Resumen Ejecutivo

RMHealth es una plataforma de **detección y coordinación de emergencias médicas**.
NO diagnostica. NO reemplaza profesionales de salud.
Actúa como intermediario tecnológico entre el paciente y los servicios de salud.

---

## Datos Recopilados

### 1. Información Personal

| Dato | Se Recopila | Se Comparte | Cifrado en Tránsito | Eliminable | Propósito |
|------|:-----------:|:-----------:|:--------------------:|:----------:|-----------|
| Nombre completo | ✅ | ❌ | ✅ TLS 1.3 | ✅ | Account management |
| Correo electrónico | ✅ | ❌ | ✅ TLS 1.3 | ✅ | Account management, 2FA |

### 2. Datos de Salud y Fitness

| Dato | Se Recopila | Se Comparte | Cifrado en Tránsito | Eliminable | Propósito |
|------|:-----------:|:-----------:|:--------------------:|:----------:|-----------|
| Frecuencia cardíaca (bpm) | ✅ | ❌* | ✅ TLS 1.3 | ✅ | App functionality, Health monitoring |
| Presión arterial (mmHg) | ✅ | ❌* | ✅ TLS 1.3 | ✅ | App functionality, Health monitoring |
| Saturación de oxígeno (SpO2) | ✅ | ❌* | ✅ TLS 1.3 | ✅ | App functionality, Health monitoring |
| Glucosa en sangre (mg/dL) | ✅ | ❌* | ✅ TLS 1.3 | ✅ | App functionality, Health monitoring |
| Temperatura corporal (°C) | ✅ | ❌* | ✅ TLS 1.3 | ✅ | App functionality, Health monitoring |
| Datos de sueño/descanso | ✅ | ❌ | ✅ TLS 1.3 | ✅ | App functionality (rest visualization) |
| Medicamentos y horarios | ✅ (local) | ❌ | N/A (local only) | ✅ (uninstall) | App functionality |
| Health Connect data | ✅ (READ only) | ❌ | ✅ TLS 1.3 | ✅ | App functionality |

> *Compartido SOLO con servicios de emergencia cuando el usuario activa manualmente el protocolo de emergencia (SOS).

### 3. Ubicación

| Dato | Se Recopila | Se Comparte | Cifrado en Tránsito | Eliminable | Propósito |
|------|:-----------:|:-----------:|:--------------------:|:----------:|-----------|
| Ubicación precisa (GPS) | ✅ | ❌* | ✅ TLS 1.3 | ✅ | Emergency coordination |

> *Compartido SOLO con servicios de emergencia durante un protocolo de emergencia activo.

### 4. Identificadores de Dispositivo

| Dato | Se Recopila | Se Comparte | Cifrado en Tránsito | Eliminable | Propósito |
|------|:-----------:|:-----------:|:--------------------:|:----------:|-----------|
| Device ID (anónimo) | ✅ | ❌ | ✅ TLS 1.3 | ✅ | Security, Audit logging |
| FCM Token | ✅ | Firebase (Google)** | ✅ TLS 1.3 | ✅ (logout) | Push notifications |

> **El token FCM se comparte con Firebase (Google) exclusivamente para la entrega de notificaciones push. No se comparte con ningún otro tercero.

---

## Preguntas del Formulario de Data Safety

### ¿Tu app recopila o comparte alguno de los tipos de datos de usuario requeridos?
**Sí**

### ¿Todos los datos de usuario recopilados por tu app están cifrados en tránsito?
**Sí** — HTTPS/TLS 1.3 en todas las comunicaciones con el servidor.

### ¿Proporcionas un mecanismo para que los usuarios soliciten la eliminación de sus datos?
**Sí** — La app incluye una pantalla de "Privacidad" (Más → Privacidad) donde el usuario puede:
- Ver y revocar consentimientos
- Exportar todos sus datos (GDPR Art. 20, LFPDPPP Art. 24)
- Eliminar su cuenta permanentemente (GDPR Art. 17, LFPDPPP Art. 25)
- Confirmación de doble paso: escribir "ELIMINAR" o "DELETE"

### ¿Tu app comparte datos de usuario con terceros?
**No** — Los datos NO se comparten con terceros para publicidad, marketing o análisis.
- **Excepción 1:** Firebase Cloud Messaging (Google) recibe tokens FCM para entrega de notificaciones. No recibe datos de salud.
- **Excepción 2:** Durante un protocolo de emergencia activado por el usuario, la ubicación y signos vitales pueden compartirse con servicios de atención médica.

### ¿Tu app recopila datos de Health Connect?
**Sí** — Solo permisos de LECTURA:
- `READ_HEART_RATE`
- `READ_OXYGEN_SATURATION`
- `READ_BLOOD_PRESSURE`
- `READ_BODY_TEMPERATURE`
- `READ_SLEEP`

**NO se escriben datos en Health Connect.**

---

## Infraestructura de Procesamiento

| Componente | Proveedor | Ubicación | Certificaciones |
|-----------|-----------|-----------|-----------------|
| API Backend | Google Cloud Run | us-central1 (Iowa, USA) | HIPAA, SOC 2 Type II, ISO 27001/27017/27018 |
| Base de datos | Cloud SQL (PostgreSQL) | us-central1 | HIPAA, SOC 2 Type II |
| Notificaciones | Firebase Cloud Messaging | Google Global | SOC 2 Type II |
| Almacenamiento local | AsyncStorage (dispositivo) | Dispositivo del usuario | N/A — bajo control del usuario |

---

## Contacto del Responsable de Datos

**MORALES ZEPEDA RAUL**
Email: rmlive@rmhealth.ai
Web: https://rmhealth.ai
Registro INDAUTOR: 03-2025-070109072500-01

---

© 2025-2026 MORALES ZEPEDA RAUL — RMHealth. Todos los derechos reservados.
