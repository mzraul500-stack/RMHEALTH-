# GCP Credits Roadmap — RMHealth

> **Versión**: 1.0  
> **Fecha**: 2026-05-16  
> **Autor**: Equipo RMHealth  
> **Estado**: BORRADOR — pendiente aprobación de Fase 1 técnica  
> **Registro INDAUTOR**: 03-2025-070109072500-01

---

## 1. Créditos Disponibles

| Crédito | Monto Disponible (MXN) | Monto Original (MXN) | Vencimiento | Tipo | Alcance |
|---------|------------------------|----------------------|-------------|------|---------|
| **GenAI App Builder** | $18,039.40 | $18,039.40 | 22 abril 2027 | Uso único | Solo servicios GenAI (Vertex AI, Gemini API, Agent Builder) |
| **Free Trial GCP** | $5,146.69 | $5,411.82 | 20 julio 2026 | Uso único | Servicios generales GCP |

### Notas sobre créditos
- **Free Trial vence en ~2 meses** → usar primero para servicios generales (FCM, Cloud Run)
- **GenAI App Builder tiene ~11 meses** → usar para Gemini/Vertex AI con calma
- Montos en **pesos mexicanos**
- No se pueden transferir entre cuentas

---

## 2. Decisión de Producto

### Diferenciador principal de RMHealth:
> *"Avisos automáticos informativos a contactos de confianza preestablecidos por el usuario cuando RMHealth detecta valores fuera de rangos preventivos."*

### Reglas inquebrantables:
1. RMHealth **NO es app médica** — es plataforma de detección y coordinación preventiva
2. **NO diagnostica** — detecta, informa, coordina
3. El motor ML de triage (`medical_engine.py`) **NO se modifica**
4. Gemini **NO decide criticidad** ni activa/cancela emergencias
5. **NO aumentar peso de la app** con modelos locales
6. Todo servicio GCP nuevo debe tener **fallback local** funcional

---

## 3. Tabla de Prioridades

| Mejora | Prioridad | Crédito | Impacto | Riesgo | Costo Est./mes (MXN) | Estado |
|--------|-----------|---------|---------|--------|----------------------|--------|
| Firebase Cloud Messaging (Push Notifications) | **P1** | Free Trial | 🟢 ALTO — fortalece diferenciador principal | 🟢 BAJO | $0–50 | 🔵 Planificado |
| RM Coach con Gemini vía Backend | **P2** | GenAI App Builder | 🟡 MEDIO — mejora retención y engagement | 🟡 MEDIO | $100–500 | 🔵 Planificado |
| Reportes Preventivos Inteligentes | **P3** | GenAI App Builder | 🟡 MEDIO — valor agregado para usuario y médico | 🟡 MEDIO | $50–200 | 🔵 Planificado |
| Speech-to-Text (accesibilidad) | P4 | GenAI App Builder | 🟡 MEDIO — inclusión adulto mayor | 🟢 BAJO | $20–80 | ⚪ No aprobado aún |
| Mejora ML con Vertex AI | ❌ | — | — | 🔴 ALTO — riesgo regulatorio | — | 🔴 No aprobado |

---

## 4. Detalle por Mejora

---

### P1 — Firebase Cloud Messaging (Push Notifications)

#### Problema que resuelve
Actualmente los avisos a contactos de confianza dependen exclusivamente de **SMS vía Twilio** (`notification_service.py`). Si Twilio falla, no hay credenciales configuradas, o el usuario no tiene crédito SMS, **el aviso no llega**. FCM agrega un canal de respaldo gratuito e instantáneo.

#### Cómo ayuda al modelo de negocio
- **Fortalece el diferenciador #1** del producto (avisos automáticos)
- Reduce dependencia/costo de Twilio
- Permite recordatorios de medicamentos (AdherenceTracker existente)
- Habilita notificaciones preventivas sin costo por mensaje
- Los contactos de confianza recibirían push notifications si también tienen la app instalada

#### Archivos que tocaría
| Archivo | Cambio |
|---------|--------|
| `backend/services/notification_service.py` | Agregar canal FCM junto a Twilio |
| `backend/requirements.txt` | Agregar `firebase-admin` |
| `rmhealth_mobile/android/app/build.gradle` | Dependencia `firebase-messaging` |
| `rmhealth_mobile/android/app/google-services.json` | [NUEVO] Config Firebase |
| `rmhealth_mobile/src/services/PushNotificationService.js` | [NUEVO] Registro de token FCM |
| `backend/rmhealth_api.py` | Endpoint para registrar tokens FCM |

#### Lo que NO debe hacer
- NO enviar datos clínicos sensibles en el payload del push (solo alerta genérica + ID)
- NO activar emergencias desde la notificación
- NO reemplazar Twilio — es complemento/fallback
- NO enviar notificaciones promocionales
- NO requerir que contactos instalen la app (fallback SMS sigue activo)

#### Criterios de aceptación
- [ ] Usuario recibe push cuando RMHealth detecta valores fuera de rango
- [ ] Contacto de confianza recibe push si tiene la app (fallback SMS si no)
- [ ] Recordatorio de medicamento llega como push
- [ ] Si FCM falla, Twilio sigue enviando SMS como antes
- [ ] No se filtran datos clínicos en el payload visible del push
- [ ] Token FCM se renueva sin intervención del usuario

#### ¿Afecta Play Store?
Sí — requiere declarar uso de `PUSH_NOTIFICATIONS` y agregar `google-services.json`. No debería requerir revisión especial.

#### ¿Afecta regulación médica?
No — las notificaciones son informativas, no diagnósticas. Mismo lenguaje que los SMS actuales.

#### Infraestructura requerida
- **GCP**: Firebase Project (ya existe: `rmhealth-494123`)
- **Backend**: Sí — envío de push desde Cloud Run
- **App Móvil**: Sí — registro de token FCM
- **Costo**: ~$0–50 MXN/mes (FCM es gratuito hasta 10K notificaciones/día)

---

### P2 — RM Coach con Gemini vía Backend

#### Problema que resuelve
El asistente RM Coach actual (`LocalWellnessEngine.js`) funciona localmente con un FAQ estático (`health_faq.json`). Las respuestas son limitadas y no consideran el historial del usuario. El backend ya tiene `gemini_explainer.py` integrado con Vertex AI (Gemini 1.5 Flash) con feature flag deshabilitado.

#### Cómo ayuda al modelo de negocio
- Mejora retención: usuario regresa a preguntar sobre sus tendencias
- Diferenciación vs apps de salud genéricas
- Valor educativo: el usuario entiende mejor sus registros
- Potencial feature premium (freemium futuro)

#### Archivos que tocaría
| Archivo | Cambio |
|---------|--------|
| `backend/services/gemini_explainer.py` | Agregar endpoint de chat educativo |
| `backend/rmhealth_api.py` | Nuevo endpoint `/api/coach/ask` |
| `rmhealth_mobile/src/features/assistant/services/LocalWellnessEngine.js` | Agregar llamada a backend con fallback local |
| `rmhealth_mobile/src/features/assistant/screens/` | UI del chat mejorada |

#### Lo que NO debe hacer
- ❌ **NO poner API keys de Gemini en la app** — todo pasa por backend
- ❌ **NO diagnosticar** — solo educación preventiva
- ❌ **NO recetar** — no sugerir medicamentos
- ❌ **NO cambiar criticidad** — el motor ML decide, Gemini explica
- ❌ **NO activar/cancelar emergencias** desde el chat
- ❌ **NO usar el término "respuestas médicas personalizadas"**

#### Lenguaje aprobado
✅ *"Respuestas educativas y preventivas basadas en tendencias de bienestar y signos vitales registrados."*

#### Criterios de aceptación
- [ ] Usuario pregunta "¿Mi presión ha mejorado?" → Gemini responde con tendencia de registros
- [ ] Respuesta incluye disclaimer obligatorio de RMHealth
- [ ] Si Gemini falla (timeout, error, quota), fallback local funciona sin interrumpir UX
- [ ] No se envían datos PII (nombre, email, teléfono) a Gemini — solo vitales anonimizados
- [ ] Feature flag permite desactivar sin redeploy
- [ ] Prompts incluyen guardrails anti-diagnóstico (ya implementados en `build_safe_prompt`)

#### ¿Afecta Play Store?
Posiblemente — si Play Store detecta uso de IA generativa, podría requerir declaración adicional en el formulario de contenido. Revisar políticas vigentes antes de publicar.

#### ¿Afecta regulación médica?
No, siempre que:
- El disclaimer esté visible
- No se use lenguaje de diagnóstico
- Las respuestas sean educativas/preventivas

#### Infraestructura requerida
- **GCP**: Vertex AI / Gemini API (cubierto por crédito GenAI)
- **Backend**: Sí — nuevo endpoint + gemini_explainer.py (ya existe la base)
- **App Móvil**: Sí — UI de chat mejorada + llamada a backend
- **Costo**: ~$100–500 MXN/mes (Gemini 1.5 Flash: ~$0.075/1K tokens input, ~$0.30/1K tokens output)

---

### P3 — Reportes Preventivos Inteligentes

#### Problema que resuelve
El usuario acumula registros de vitales pero no tiene una forma de ver **tendencias en lenguaje natural**. HistoryScreen muestra datos crudos. Un reporte semanal/mensual generado por IA sería más comprensible y compartible con un médico.

#### Cómo ayuda al modelo de negocio
- Valor agregado tangible para el usuario
- Exportable como PDF (ya existe `pdf_generator.py` en backend)
- Feature premium potencial
- Mejora la comunicación paciente-médico

#### Ejemplo de reporte (lenguaje aprobado):
> *"Esta semana tus registros muestran una tendencia de presión más alta que tus valores habituales. RMHealth recomienda revisar tus hábitos y, si tienes dudas o síntomas, consultar a un profesional de salud."*

#### Archivos que tocaría
| Archivo | Cambio |
|---------|--------|
| `backend/rmhealth_api.py` | Nuevo endpoint `/api/reports/weekly` |
| `backend/services/gemini_explainer.py` | Función `generate_wellness_report()` |
| `backend/services/pdf_generator.py` | Template de reporte con sección de IA |
| `rmhealth_mobile/src/screens/HistoryScreen.js` | Botón "Ver reporte semanal" |
| `rmhealth_mobile/src/screens/ReportScreen.js` | [NUEVO] Visualización del reporte |

#### Lo que NO debe hacer
- ❌ NO decir "diagnóstico" ni "enfermedad confirmada"
- ❌ NO sugerir tratamientos o medicamentos
- ❌ NO afirmar urgencia médica confirmada
- ❌ NO reemplazar consulta médica

#### Criterios de aceptación
- [ ] Reporte semanal generado con datos de los últimos 7 días
- [ ] Incluye tendencias de FC, SpO2, BP, glucosa, temperatura
- [ ] Lenguaje preventivo, no diagnóstico
- [ ] Disclaimer visible en cada reporte
- [ ] Exportable como PDF
- [ ] Fallback: si Gemini falla, generar reporte con estadísticas básicas (promedios, min/max)

#### ¿Afecta Play Store?
No — es contenido generado en backend, no afecta permisos ni declaraciones.

#### ¿Afecta regulación médica?
No, con las restricciones de lenguaje aprobadas.

#### Infraestructura requerida
- **GCP**: Vertex AI / Gemini API
- **Backend**: Sí — nuevo endpoint + generación
- **App Móvil**: Sí — pantalla de reporte + botón
- **Costo**: ~$50–200 MXN/mes (1 reporte/semana/usuario, ~2K tokens)

---

### P4 — Speech-to-Text (Accesibilidad) — NO APROBADO AÚN

#### Problema que resuelve
Adultos mayores o personas con movilidad reducida pueden tener dificultad para teclear valores vitales.

#### Costo estimado
~$20–80 MXN/mes (Google Cloud Speech-to-Text: $0.006 USD/15 seg)

#### ¿Por qué no es prioridad?
- Los valores vitales son numéricos y cortos (2-3 dígitos)
- El teclado numérico ya es eficiente
- Health Connect ya automatiza la entrada para usuarios con smartwatch
- Bajo ROI comparado con P1-P3

---

### ❌ Mejora ML con Vertex AI — NO APROBADO

#### Razón del rechazo
- El modelo GradientBoosting actual es determinista, auditable y validado
- Reemplazarlo con un modelo de caja negra de Vertex introduce riesgo regulatorio
- Entrenar modelos clínicos nuevos requiere datasets certificados
- **Riesgo**: Si la clasificación cambia, todo el sistema de alertas y emergencias podría verse afectado
- **Conclusión**: El motor ML no se toca

---

## 5. Riesgos Generales

| Riesgo | Probabilidad | Impacto | Mitigación |
|--------|-------------|---------|------------|
| Crédito Free Trial vence (jul 2026) sin usar | 🟡 Media | 🟢 Bajo | Priorizar FCM en junio 2026 |
| Gemini genera respuesta inadecuada | 🟡 Media | 🟡 Medio | Guardrails en prompt + validación + disclaimer forzado |
| FCM requiere google-services.json | 🟢 Baja | 🟢 Bajo | Firebase project ya existe |
| Play Store rechaza por uso de IA | 🟡 Media | 🟡 Medio | Declarar uso transparente + disclaimer visible |
| Datos PII enviados a Gemini | 🟢 Baja | 🔴 Alto | Anonimizar antes de enviar — solo vitales sin identidad |

---

## 6. Orden de Ejecución Recomendado

```
FASE 1 (Junio 2026) — Firebase Cloud Messaging
├── Crear Firebase App para Android
├── Configurar FCM en backend
├── Registrar token en app móvil
├── Implementar push para alertas preventivas
├── Implementar push para recordatorios de medicamentos
└── Testing E2E

FASE 2 (Julio-Agosto 2026) — RM Coach con Gemini
├── Activar feature flag GEMINI_EXPLAINER_ENABLED
├── Crear endpoint /api/coach/ask
├── Mejorar UI del asistente
├── Implementar fallback local
└── Testing con guardrails

FASE 3 (Septiembre 2026) — Reportes Preventivos
├── Crear endpoint /api/reports/weekly
├── Template PDF con sección IA
├── Pantalla de reporte en app
└── Testing y validación de lenguaje
```

---

## 7. Lo que NO conviene hacer todavía

1. **No activar servicios GCP** sin confirmar que el proyecto `rmhealth-494123` tiene billing vinculado a los créditos
2. **No usar Vertex para ML de triage** — riesgo regulatorio alto
3. **No meter Gemma/modelos locales en la app** — aumenta peso y complejidad
4. **No hacer deploy de cambios** hasta tener Fase 1 técnica aprobada
5. **No enviar datos PII a servicios cloud** sin anonimización previa

---

## 8. Siguiente paso

> **¿Se autoriza iniciar Fase 1 técnica (Firebase Cloud Messaging)?**
>
> Esto implica:
> - Configurar Firebase App para Android en el proyecto existente
> - Agregar `google-services.json` al proyecto móvil
> - Agregar dependencia `firebase-messaging` en `build.gradle`
> - Crear `PushNotificationService.js` en la app
> - Agregar canal FCM en `notification_service.py` del backend
> - NO deploy — solo código local + testing
