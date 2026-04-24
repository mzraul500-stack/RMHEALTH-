# 🗺️ MAPA COMPLETO DEL PROYECTO RMHEALTH
## Guía para el Fundador — "¿Dónde está cada cosa?"

**Última actualización:** 23 Abril 2026  
**Ubicación del proyecto:** `H:\RMHEALTH\`

---

## 📍 UBICACIÓN PRINCIPAL (Todo está aquí)

```
H:\RMHEALTH\
```

> ⚠️ **IMPORTANTE**: Esta es la ÚNICA carpeta que importa.
> Todo lo demás en tu computadora son versiones viejas y basura.
> Esta carpeta es tu "Disco de Oro".

---

## 🧠 EL CEREBRO (Backend — El servidor que piensa)

```
backend/
├── rmhealth_api.py          ← EL SERVIDOR PRINCIPAL (FastAPI)
│                               4 endpoints: vital-signs, emergencies/latest,
│                               emergencies/history, health
│                               JWT + API Token auth, PostgreSQL (Cloud SQL)
│
├── ai_engine.py             ← 🤖 MOTOR ML (GradientBoosting, 91.8% accuracy)
│                               Carga triage_classifier.joblib
│                               15 features ingenierizadas, 4 labels
│
├── __init__.py
│
└── services/                ← LOS MÓDULOS INTELIGENTES
    ├── medical_engine.py    ← 🧠 EL CEREBRO MÉDICO (Módulo de Juicio Crítico)
    │                           Override clínico sobre la predicción ML
    │                           Comorbilidades, tendencias, multiplicadores
    │
    ├── hospital_gateway.py  ← 🏥 DESPACHADOR DE AMBULANCIAS
    │                           Algoritmo GPS (Haversine) + FHIR R4 + HL7 V2
    │                           Encuentra el hospital más cercano
    │
    ├── notification_service.py ← 📱 NOTIFICACIONES (Twilio SMS)
    │                              Código real, necesita credenciales Twilio
    │
    └── __init__.py
```

> **Archivos eliminados el 22 de abril (dead code):**
> `ai_processor.py`, `hospital_alerts.py`, `supervisor.py`, `azure_config.py`
> Movidos a `H:\RMHEALTH\trash_temp\`

---

## 📱 LA APP MÓVIL (Lo que ve el paciente en su celular)

```
rmhealth_mobile/
├── App.js                   ← PUNTO DE ENTRADA (Stack Navigator, 5 pantallas)
├── index.js                 ← Registro de la app
├── package.json             ← Expo 54, React 19.1, React Native 0.81.5
├── app.json                 ← Configuración de Expo
├── eas.json                 ← Configuración de EAS Build
├── .env                     ← Variables de entorno (token API)
├── .env.example             ← Plantilla de variables
│
└── src/
    ├── api/
    │   └── client.js        ← 🔗 CONEXIÓN AL SERVIDOR
    │                           Token desde EXPO_PUBLIC_API_TOKEN (env)
    │                           Apunta a Google Cloud Run
    │
    ├── components/
    │   ├── EmergencyButton.js ← 🆘 BOTÓN SOS (5 seg + animación de pulso)
    │   ├── VitalCard.js       ← 💓 TARJETA DE SIGNOS VITALES
    │   └── Logo.js            ← Logo de RMHealth
    │
    ├── screens/
    │   ├── HomeScreen.js      ← 📊 PANTALLA PRINCIPAL
    │   │                         Formulario manual de signos vitales
    │   │                         Envío a IA + visualización de resultado ML
    │   │                         Nav bar: 💊 📋 ⌚ 👤
    │   ├── HistoryScreen.js   ← 📈 HISTORIAL de emergencias (API fetch)
    │   ├── ProfileScreen.js   ← 👤 PERFIL del paciente (editable)
    │   └── DeviceSettingsScreen.js ← ⌚ CONFIGURACIÓN de relojes/wearables
    │
    ├── hooks/
    │   ├── useVitalsSimulation.js ← 🔄 SIMULADOR de signos vitales (demos)
    │   └── useRealVitals.js       ← 📡 CONEXIÓN REAL Health Connect
    │                                  (pendiente Galaxy Watch)
    │
    ├── services/
    │   ├── healthConnect.js       ← 🏥 SDK Health Connect (pendiente)
    │   └── NotificationService.js ← 🔔 ALARMAS LOCALES de medicamentos
    │                                  (expo-notifications)
    │
    ├── features/
    │   └── medications/           ← 💊 MÓDULO DE MEDICAMENTOS
    │       ├── components/
    │       │   ├── MedicationCard.js      ← Tarjeta individual
    │       │   ├── AddMedicationForm.js   ← Formulario para agregar
    │       │   └── AdherenceDashboard.js  ← Dashboard % adherencia
    │       ├── hooks/
    │       │   └── useMedications.js      ← Hook CRUD (AsyncStorage)
    │       │                                 + notificaciones automáticas
    │       ├── screens/
    │       │   └── MedicationScreen.js    ← Pantalla principal medicinas
    │       └── data/
    │           └── medications_mock.json  ← Datos semilla (3 medicinas)
    │
    └── theme/
        └── index.js           ← 🎨 COLORES y ESPACIADO de la marca
                                  primary: #3BAFAA (Teal)
                                  secondary: #1B4F72 (Azul médico)
```

---

## 🏥 DASHBOARDS (Lo que ven los médicos y hospitales)

```
hospital_dashboard.html      ← 🖥️ PANTALLA DEL HOSPITAL
                                Los médicos ven alertas en tiempo real
                                Token solicitado al usuario (no hardcoded)

history_dashboard.html       ← 📊 DASHBOARD DE HISTORIAL
                                Vista de tendencias del paciente
                                Token solicitado al usuario (no hardcoded)
```

---

## 🏗️ INFRAESTRUCTURA (Cómo se instala y despliega)

```
infrastructure/
├── docker-compose.yml       ← 🐳 INSTALADOR DOCKER (un click)
├── Dockerfile               ← Receta para crear el contenedor
├── Dockerfile.containerApps ← Versión para Azure
├── deploy.ps1               ← 🚀 SCRIPT DE DEPLOY
├── entrypoint.sh            ← Script de arranque del servidor
│
├── init_database.sql        ← 💾 BASE DE DATOS (estructura)
├── setup_medical_database.sql ← 💾 TABLAS MÉDICAS completas
├── wearable_database_extension.sql ← 💾 TABLAS del brazalete
├── create_patients_table.sql ← 💾 TABLA DE PACIENTES
├── setup_azure_postgresql.ps1 ← Crear la BD en Azure
│
├── azure.yaml               ← Configuración Azure
└── .env.containerApps       ← Variables de entorno
```

> **Archivos eliminados el 22 de abril:**
> `cache_unificado.py` y `data_sealer.py` — Movidos a trash

---

## 🤖 MODELOS DE IA (Los cerebros entrenados)

```
models/
├── triage_classifier.joblib ← 🧠 CLASIFICADOR DE TRIAJE (5.4 MB)
│                               GradientBoosting, 91.8% accuracy
│                               8,000 muestras, 15 features
├── hospital_scorer.joblib   ← 🏥 PUNTUADOR DE HOSPITALES (699 KB)
├── normalization_params.json ← Parámetros de normalización
└── triage_metrics.json      ← Métricas de precisión del modelo
```

> **Archivo eliminado:** `medical_models.py` — Movido a trash el 22 de abril

---

## 📋 DOCUMENTOS LEGALES Y DE NEGOCIO

```
compliance/
├── PROTECCION_LEGAL_INTEGRAL.md     ← ⚖️ BLINDAJE LEGAL (FDA/COFEPRIS/HIPAA)
└── REGISTRO_PROPIEDAD_INTELECTUAL.txt ← 📝 Registro INDAUTOR

ANALISIS_NEGOCIO.md          ← 💰 ANÁLISIS DE RENTABILIDAD
RMHEALTH_INVESTOR_DECK.md    ← 📊 PITCH DECK PARA INVERSIONISTAS
AZURE_PARTNERSHIP_EMAIL.md   ← 📧 Email de alianza con Azure
RMHEALTH_ORIGEN.md           ← 📜 ORIGEN E HISTORIA DEL PROYECTO
README.md                    ← 📖 MANUAL TÉCNICO GENERAL
```

---

## 📁 ARCHIVOS DE CONFIGURACIÓN

```
Dockerfile                   ← 🐳 Receta Docker (raíz, Google Cloud Run)
requirements.txt             ← 📦 Lista de dependencias Python
.env.example                 ← 📋 Plantilla de variables de entorno
.gitignore                   ← Archivos ignorados por Git
.gcloudignore                ← Archivos ignorados por Google Cloud
test_cerebro.py              ← 🧪 Pruebas del cerebro médico
test.py                      ← 🧪 Pruebas generales
INSTALAR_RMHEALTH.ps1        ← ⚡ Script de instalación PowerShell
walkthrough.md               ← 📝 Guía paso a paso
MEMORY_BANK.md               ← 🧠 CONTEXTO PARA IA (leer primero)
MAPA_DEL_PROYECTO.md         ← 🗺️ ESTE ARCHIVO
```

---

## ❌ CARPETAS VIEJAS QUE YA NO NECESITAS

| Carpeta | Veredicto |
|---|---|
| `L:\RM_HEALTH_AGI_ECOSYSTEM\` | ❌ Código viejo, ya extrajimos lo útil |
| `L:\RMHealth_Ecosystem\` | ❌ Versión anterior, ya rescatamos lo valioso |
| `F:\Codigos RmHealth\` | ❌ Rescatamos hospital_alerts y supervisor |
| `G:\AGI AZURE\` | ⚠️ Otro proyecto (AGI), no es RMHealth |
| `H:\RMHEALTH\trash_temp\` | 🗑️ Dead code eliminado el 22 de abril |

> **Regla de oro**: Si no está en `H:\RMHEALTH\`, no existe.

---

## 🔢 ESTADÍSTICAS DEL PROYECTO

| Métrica | Valor |
|---|---|
| Archivos de código fuente | ~50 archivos |
| Líneas de código estimadas | ~7,000+ líneas |
| Tamaño total del proyecto | ~6.5 MB (sin node_modules) |
| Lenguajes usados | Python (backend), JavaScript (app), SQL (base de datos), HTML (dashboards) |
| Modelos de IA incluidos | 2 (triage_classifier + hospital_scorer) |
| Pantallas móviles | 5 (Home, Medications, History, DeviceSettings, Profile) |
| Documentos legales | 2 (protección legal + registro IP) |
| Documentos de negocio | 5 (análisis + pitch + email + origen + README) |
