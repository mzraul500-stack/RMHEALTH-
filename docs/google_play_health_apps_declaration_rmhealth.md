# Google Play Health Apps Declaration — RMHealth

**Última actualización:** Mayo 22, 2026
**App:** RMHealth (com.rmhealth.vitalguardianapp)
**Desarrollador:** MORALES ZEPEDA RAUL
**Registro INDAUTOR:** 03-2025-070109072500-01

---

## 1. Descripción General de la App

RMHealth es una **plataforma de detección y coordinación de emergencias médicas** que permite a los usuarios:

1. **Registrar signos vitales** (frecuencia cardíaca, presión arterial, SpO2, glucosa, temperatura) de forma manual o mediante dispositivos conectados vía Health Connect.
2. **Recibir observaciones preventivas** generadas por un motor de inteligencia artificial que clasifica patrones como BAJO, MEDIO, ALTO o CRÍTICO.
3. **Visualizar historial de salud** con tendencias y promedios.
4. **Gestionar medicamentos** con recordatorios de adherencia.
5. **Activar protocolo de emergencia** (SOS manual) para coordinación con servicios de atención médica.
6. **Visualizar datos de sueño/descanso** como contexto de bienestar general.

---

## 2. Lo que RMHealth NO hace

> [!IMPORTANT]
> **RMHealth NO es un dispositivo médico y NO realiza diagnósticos.**

| Acción | ¿RMHealth lo hace? |
|--------|:------------------:|
| Diagnosticar enfermedades | ❌ NO |
| Recomendar medicamentos | ❌ NO |
| Prescribir tratamientos | ❌ NO |
| Reemplazar la consulta médica | ❌ NO |
| Detectar apnea del sueño | ❌ NO |
| Predecir enfermedades futuras | ❌ NO |
| Realizar electrocardiogramas (ECG) | ❌ NO |
| Interpretar resultados de laboratorio | ❌ NO |

---

## 3. Lo que RMHealth SÍ hace

| Acción | Descripción |
|--------|-------------|
| Registrar datos de salud | Captura signos vitales del usuario manual o vía Health Connect |
| Clasificar severidad | Motor de IA clasifica lecturas en 4 niveles (BAJO/MEDIO/ALTO/CRÍTICO) |
| Generar observaciones preventivas | Alertas informativas basadas en umbrales clínicos publicados (AHA, ADA, OMS) |
| Mostrar disclaimers | Cada resultado incluye: "No constituye diagnóstico. Consulte a su médico." |
| Coordinar emergencias | Si el usuario activa SOS manual, facilita la localización del centro de atención más cercano |
| Visualizar descanso | Lee datos READ_SLEEP para mostrar duración/horarios de sueño — sin análisis diagnóstico |
| Exportar datos | Permite al usuario descargar sus datos para compartir con su profesional de salud |

---

## 4. Uso de Health Connect

### Permisos Solicitados (solo LECTURA)

| Permiso | Justificación |
|---------|---------------|
| `READ_HEART_RATE` | Leer frecuencia cardíaca registrada por smartwatch para monitoreo de patrones vitales |
| `READ_OXYGEN_SATURATION` | Leer SpO2 de smartwatch para evaluación de métricas respiratorias |
| `READ_BLOOD_PRESSURE` | Leer presión arterial de dispositivos compatibles (ej. Galaxy Watch) |
| `READ_BODY_TEMPERATURE` | Leer temperatura corporal de dispositivos compatibles |
| `READ_SLEEP` | Leer datos de sueño/descanso para visualización de patrones — NO para diagnóstico de trastornos del sueño |

### Permisos NO Solicitados

| Permiso | Razón |
|---------|-------|
| `WRITE_*` (cualquier tipo) | RMHealth NO escribe datos en Health Connect. Solo lee. |
| `READ_EXERCISE` | No relevante para el propósito de la app |
| `READ_NUTRITION` | No relevante para el propósito de la app |

### Consentimiento del Usuario

- El acceso a Health Connect requiere **consentimiento explícito** del usuario.
- La pantalla `HealthConnectOnboarding.js` explica qué datos se leen y por qué.
- El usuario puede revocar los permisos en cualquier momento desde Configuración > Privacidad > Health Connect.
- Si el usuario revoca los permisos, la app continúa funcionando con entrada manual de datos.

---

## 5. Modelo de IA

| Aspecto | Detalle |
|---------|---------|
| Algoritmo | GradientBoosting Classifier |
| Precisión | 91.8% |
| Entrada | Signos vitales (HR, SpO2, BP, Glucose, Temp, Age) |
| Salida | Nivel de severidad: BAJO, MEDIO, ALTO, CRÍTICO |
| Complemento | Motor heurístico con umbrales basados en guías AHA/ADA/OMS |
| Resultado final | Se toma el resultado MÁS SEVERO entre ML y heurístico (safety-first) |

### Disclaimers en la App

Cada resultado de análisis incluye:

> "RMHealth es un sistema de detección y coordinación de emergencias médicas.
> La información generada no constituye un diagnóstico y no sustituye la evaluación
> de un profesional de la salud. RMHealth actúa como intermediario tecnológico
> entre el paciente y los servicios de salud."

---

## 6. Datos de Sueño (READ_SLEEP)

### Uso específico:
- **Visualización**: Mostrar horas de inicio/fin de sueño, duración total
- **Historial**: Mostrar tendencia de descanso por fecha
- **Contexto**: Proporcionar contexto de bienestar general al usuario

### Lo que NO hacemos con datos de sueño:
- ❌ NO diagnosticamos apnea ni trastornos del sueño
- ❌ NO activamos alertas de emergencia basadas en datos de sueño
- ❌ NO predecimos enfermedades basados en patrones de sueño
- ❌ NO compartimos datos de sueño con terceros
- ❌ NO usamos datos de sueño para entrenamiento de ML

---

## 7. Cumplimiento Regulatorio

| Marco Legal | Cumplimiento |
|-------------|:------------:|
| LFPDPPP (México — Ley Federal de Protección de Datos Personales) | ✅ |
| Derechos ARCO (Acceso, Rectificación, Cancelación, Oposición) | ✅ |
| GDPR (referencias — exportación y eliminación de datos) | ✅ |
| HIPAA (infraestructura GCP certificada) | ✅ |
| Consentimiento explícito para datos de salud | ✅ |
| Eliminación de cuenta | ✅ |
| Registro INDAUTOR | ✅ (03-2025-070109072500-01) |

---

## 8. Credenciales de Prueba para Revisor de Google Play

Para que el revisor de Google Play pueda probar la app:

| Campo | Valor |
|-------|-------|
| **Tipo de cuenta** | Registrarse con cualquier email |
| **Flujo** | Registro → 2FA → Consentimiento → Home |
| **Notas** | La app requiere aceptar Privacy Policy, Terms y Consent antes de acceder a funcionalidades |
| **Health Connect** | Opcional — la app funciona con entrada manual si Health Connect no está disponible |

> **NOTA:** Se recomienda proporcionar una cuenta de prueba pre-creada si Google lo solicita durante la revisión.

---

## 9. Contacto

**MORALES ZEPEDA RAUL**
Email: rmlive@rmhealth.ai
Web: https://rmhealth.ai
Registro INDAUTOR: 03-2025-070109072500-01

---

© 2025-2026 MORALES ZEPEDA RAUL — RMHealth. Todos los derechos reservados.
