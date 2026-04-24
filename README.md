# RMHealth — Remote Health Monitoring & Automated Emergency Response

[![License](https://img.shields.io/badge/License-Proprietary-red.svg)]()
[![INDAUTOR](https://img.shields.io/badge/INDAUTOR-03--2025--070109072500--01-blue.svg)]()
[![Python](https://img.shields.io/badge/Python-3.9+-green.svg)]()
[![FastAPI](https://img.shields.io/badge/FastAPI-0.100+-teal.svg)]()

## Overview

RMHealth is a **patented communication process** for real-time remote vital sign monitoring and automated emergency alerting to hospitals and emergency contacts.

The system reads vital signs from commercial smartwatches (Samsung Galaxy Watch, Apple Watch) via Health Connect / HealthKit, analyzes them with a trained ML model, and triggers automated emergency protocols when critical anomalies are detected — including FHIR/HL7 hospital reporting and GPS-based routing.

> **This project patents the complete communication cycle, not the hardware.**  
> No existing product closes the full loop: detection → AI triage → hospital alert → medical confirmation → cycle closure.

## Architecture

```
┌─────────────────┐     ┌──────────────┐     ┌──────────────────┐
│  Samsung Galaxy  │     │   RMHealth   │     │  RMHealth API    │
│  Watch / Apple   │────▶│   Mobile App │────▶│  (Google Cloud)  │
│  Watch / CGM     │ HC  │  (Expo/RN)   │HTTP │  FastAPI + ML    │
└─────────────────┘     └──────────────┘     └────────┬─────────┘
                                                       │
                                              ┌────────┴─────────┐
                                              │                  │
                                        ┌─────▼─────┐    ┌──────▼──────┐
                                        │  Twilio    │    │  Hospital   │
                                        │  SMS/Push  │    │  FHIR/HL7  │
                                        │  Alerts    │    │  Gateway    │
                                        └───────────┘    └─────────────┘
```

## Tech Stack

| Layer | Technology | Status |
|-------|-----------|--------|
| Backend API | Python 3.9, FastAPI, Pydantic | ✅ Operational |
| ML Model | GradientBoosting (scikit-learn) | ✅ Trained (91.8% accuracy) |
| Database | PostgreSQL | ✅ Operational |
| Mobile App | Expo / React Native | ⚠️ Partial (needs Health Connect) |
| Wearable | Samsung Galaxy Watch via Health Connect | ⬜ Pending integration |
| CGM Glucose | FreeStyle Libre / Dexcom via Health Connect | ⬜ Planned |
| Notifications | Twilio SMS | ⬜ Pending integration |
| Hospital Gateway | FHIR R4 / HL7 v2 bundle generation | ✅ Generates documents |
| Deployment | Docker + Google Cloud Run | ✅ Configured |

## Project Structure

```
rmhealth_clean/
├── backend/
│   ├── ai_engine.py              # ML triage classifier (GradientBoosting)
│   ├── rmhealth_api.py           # FastAPI main application
│   └── services/
│       ├── medical_engine.py     # Multi-factorial risk analysis
│       ├── hospital_gateway.py   # FHIR/HL7 generation + GPS routing
│       ├── notification_service.py  # Alert dispatch (stub)
│       ├── hospital_alerts.py    # Hospital alert system
│       └── ai_processor.py      # Deep learning placeholder (non-functional)
├── models/
│   ├── triage_classifier.joblib  # Trained model (5.4 MB)
│   ├── hospital_scorer.joblib    # Hospital selection model
│   ├── triage_metrics.json       # Model performance metrics
│   └── normalization_params.json # Feature normalization
├── rmhealth_mobile/              # Expo/React Native mobile app
│   └── src/screens/
│       ├── HomeScreen.js
│       ├── ProfileScreen.js
│       ├── HistoryScreen.js
│       └── DeviceSettingsScreen.js
├── Dockerfile                    # Cloud Run deployment
├── requirements.txt              # Python dependencies
├── .env.example                  # Environment variable template
├── MEMORY_BANK.md                # Project context for AI assistants
├── RMHEALTH_ORIGEN.md            # Original foundational document (Spanish)
└── README.md                     # This file
```

## Quick Start

### Prerequisites

- Python 3.9+
- PostgreSQL
- Node.js 18+ (for mobile app)

### Backend Setup

```bash
# Clone and navigate
cd rmhealth_clean

# Create virtual environment
python -m venv .venv
.venv\Scripts\activate  # Windows

# Install dependencies
pip install -r requirements.txt

# Configure environment (REQUIRED — never use defaults)
copy .env.example .env
# Edit .env with your actual secrets

# Run locally
uvicorn backend.rmhealth_api:app --host 0.0.0.0 --port 8000
```

### Mobile App Setup

```bash
cd rmhealth_mobile
npm install
npx expo start
```

### Docker Deployment

```bash
docker build -t rmhealth-api .
docker run -p 8080:8080 --env-file .env rmhealth-api
```

## API Endpoints

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| `GET` | `/health` | Health check | No |
| `POST` | `/api/triage` | AI triage classification | Yes |
| `POST` | `/api/vital-signs` | Submit vital signs for analysis | Yes |
| `POST` | `/api/hospital/seleccionar` | Optimal hospital selection | Yes |
| `POST` | `/api/analisis-completo` | Combined triage + hospital | Yes |
| `GET` | `/api/emergencies/history` | Emergency alert history | Yes |
| `POST` | `/admin/api-keys` | Create B2B API key | Admin |
| `GET` | `/admin/api-keys` | List API keys + usage | Admin |

## ML Model

The triage classifier uses **GradientBoosting** trained on 8,000 samples with 15 engineered features:

- **Raw vitals:** heart_rate, spo2, bp_sys, bp_dia, glucose, temperature, age
- **Derived:** pulse_pressure, MAP, shock_index, hr_spo2_ratio
- **Deviations:** hr_deviation, spo2_deviation, bp_deviation, glucose_deviation

**Performance:** 91.8% accuracy across 4 classes (BAJO/MEDIO/ALTO/CRITICO)

A post-model **clinical override layer** enforces AHA/WHO guidelines to prevent dangerous misclassifications.

## Security

All secrets **must** be provided via environment variables. See `.env.example`.  
Never commit `.env` files. The `.gitignore` already excludes them.

## License

Proprietary. All rights reserved.  
© 2025-2026 Raúl Morales Zepeda  
INDAUTOR Registry: 03-2025-070109072500-01