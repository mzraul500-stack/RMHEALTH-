# 🧠 RMHEALTH — MEMORY BANK
**Last updated:** April 23, 2026  
**Project author:** Raúl Morales Zepeda  
**INDAUTOR Registry:** 03-2025-070109072500-01  
**Language standard:** English (all code, comments, docs)

> **INSTRUCTION FOR ANY AI ASSISTANT:** Read this file completely before working
> on the project. Do NOT invent features that don't exist. Do NOT inflate capabilities.
> Be honest about what works and what doesn't.

---

## 1. WHAT IS RMHEALTH

RMHealth is a **patented communication process** for real-time remote vital sign
monitoring and automated emergency alerting to hospitals and emergency contacts.

**The patent covers the PROCESS, not the hardware.** The complete cycle:
1. Wearable captures vital signs (via existing smartwatches)
2. Mobile app receives data via Health Connect / HealthKit
3. Server analyzes with ML model and classifies triage level
4. If emergency → finds nearest hospital → sends FHIR/HL7 structured report
5. Notifies emergency contacts with GPS location
6. Hospital confirms reception and provides care
7. Emergency cycle is closed

**No product on the market completes this full cycle today.**

---

## 2. FIRM ARCHITECTURAL DECISIONS

| Decision | Detail | Date |
|---|---|---|
| No custom hardware | Use existing smartwatches (Samsung Galaxy Watch, Apple Watch) | April 2026 |
| Glucose via external CGM | FreeStyle Libre / Dexcom patches, NOT custom NIR sensor | April 2026 |
| Initial focus: hypertension + heart rate | Glucose integrates when CGM is available via Health Connect | April 2026 |
| Backend: Python/FastAPI | Deployed on Google Cloud Run | Jan 2026 |
| Mobile app: Expo/React Native | Android first. Health Connect integration pending | April 2026 |
| ML Model: GradientBoosting | No LLMs, no Ollama, no deep learning. Statistical classifier only | Jan 2026 |
| No AGI, no GPS Semantico, no quantum computing, no Trinary Logic | Those were separate research projects, archived in `_LEGACY_ARCHIVE`. They do NOT exist in RMHealth. | April 2026 |
| **Arquitectura Binaria Estricta** | RmHealth uses standard binary architecture ONLY. Experimental logic (Trinary, AGI, Antigravity) is prohibited in this directory. | April 2026 |
| All code and docs in English | Industry standard for global collaboration | April 2026 |

---

## 3. WHAT IS BUILT AND WORKING

### Backend API (FastAPI) — ✅ OPERATIONAL
- **File:** `backend/rmhealth_api.py` (~530 lines)
- **Endpoints:**
  - `POST /api/vital-signs` — ML triage + heuristic analysis + hospital routing
  - `GET /api/emergencies/history` — Emergency history (last 50)
  - `GET /api/emergencies/latest` — Latest emergency (hospital polling)
  - `GET /health` — Health check
- **Auth:** JWT + API Secret Token from environment variables (no defaults)
- **Database:** PostgreSQL (vital_signs, emergency_alerts)

### ML Triage Engine (ai_engine.py) — ✅ OPERATIONAL (RECONNECTED April 22, 2026)
- **File:** `backend/ai_engine.py`
- **Model:** GradientBoosting, 91.8% accuracy, 8,000 training samples
- **Features:** 15 engineered features including pulse pressure, MAP, shock index
- **Labels:** BAJO, MEDIO, ALTO, CRITICO
- **Integration:** Called FIRST in `/api/vital-signs`, then MedicalEngine provides clinical override
- **Safety-first:** The MORE SEVERE assessment (ML vs heuristic) wins
- **Fallback:** If model fails to load, heuristic rules handle everything
- **Model file:** `models/triage_classifier.joblib` (5.4 MB)
- **Verified:** Self-test passes with 3/3 correct predictions

### Medical Engine (medical_engine.py) — ✅ OPERATIONAL
- Multi-factorial analysis: vitals + trend + patient context + falls
- Comorbidity multipliers (diabetes, hypertension, heart disease)
- Temporal trend analysis

### Hospital Gateway (hospital_gateway.py) — ✅ GENERATES DOCUMENTS
- Generates FHIR R4 Bundles with real LOINC codes
- Generates HL7 v2.x messages (MSH|PID|PV1|OBX)
- GPS distance calculation via Haversine
- **BUT:** Hospital data is demo, not real connections

### Mobile App — ⚠️ PARTIAL
- Expo/React Native
- Screens: Home, Profile, History, DeviceSettings
- **NOT connected to Health Connect**
- Uses simulated data

---

## 4. WHAT DOES NOT WORK / DOES NOT EXIST

| Component | Status | Detail |
|---|---|---|
| Health Connect integration | ⚠️ Code written, NOT tested | `healthConnect.js` + `useRealVitals.js` exist but need Galaxy Watch |
| Real SMS/push notifications | ⚠️ Code ready, needs Twilio credentials | `notification_service.py` has full Twilio integration, logs in simulation |
| Real hospital connection | ❌ Demo data | Hospital endpoints are empty strings, need agreements |
| Glucose from CGM | ❌ Defaulted to 90.0 | Needs FreeStyle Libre / Dexcom via Health Connect |
| Patient profile from DB | ❌ Hardcoded age=65 | API uses mock PatientContext, needs real user profiles |
| Offline mode | ❌ Not implemented | Design pending |
| AES-256 encryption at rest | ❌ Not implemented | HTTPS yes, data at rest no |
| GPS Semantico | ❌ DOES NOT EXIST | Never existed in RMHealth. Archived in `_LEGACY_ARCHIVE`. |
| Trinary Logic | ❌ DOES NOT EXIST | Never existed in RMHealth. Archived in `_LEGACY_ARCHIVE`. |

---

## 5. KNOWN SECURITY ISSUES — RESOLVED

1. ~~**Hardcoded secrets with fallback defaults**~~ — ✅ FIXED April 22, 2026. `API_SECRET_TOKEN`, `JWT_SECRET_KEY`, `DB_PASS` now have NO defaults. API refuses to authenticate and DB refuses to connect if env vars are missing.
2. ~~**Open CORS**~~ — ✅ FIXED April 22, 2026. `allow_origins` now reads from `CORS_ORIGINS` env var. Defaults to `*` with a logged warning.
3. **No connection pooling** — New DB connection created per request. (Acceptable for current scale.)
4. ~~**Device endpoint lies**~~ — Status cleaned in previous session.
5. ~~**Auto-admin role grant**~~ — ✅ FIXED April 22, 2026. Demo token now grants `role: "user"`, not `"admin"`.
6. ~~**Tokens hardcoded in dashboards**~~ — ✅ FIXED April 22, 2026. `history_dashboard.html` and `hospital_dashboard.html` now prompt for token.
7. ~~**Token hardcoded in mobile client**~~ — ✅ FIXED April 22, 2026. `client.js` now reads from `EXPO_PUBLIC_API_TOKEN` env var.

---

## 6. FILE STRUCTURE

```
rmhealth_clean/
├── backend/
│   ├── ai_engine.py            ← ML triage classifier (LOADS triage_classifier.joblib)
│   ├── rmhealth_api.py         ← Main FastAPI application
│   ├── __init__.py
│   └── services/
│       ├── medical_engine.py    ← Multi-factorial clinical override (WORKS)
│       ├── hospital_gateway.py  ← FHIR/HL7 + Haversine GPS routing (WORKS)
│       ├── notification_service.py ← Twilio SMS (real code, needs credentials)
│       └── __init__.py
├── models/
│   ├── triage_classifier.joblib  ← Trained GradientBoosting model (5.4 MB)
│   ├── hospital_scorer.joblib    ← Hospital selection model (not yet connected)
│   ├── normalization_params.json
│   └── triage_metrics.json       ← Model performance metrics
├── rmhealth_mobile/              ← Expo/React Native mobile app
│   ├── src/screens/              ← Home, History, Profile, DeviceSettings
│   ├── src/hooks/                ← useVitalsSimulation (active), useRealVitals (pending)
│   ├── src/services/             ← healthConnect.js (pending Galaxy Watch)
│   ├── src/api/client.js         ← API client (token from env)
│   └── src/features/medications/ ← Medication module (AsyncStorage)
├── Dockerfile                    ← Google Cloud Run ready
├── requirements.txt              ← Python dependencies
├── .env.example                  ← Environment variable template
├── history_dashboard.html        ← B2B history dashboard
├── hospital_dashboard.html       ← B2B real-time hospital dashboard
├── MEMORY_BANK.md                ← THIS FILE
└── README.md                     ← Project documentation
```

Dead code moved to `H:\RMHEALTH\trash_temp\` on April 22, 2026:
- `supervisor.py`, `hospital_alerts.py`, `hospital_integration.py`
- `cache_unificado.py`, `data_sealer.py`, `medical_models.py`

---

## 7. EXPERT DEVELOPMENT ROADMAP (Next Steps)

> **STATUS:** Base architecture is solid and deployed. The following 5-phase plan defines the exact technical steps to convert the current "Simulated MVP" into a "Production-Ready Medical Device".

### Phase 1: RMHealth 2.0 Frontend (No hardware required)
*Medication Management module — CODE COMPLETE, pending device deployment.*
1. [x] **Medication CRUD:** Built React Native screens for adding medications (name, dosage, frequency, instructions). Files: `src/features/medications/`
2. [x] **Local Storage:** Implemented `AsyncStorage` with custom hook `useMedications.js` (defensive JSON parsing, storage-full alerts, ISO timestamps).
3. [ ] **Scheduling Engine:** Implement `expo-notifications` for local push reminders based on the medication schedule.
4. [ ] **Adherence Tracking:** Create a visual dashboard (calendar/chart) showing taken vs. missed medications.
5. [x] **Navigation:** Added large, accessible nav buttons (💊 MEDICINAS, 📋 HISTORIAL, ⌚ RELOJES, 👤 PERFIL) to HomeScreen.

### ✅ CRITICAL BLOCKER RESOLVED
> **Problem:** The installed app on the phone was an old cached version.
> **Resolution (April 23, 2026):** Java 17 was configured, Gradle locks were cleared, Windows long-path limits were bypassed by moving the project to `H:\RMHEALTH_ACTUALIZADO`, and the final standalone Release APK was successfully built and installed on the S23 Ultra.

### Phase 2: Hardware Integration (Requires Galaxy Watch + S23 Ultra)
*Connecting the physical sensors to the React Native app.*
5. [ ] **Procurement:** Acquire Samsung Galaxy Watch 4 (or FE).
6. [ ] **Dev Environment:** Build custom Expo development client (`npx expo run:android`) as Health Connect requires native modules.
7. [ ] **Sensor Sync:** Replace `useVitalsSimulation.js` with the newly created `useRealVitals.js` hook.
8. [ ] **Calibration:** Calibrate Watch BP sensor using a traditional arm cuff (mandatory Samsung requirement).

### Phase 3: External Communications (Requires Twilio)
*Activating the emergency dispatch pipeline.*
9. [ ] **Twilio Setup:** Register Twilio account, acquire phone number, and fund with minimum balance.
10. [ ] **Env Config:** Add `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and `TWILIO_PHONE_NUMBER` to `.env`.
11. [ ] **End-to-End Test:** Trigger a critical anomaly from the watch and verify the emergency contact receives the SMS with the Acapulco Google Maps link.

### Phase 4: ML Retraining & Medical Validation
*Upgrading from synthetic data to real human baselines.*
12. [ ] **Data Collection:** Wear the watch for 7 days to collect a real baseline dataset for Raúl.
13. [ ] **Model Retraining:** Retrain the `GradientBoosting` classifier (`triage_classifier.joblib`) using the real dataset to prevent false positives.
14. [ ] **Clinical Review:** Validate the AHA/WHO threshold overrides in `medical_engine.py` with a licensed physician.

### Phase 5: B2B Hospital Deployment (Demo Mode)
*Preparing the final pitch demonstration.*
15. [ ] **Hospital Dashboard:** Create a standalone React web dashboard that acts as the "Hospital Receiving Screen" (polling the `/api/emergencies/history` endpoint).
16. [ ] **Visual Red Alert:** Ensure the dashboard flashes red and plays an alarm sound when the FHIR payload is received from the Acapulco hospitals array.
17. [ ] **Investor Pitch:** Execute the live demo (Watch -> App -> Cloud -> SMS + Hospital Dashboard) using the 10-slide Pitch Deck.

---

## 7B. SESSION LOG — April 22, 2026

### Accomplishments
| # | Task | Status |
|---|------|--------|
| 1 | CTO Audit: Full architecture review and integrity declaration | ✅ Done |
| 2 | Deleted `ai_processor.py` (fake Deep Learning placeholder) | ✅ Done |
| 3 | Purged AGI/Trinary/Ollama references from all RMHealth code | ✅ Done |
| 4 | Cleaned hospital gateway placeholder URLs | ✅ Done |
| 5 | Added "Arquitectura Binaria Estricta" rule to Memory Bank | ✅ Done |
| 6 | Built Medication Module (`src/features/medications/`) with 5 new files | ✅ Done |
| 7 | Implemented AsyncStorage persistence with `useMedications.js` hook | ✅ Done |
| 8 | Redesigned HomeScreen nav bar with large accessible buttons | ✅ Done |
| 9 | Google for Startups application submitted | ✅ Done |
| 10 | Interview preparation document created (`PREPARACION_ENTREVISTA_GOOGLE.md`) | ✅ Done |
| 11 | Deleted `Sellos digitales` and `AGI AZURE` non-RMHealth folders | ✅ Done |
| 12 | Removed ALL hardcoded secrets from `rmhealth_api.py` (API token, JWT key, DB password) | ✅ Done |
| 13 | Removed auto-admin role grant for demo token | ✅ Done |
| 14 | Made CORS configurable via `CORS_ORIGINS` env var | ✅ Done |
| 15 | Removed hardcoded token from `client.js` (mobile), reads from `EXPO_PUBLIC_API_TOKEN` | ✅ Done |
| 16 | Removed hardcoded tokens from `history_dashboard.html` and `hospital_dashboard.html` | ✅ Done |
| 17 | Removed hardcoded token from `test.py` | ✅ Done |
| 18 | Created `rmhealth_mobile/.env.example` with token template | ✅ Done |

### New Files Created This Session
- `src/features/medications/data/medications_mock.json`
- `src/features/medications/components/MedicationCard.js`
- `src/features/medications/components/AddMedicationForm.js`
- `src/features/medications/hooks/useMedications.js`
- `src/features/medications/screens/MedicationScreen.js`
- `H:\RMHEALTH\AUDITORIA_TECNICA_CTO.md`
- `H:\RMHEALTH\PREPARACION_ENTREVISTA_GOOGLE.md`

### Pending for Next Session
1. Implement `expo-notifications` for medication reminders
2. Build adherence tracking calendar/chart
3. Test Real Vitals Sync via Health Connect once Galaxy Watch is procured.

---

## 7C. SESSION LOG — April 23, 2026

### Accomplishments
| # | Task | Status |
|---|------|--------|
| 1 | Database Migration: Provisioned Google Cloud SQL PostgreSQL and initialized schema | ✅ Done |
| 2 | Backend Deployment: Linked Cloud Run to Cloud SQL and deployed successfully | ✅ Done |
| 3 | Dependency Cleanup: Removed unused Azure libraries causing deployment crashes | ✅ Done |
| 4 | Simulation Purge: Removed fake vitals, added manual input form for real testing | ✅ Done |
| 5 | React Navigation Fix: Restored `App.js` stack navigator & fixed History Screen stub | ✅ Done |
| 6 | Env/Network Fix: Verified live API responds with 200 OK to the mobile app payload | ✅ Done |
| 7 | Build Fix: Moved workspace to `H:\RMHEALTH_ACTUALIZADO` to bypass Windows CMake 260 char limit | ✅ Done |
| 8 | Release Build: Successfully compiled standalone Release APK (app-release.apk) | ✅ Done |
| 9 | Direct Install: Bypassed Expo Go, pushed APK directly to S23 Ultra via ADB | ✅ Done |
| 10 | Security Cleanup: Removed legacy Azure Key Vault credential objects causing editor errors | ✅ Done |

---

## 7D. SESSION LOG — April 23, 2026 (Afternoon)

### Accomplishments
| # | Task | Status |
|---|------|--------|
| 1 | Critical Bug Fix: Import path in `useMedications.js` was wrong (`../../services` → `../../../services`), would crash on launch | ✅ Fixed |
| 2 | Notification Fix: `expo-notifications` trigger updated to `type: 'daily'` format required by Expo SDK 54 | ✅ Fixed |
| 3 | App Config: Bumped version to 2.0.0 (versionCode 2), added `expo-notifications` plugin + Android permissions (`POST_NOTIFICATIONS`, `SCHEDULE_EXACT_ALARM`, `RECEIVE_BOOT_COMPLETED`) | ✅ Done |
| 4 | AdherenceDashboard: Complete rewrite with animated circular progress, motivational messages, per-medication status pills, premium card design | ✅ Done |
| 5 | MedicationCard: Complete rewrite with animated mount, bounce on toggle, checkmark indicator, delete button, strikethrough for taken meds | ✅ Done |
| 6 | MedicationScreen: Upgraded to use theme colors, SafeAreaView, FlatList header pattern, empty state design | ✅ Done |
| 7 | APK v2.0 Build: Compiled Release APK (65.32 MB) from `H:\RMHEALTH` with JDK 17 | ✅ Done |
| 8 | Direct Install: APK pushed to S23 Ultra via ADB — installed successfully | ✅ Done |
| 9 | Workspace Migration: Confirmed `H:\RMHEALTH` (SSD) as primary workspace, all files intact | ✅ Done |

### Hostinger Domain
- **Domain:** `rmhealth.ai` (Hostinger)
- **Backend API:** Google Cloud Run (operational)
- **Pending:** Upload `hospital_dashboard.html` to Hostinger at `/hospital-dashboard/`

---

## 8. REFERENCE: ORIGINAL MODULE DOCUMENTATION

**Location:** `C:\Users\rmhea\OneDrive\Aplicaciones\NOTAS\3 Codigos de desarrollo\`

This directory contains ~35 conceptual design documents written during the early
planning phase. They describe the intended modules of the ecosystem using pseudocode
across Python, Kotlin, Swift, and C++. **These are design references, NOT functional
code.** Key modules documented:

- Vital signs monitoring (smartwatch sensors)
- Smartwatch ↔ mobile app synchronization (BLE)
- Server connection and data transmission
- GPS geolocation + nearest hospital search (PostGIS)
- Hospital interoperability (FHIR/HL7, WebSockets)
- Authentication and security (JWT, AES-256, OAuth 2.0)
- Predictive AI analysis (pattern detection)
- Emergency response optimization
- Offline mode with sync
- Energy consumption optimization
- Multi-region deployment
- Compliance and regulations (HIPAA, GDPR)

**Use these as conceptual reference, not as code to copy.**

---

## 9. CODING STANDARDS (mandatory for all new code)

### Python (Backend)
- **Style:** PEP 8 — 4 spaces, 79 char line limit, snake_case
- **Type hints:** Required on all function signatures
- **Docstrings:** Required on all classes and public functions (Google style)
- **Naming:** English only. `calculate_distance()` not `calcular_distancia()`
- **Imports:** stdlib → third-party → local, separated by blank lines
- **Error handling:** Specific exceptions, never bare `except:`
- **Logging:** Use `logging` module, never `print()` in production code
- **Security:** No secrets in code. Use `os.environ.get()` with NO default for sensitive values
- **Testing:** Each new module must have corresponding tests

### JavaScript / React Native (Mobile App)
- **Style:** ESLint recommended rules, 2 spaces, single quotes
- **Naming:** camelCase for variables/functions, PascalCase for components
- **Components:** Functional components with hooks, no class components
- **State:** useState/useReducer, no external state libraries unless justified
- **API calls:** async/await with try/catch, never unhandled promises

### General
- **Language:** All code, comments, variables, function names, docs → English
- **Chat with user:** Spanish
- **Git commits:** English, imperative mood (`Add health connect integration`)
- **No dead code:** If it doesn't work, mark it clearly or remove it
- **No fake status:** If a feature is not implemented, say `"planned"` not `"ready"`
- **Medical data:** All health thresholds must cite their source (AHA, WHO, etc.)

---

## 10. RULES FOR ANY AI WORKING ON THIS PROJECT

1. **Never hardcode secrets.** If an env var is missing, fail with a clear error.
2. **Never claim something works if it doesn't.** If it's simulated, say so.
3. **Never inflate system capabilities.** It's a GradientBoosting classifier, not AGI.
4. **Never mix research projects** (Semantic GPS, photonics, quantum) with RMHealth.
5. **Never propose Ollama, LLMs, or conversational models.** Already tried, failed.
6. **Read this MEMORY_BANK.md at the start of every session.**
7. **Update this file when significant changes are made.**
8. **All code, comments, variable names, and documentation in English.**
