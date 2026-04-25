# RMHEALTH — PITCH DECK
### El sistema que activa una ambulancia antes de que el paciente sepa que la necesita.

**Versión**: 1.0 | **Fecha**: Abril 2026  
**Contacto**: rm@rmhealth.com.mx | rmhealth.ai  
**Propiedad Intelectual**: INDAUTOR 03-2025-070109072500-01

---

## SLIDE 1 — EL PROBLEMA
### Cada año mueren miles de mexicanos por una razón evitable: llegaron tarde.

La hipertensión arterial y la diabetes mellitus son las dos principales causas de muerte en México.

| Dato | Cifra |
|------|-------|
| Mexicanos con hipertensión | **30+ millones** |
| Mexicanos con diabetes | **12.4 millones** |
| Hipertensos sin diagnóstico | **40% no lo sabe** |
| Muertes por enfermedades del corazón | **#1 causa de muerte en México** |
| Muertes por diabetes | **89.2 por cada 100,000 habitantes** |

> *Fuente: ENSANUT 2022, INEGI 2023*

**El problema no es que no haya tratamiento.**
**El problema es que nadie detecta la crisis a tiempo.**

Cuando el paciente siente los síntomas, muchas veces ya es demasiado tarde.
Cuando llega al hospital, el médico no tiene información de lo que pasó antes.

---

## SLIDE 2 — LA SOLUCIÓN
### RMHealth: El primer ecosistema médico que cierra el ciclo completo de emergencia.

```
PACIENTE usa brazalete o su smartwatch actual
       ↓
SENSORES miden signos vitales cada 30 segundos
(ritmo cardíaco, presión arterial, SpO2, glucosa)
       ↓
IA ANALIZA tendencias en tiempo real
(no solo valores puntuales — detecta patrones de riesgo)
       ↓
ANOMALÍA CRÍTICA detectada (incluso asintomática)
       ↓
PROTOCOLO AUTOMÁTICO se activa en segundos:
  1. Localiza GPS al paciente
  2. Identifica hospital más cercano con capacidad
  3. Envía informe médico estructurado (FHIR/HL7)
  4. Notifica a contactos de emergencia
  5. Hospital despacha ambulancia con datos del paciente
       ↓
AMBULANCIA llega con información clínica completa
       ↓
CICLO CERRADO — Hospital confirma atención al sistema
```

**El paciente no tiene que hacer nada. El sistema actúa por él.**

---

## SLIDE 3 — DIFERENCIADORES
### ¿Por qué no Apple Watch, Fitbit o Samsung?

| Característica | Apple Watch | Fitbit | Samsung | **RMHealth** |
|---|---|---|---|---|
| Enfoque médico real | ❌ Fitness | ❌ Fitness | ⚠️ Parcial | ✅ Médico |
| Alerta automática a hospital | ❌ | ❌ | ❌ | ✅ |
| Informe clínico FHIR/HL7 | ❌ | ❌ | ❌ | ✅ |
| Glucosa no invasiva | ❌ | ❌ | ❌ | ✅ (Fase 2) |
| IA predictiva crónicas | ❌ | ❌ | ❌ | ✅ |
| Confirmación médica del ciclo | ❌ | ❌ | ❌ | ✅ |
| Compatible con watches actuales | N/A | N/A | N/A | ✅ |
| Precio accesible México | $700 USD | $200 USD | $400 USD | $299 USD |

> **La diferencia clave**: ellos detectan. RMHealth actúa.

---

## SLIDE 4 — PRODUCTO
### Tres componentes. Un ciclo completo.

### 1. Brazalete RMHealth (Hardware)
- Sensores: PPG (ritmo cardíaco + SpO2 + presión arterial)
- Sensor NIR para glucosa no invasiva (Fase 2)
- Acelerómetro (detección de caídas)
- GPS integrado, Bluetooth 6.0, WiFi
- Batería 48 horas de monitoreo continuo
- Certificación IP67, materiales biocompatibles
- **Precio objetivo: $299 USD** (Costo de fabricación ~$85, margen bruto ~72%)

### 2. App RMHealth (Software)
- Compatible con iOS y Android
- **También funciona con**: Apple Watch, Samsung Galaxy Watch, Google Pixel Watch, Huawei Watch, Fitbit
- Dashboard de signos vitales en tiempo real
- Gestión de medicamentos y recordatorios
- Historial clínico del paciente
- **Disponible en**: rmhealth.ai

### 3. Plataforma en la Nube (Backend)
- Infraestructura en **Azure + Google Cloud** (multi-cloud, failover automático)
- Motor de IA: análisis predictivo con modelos clínicos validados
- Estándares médicos: **FHIR R4 + HL7 V2** (compatible con cualquier hospital)
- Cumplimiento: **HIPAA + GDPR**
- Dashboard hospitalario para sala de urgencias
- Dashboard ejecutivo para gestión médica B2B
- **API abierta para integración con sistemas HIS/EHR**

---

## SLIDE 5 — TRACCIÓN
### No somos una idea. Somos un sistema funcionando.

| Hito | Estado |
|------|--------|
| Propiedad intelectual registrada (INDAUTOR) | ✅ Completado |
| Backend API en producción (2 nubes) | ✅ Completado |
| Dominio y sitio web rmhealth.ai activo | ✅ Completado |
| Dashboard hospitalario funcional | ✅ Completado |
| Motor de IA médico validado (infarto, crisis hipertensiva, hipoglucemia, fibrilación) | ✅ Completado |
| Integración FHIR R4 + HL7 V2 implementada | ✅ Completado |
| Infraestructura Azure (Key Vault, ACR, PostgreSQL) | ✅ Completado |
| Enrutamiento inteligente GPS (Haversine) | ✅ Completado |
| Supervisión médica "Human-in-the-loop" | ✅ Completado |
| App móvil React Native (iOS + Android) | 🔄 En desarrollo |
| Prototipo brazalete físico | 🔜 Pendiente funding |
| Piloto clínico hospitalario | 🔜 Pendiente alianza |

**Todo lo anterior fue construido por el fundador con IA y $0 en salarios de desarrollo.**

---

## SLIDE 6 — MERCADO
### Un problema de escala global con entrada por México.

### Mercado Total Direccionable (TAM)
- **Global wearables médicos 2026**: $50,000 millones USD
- **Latinoamérica**: $2,800 millones USD
- **México**: $850 millones USD

### Mercado Objetivo Inicial (SOM — 3 años)
- **Target primario**: adultos 45-70 años con hipertensión o diabetes, nivel socioeconómico C+ en México
- **Población objetivo**: 4.2 millones de personas
- **Penetración objetivo Año 3**: 1% = **42,000 usuarios activos**
- **Ingreso proyectado Año 3**: $28.7 millones USD

### Por qué México primero
1. Mayor tasa de diabetes de la OCDE
2. Infraestructura hospitalaria privada en crecimiento
3. Mercado de wearables creciendo 18% anual
4. Regulación COFEPRIS más ágil que FDA para MVP
5. Trampolín natural hacia EUA (40M latinos con diabetes)

---

## SLIDE 7 — MODELO DE NEGOCIO
### Tres fuentes de ingreso. Recurrencia desde el mes 1.

### B2C — Consumidor Final

| Plan | Precio | Incluye |
|------|--------|---------|
| App únicamente | $9.99/mes | Monitoreo con su watch actual |
| App + Brazalete | $299 USD + $19.99/mes | Hardware + monitoreo completo |
| Plan Familiar | $49.99/mes | Hasta 4 usuarios |

### B2B — Hospitales y Clínicas
- **Implementación**: $5,000–$50,000 USD
- **Licencia mensual por cama monitoreada**: $25–$75 USD
- **Dashboard ejecutivo**: $500/mes por institución

### B2B2C — Aseguradoras
- **Revenue sharing**: 3–8% de primas de pacientes monitoreados
- **Lógica**: cada emergencia prevenida ahorra $15,000–$80,000 USD en hospitalización a la aseguradora

### Proyección simplificada

| Año | Usuarios | Ingresos | CAC | LTV/CAC |
|-----|----------|----------|-----|---------|
| 2026 | 2,500 | $1.2M USD | ~$80 | 9:1 |
| 2027 | 12,000 | $8.5M USD | ~$65 | 11:1 |
| 2028 | 45,000 | $28.7M USD | ~$50 | 14:1 |

> *CAC = Costo de Adquisición. LTV = $720 (suscripción promedio $240/año × 3 años).*

---

## SLIDE 8 — HOJA DE RUTA
### De validación a escala en 4 fases.

### FASE 1 — Validación (2026) 🎯 ETAPA ACTUAL
- Piloto clínico con 50–200 pacientes
- 1 hospital aliado para prueba del ciclo de emergencia
- App móvil completa en App Store y Google Play
- Inicio proceso COFEPRIS (clasificación como dispositivo de bienestar)

**Inversión requerida**: $500K–$1.5M USD  
**Fuentes objetivo**: Capital semilla, Microsoft for Startups, CONAHCYT, alianza hospitalaria

### FASE 2 — Lanzamiento (2027)
- Producción primer lote: 1,000 brazaletes
- 3–5 hospitales integrados
- Integración con aseguradoras (GNP, AXA, Metlife)
- Certificación COFEPRIS obtenida

**Inversión requerida**: $5M USD (Serie A)

### FASE 3 — Escala México (2028–2029)
- 10,000 brazaletes/mes
- Red de 50+ hospitales
- Expansión a Colombia, Chile, Brasil

**Inversión requerida**: $12M USD (Serie B)

### FASE 4 — Expansión Global (2030+)
- Entrada a mercado hispano en EUA (40M personas)
- Integración nanotecnología (biosensores avanzados)
- Certificación FDA

---

## SLIDE 9 — LO QUE BUSCAMOS HOY
### Una alianza estratégica, no solo dinero.

### Necesidad inmediata: $500K–$1.5M USD (Semilla)

| Uso de Fondos | % | Monto |
|---|---|---|
| Prototipo y primer lote (20–50 brazaletes) | 35% | $175K–$525K |
| Proceso COFEPRIS + certificaciones | 20% | $100K–$300K |
| Equipo técnico (CTO + 1 desarrollador) | 25% | $125K–$375K |
| Piloto clínico hospitalario | 15% | $75K–$225K |
| Operación y marketing inicial | 5% | $25K–$75K |

### Más importante que el dinero: el aliado correcto

**Buscamos activamente:**

✅ **Hospital o red médica** dispuesta a ejecutar el piloto clínico
→ Lo que ofrece RMHealth: el sistema completo instalado y operado sin costo durante el piloto

✅ **Aseguradora** interesada en reducir siniestralidad por crónicas
→ Lo que ofrece RMHealth: datos de monitoreo preventivo de sus asegurados

✅ **Fondo de inversión** con tesis en HealthTech / MedTech Latam
→ Lo que ofrece RMHealth: tecnología lista, IP protegida, tracción real

---

## SLIDE 10 — POR QUÉ AHORA. POR QUÉ RMHEALTH.

### El momento es único

- El mercado de wearables médicos **crece 18% anual**
- Post-COVID: los pacientes y hospitales **ya adoptaron telemedicina**
- Los smartwatches están en **millones de muñecas mexicanas** hoy
- La IA médica pasó de ciencia ficción a **estándar clínico**

### La tecnología ya existe y funciona

- API médica en producción en **2 nubes simultáneas**
- Motor de IA validado con **4 escenarios clínicos reales**
- Integración **FHIR/HL7** lista para conectar cualquier hospital
- Compatible con **Apple Watch, Samsung, Google, Huawei, Fitbit**

### La propiedad intelectual está protegida

- Registro **INDAUTOR 03-2025-070109072500-01**
- Proceso de patente en preparación (12 reivindicaciones)
- **Ventana de 18 meses** antes de que Big Tech voltee a este segmento

### El fundador construyó esto con cero salarios de desarrollo

Eso demuestra dos cosas:
1. **Convicción real** en el proyecto
2. **Capacidad de ejecutar** con recursos limitados

---

> *"La hipertensión es el asesino silencioso porque no duele.*
> *RMHealth es el guardián silencioso porque nunca duerme."*

---

**RAÚL MORALES ZEPEDA — FUNDADOR**  
📧 rm@rmhealth.com.mx  
🌐 rmhealth.ai  
📋 INDAUTOR: 03-2025-070109072500-01  
☁️ Infraestructura: Microsoft Azure + Google Cloud

---
*Documento confidencial. Todos los derechos reservados.*
*Propiedad intelectual registrada ante INDAUTOR.*
