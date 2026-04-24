# 🗺️ HOJA DE RUTA TÉCNICA — RMHEALTH EN GOOGLE CLOUD
## Plan Simplificado de Despliegue (Fase 1)

**Autor:** Raúl Morales Zepeda (rm@rmhealth.com.mx)  
**Fecha:** Abril 2026  
**Objetivo:** Poner RMHealth en producción con el mínimo costo posible

---

## REGLA DE ORO
> No implementes TODO lo que Google Cloud ofrece.
> Implementa solo lo que NECESITAS para tu primera venta.

---

## FASE 1 — SALIR A PRODUCCIÓN ($35-80 USD/mes)

### Paso 1: Cloud Run (El Servidor)
- **Qué es:** Un servicio que ejecuta tu código Python en la nube
- **Qué hacer:** Subir `rmhealth_api.py` + `Dockerfile` a Cloud Run
- **Ventaja:** Se apaga solo cuando nadie lo usa (pagas $0 de noche)
- **Costo:** ~$5-50/mes según tráfico
- **Tiempo:** 1 día con un CTO

### Paso 2: Cloud SQL (La Base de Datos)
- **Qué es:** PostgreSQL administrado por Google
- **Qué hacer:** Crear instancia + ejecutar `init_database.sql`
- **Ventaja:** Google hace los backups automáticos
- **Costo:** ~$30/mes (instancia mínima)
- **Tiempo:** 2 horas

### Paso 3: Firebase (Notificaciones + Hosting)
- **Qué es:** Plataforma de Google para apps móviles
- **Qué hacer:** 
  - Configurar Firebase Cloud Messaging (notificaciones push)
  - Subir `hospital_dashboard.html` a Firebase Hosting
- **Ventaja:** GRATIS hasta 10,000 mensajes/día
- **Costo:** $0
- **Tiempo:** 1 día

### Paso 4: Vertex AI AutoML (La IA Predictiva)
- **Qué es:** Google entrena un modelo de IA con tus datos
- **Qué hacer:** Subir CSV con datos clínicos → AutoML lo entrena solo
- **Cuándo:** Cuando tengas datos del piloto clínico
- **Costo:** ~$200 (una sola vez)
- **Tiempo:** 1 semana

### COSTO TOTAL MENSUAL FASE 1: ~$35-80 USD

---

## COSAS QUE NO NECESITAS EN FASE 1

| Servicio Google | ¿Para qué sirve? | ¿Cuándo lo necesitas? |
|---|---|---|
| BigQuery | Analizar petabytes de datos | Fase 3 (50,000+ usuarios) |
| Pub/Sub | Mensajería para millones de dispositivos | Fase 3 |
| Dataflow | Procesamiento masivo de datos | Fase 3 |
| Vertex AI Pipelines | Orquestar equipos de data science | Fase 4 |
| Feature Store | Gestionar features de ML | Fase 4 |
| Multi-región | Redundancia geográfica | Fase 3 ($$$) |

---

## FASE 2 — ESCALAR ($200-500 USD/mes)

### Cuando tengas 1,000-5,000 usuarios:
- Subir tier de Cloud SQL (más RAM, más conexiones)
- Activar Vertex AI Endpoint para predicciones en tiempo real
- Integrar Twilio para SMS de emergencia (~$0.05/SMS)
- Configurar Cloud Monitoring para alertas de infraestructura

---

## FASE 3 — PRODUCCIÓN MASIVA ($1,000-5,000 USD/mes)

### Cuando tengas 10,000+ usuarios:
- Migrar analítica a BigQuery
- Implementar Pub/Sub para ingesta masiva
- Configurar multi-región para alta disponibilidad
- Equipo de DevOps dedicado

---

## RESUMEN VISUAL

```
HOY (Abril 2026)
│
├── Tu código funciona localmente ✅
│
├── PASO 1: Cloud Run ──────── $5-50/mes ── 1 día
├── PASO 2: Cloud SQL ──────── $30/mes ──── 2 horas  
├── PASO 3: Firebase ────────── $0 ────────── 1 día
│
│   ═══════════════════════════════════
│   TOTAL: ~$35-80/mes = RMHEALTH EN PRODUCCIÓN
│   ═══════════════════════════════════
│
├── PASO 4: Vertex AI AutoML ── $200 ──── 1 semana
│   (cuando tengas datos del piloto)
│
└── FUTURO: BigQuery, Pub/Sub, Multi-región
    (cuando tengas inversión Serie A)
```

---

## PARA SOLICITAR CRÉDITOS GRATUITOS DE GOOGLE

1. **Google for Startups Cloud Program**
   - Hasta **$100,000 USD en créditos** gratuitos
   - URL: https://cloud.google.com/startup
   - Requisito: Tener un producto funcional (✅ lo tienes)

2. **Google Cloud Free Tier**
   - Cloud Run: 2 millones de requests/mes GRATIS
   - Cloud SQL: No incluido en free tier
   - Firebase: Hosting + Messaging GRATIS

---

*Documento creado por Raúl Morales Zepeda*
*rm@rmhealth.com.mx | rmhealth.ai*
*INDAUTOR: 03-2025-070109072500-01*
