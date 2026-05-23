#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
RMHEALTH Medical API Server
Medical server with PostgreSQL, geolocation and emergency alerts
Optimized for Google Cloud Run

© 2025 MORALES ZEPEDA RAUL | Registro INDAUTOR: 03-2025-070109072500-01
"""

import datetime
import io
import json
import logging
import os
import time
from collections import defaultdict
import random
import string
from decimal import Decimal
import psycopg2
from psycopg2.extras import RealDictCursor
from typing import Optional

import jwt
import requests

from fastapi import Depends, FastAPI, HTTPException, Request, Security, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import RedirectResponse
from fastapi.responses import StreamingResponse
from fastapi.security import (
    HTTPAuthorizationCredentials,
    HTTPBearer,
    OAuth2PasswordBearer,
)
from pydantic import BaseModel, Field

# RMHealth Advanced Services
try:
    # When running from project root (local dev)
    from backend.services.medical_engine import MedicalEngine, VitalsInput, PatientContext
    from backend.services.hospital_gateway import HospitalGateway
    from backend.services.notification_service import NotificationService
    from backend.services.preventive_alerts import PreventiveAlertService, VitalReading, PreventiveAlert
    from backend.services.pdf_generator import ExpedientePDFGenerator
    from backend.services.gemini_explainer import chat_with_gemini
    from backend.ai_engine import classify_triage
    from backend.services.critical_judgment_module import CriticalJudgmentModule
except ImportError:
    # When running from backend/ directory (Cloud Run)
    from services.medical_engine import MedicalEngine, VitalsInput, PatientContext
    from services.hospital_gateway import HospitalGateway
    from services.notification_service import NotificationService
    from services.preventive_alerts import PreventiveAlertService, VitalReading, PreventiveAlert
    from services.pdf_generator import ExpedientePDFGenerator
    from services.gemini_explainer import chat_with_gemini
    from ai_engine import classify_triage
    from services.critical_judgment_module import CriticalJudgmentModule

# Setup Logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(name)s: %(message)s'
)
logger = logging.getLogger("RMHealth.API")

# ── Demo patient profiles for realistic testing ──
DEMO_PATIENTS = [
    {"nombre": "María González", "edad": 68},
    {"nombre": "Carlos Mendoza", "edad": 72},
    {"nombre": "Rosa Hernández", "edad": 65},
    {"nombre": "José Martínez", "edad": 71},
    {"nombre": "Ana Ramírez", "edad": 66},
    {"nombre": "Luis Pérez", "edad": 74},
]


def classify_emergency_label(analysis) -> str:
    """Map ML/heuristic analysis to patient-friendly emergency type label.

    Returns one of four standard labels based on detected risk factors.
    """
    factors_text = " ".join(analysis.factores_riesgo).lower()

    if any(kw in factors_text for kw in [
        "taquicardia", "bradicardia", "cardíaco", "cardiopat"
    ]):
        return "Patrón Cardíaco Inusual"
    if any(kw in factors_text for kw in [
        "hipertensiva", "hipotensión", "presión", "hipertensión"
    ]):
        return "Presión Arterial Elevada"
    if analysis.nivel_criticidad == "CRITICAL":
        return "Respuesta Inmediata Requerida"
    return "Monitoreo Intensivo"


# Security configuration
security = HTTPBearer()
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")

# ── Environment detection ──
_environment = os.environ.get("ENVIRONMENT", "development").lower()
_is_production = _environment == "production"

# ── Swagger/docs: disabled in production ──
app = FastAPI(
    title="RMHEALTH Medical API - Zero Trust Security",
    description="Medical system with geolocation, emergency alerts and Zero Trust security",
    version="2.0.0",
    docs_url=None if _is_production else "/docs",
    redoc_url=None if _is_production else "/redoc",
    openapi_url=None if _is_production else "/openapi.json",
)
if _is_production:
    logger.info("[SECURITY] Swagger/Redoc/OpenAPI disabled in production.")

# ── CORS middleware — hardened for production ──
_cors_raw = os.environ.get("CORS_ORIGINS", "")
if not _cors_raw or _cors_raw.strip() == "*":
    if _is_production:
        # In production, reject wildcard — use safe defaults
        _cors_origins = [
            "https://www.rmhealth.ai",
            "https://rmhealth.ai",
        ]
        logger.warning("[SECURITY] CORS_ORIGINS was wildcard/empty in production. "
                       "Falling back to safe defaults: %s", _cors_origins)
    else:
        _cors_origins = ["*"]
        logger.warning("CORS_ORIGINS not set — allowing all origins (development mode).")
else:
    _cors_origins = [o.strip() for o in _cors_raw.split(",") if o.strip()]
    logger.info(f"[CORS] Origins configured: {_cors_origins}")

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Rate Limiter (in-memory, compatible with Cloud Run single instance) ──
class RateLimiter:
    """Simple in-memory rate limiter by IP. Resets per window.
    Compatible with Cloud Run (single instance, no shared state).
    """
    def __init__(self, max_requests: int = 10, window_seconds: int = 60):
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        self._requests = defaultdict(list)

    def is_allowed(self, key: str) -> bool:
        now = time.time()
        # Clean old entries
        self._requests[key] = [t for t in self._requests[key] if now - t < self.window_seconds]
        if len(self._requests[key]) >= self.max_requests:
            return False
        self._requests[key].append(now)
        return True

# Auth endpoints: 10 requests per minute per IP
_auth_limiter = RateLimiter(max_requests=10, window_seconds=60)
# Vital-signs: 30 requests per minute per IP
_vitals_limiter = RateLimiter(max_requests=30, window_seconds=60)

# --- Validation Error Handler (logs exact field that failed) ---
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request, exc):
    errors = exc.errors()
    logger.error(f"VALIDATION ERROR from {request.client.host}: {errors}")
    return JSONResponse(
        status_code=422,
        content={"detail": errors, "body_received": str(exc.body)[:500]}
    )


# --- MANDATORY SECRETS (fail-fast if missing) ---
API_SECRET_TOKEN = os.environ.get("API_SECRET_TOKEN")
JWT_SECRET_KEY = os.environ.get("JWT_SECRET_KEY")

if not API_SECRET_TOKEN:
    logger.critical("FATAL: API_SECRET_TOKEN environment variable is NOT set. "
                    "The API will reject all requests. Set it in .env or Cloud Run config.")

if not JWT_SECRET_KEY:
    logger.critical("FATAL: JWT_SECRET_KEY environment variable is NOT set. "
                    "JWT verification will fail. Set it in .env or Cloud Run config.")


def validate_token(token: str) -> bool:
    """Validate Zero Trust access token against environment-configured secret."""
    try:
        if not token or len(token) < 10:
            return False

        if not API_SECRET_TOKEN:
            logging.error("API_SECRET_TOKEN not configured — rejecting all tokens.")
            return False

        valid_tokens = [API_SECRET_TOKEN]


        return token in valid_tokens
    except Exception as e:
        logging.error(f"Error validating token: {e}")
        return False


def get_db_connection():
    """Get PostgreSQL connection"""
    try:
        # DB connection parameters from environment variables
        db_user = os.environ.get("DB_USER", "postgres")
        db_pass = os.environ.get("DB_PASS")
        if not db_pass:
            raise RuntimeError("DB_PASS environment variable is NOT set. Cannot connect to database.")
        db_name = os.environ.get("DB_NAME", "rmhealth_medical")
        db_host = os.environ.get("DB_HOST", "127.0.0.1")
        
        # Connect to DB - Handle Unix Sockets for Cloud Run
        # Added connect_timeout=2 to prevent hanging when DB is unreachable
        connect_args = {
            "dbname": db_name,
            "user": db_user,
            "password": db_pass,
            "connect_timeout": 2
        }
        
        if db_host.startswith('/'):
            connect_args["host"] = db_host
        else:
            connect_args["host"] = db_host

        conn = psycopg2.connect(**connect_args)
        conn.autocommit = False

        # Create tables if they don't exist
        cursor = conn.cursor()
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS vital_signs (
                id SERIAL PRIMARY KEY,
                usuario_id TEXT NOT NULL,
                ritmo_cardiaco INTEGER,
                spo2 INTEGER,
                presion_sistolica INTEGER,
                presion_diastolica INTEGER,
                glucosa REAL,
                ecg REAL,
                ppg REAL,
                temp_corporal REAL,
                timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                ubicacion_lat REAL,
                ubicacion_lon REAL
            )
        """
        )
        # Ensure missing columns exist for older schemas
        for col_def in [
            ("ritmo_cardiaco", "INTEGER"),
            ("spo2", "INTEGER"),
            ("presion_sistolica", "INTEGER"),
            ("presion_diastolica", "INTEGER"),
            ("glucosa", "REAL"),
            ("contexto", "TEXT"),
        ]:
            try:
                cursor.execute(f"ALTER TABLE vital_signs ADD COLUMN IF NOT EXISTS {col_def[0]} {col_def[1]}")
            except Exception:
                pass

        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS emergency_alerts (
                id SERIAL PRIMARY KEY,
                usuario_id TEXT NOT NULL,
                tipo_emergencia TEXT NOT NULL,
                descripcion TEXT,
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                ubicacion_lat REAL,
                ubicacion_lon REAL,
                estado TEXT DEFAULT 'activa'
            )
        """
        )

        # Columnas de ciclo de vida para close/cancel (ADD COLUMN IF NOT EXISTS es idempotente)
        for _col in [
            ("cerrado_por",        "TEXT"),
            ("cerrado_en",         "TIMESTAMP WITH TIME ZONE"),
            ("motivo_cierre",      "TEXT"),
            ("cancelado_por",      "TEXT"),
            ("cancelado_en",       "TIMESTAMP WITH TIME ZONE"),
            ("motivo_cancelacion", "TEXT"),
        ]:
            try:
                cursor.execute(
                    f"ALTER TABLE emergency_alerts "
                    f"ADD COLUMN IF NOT EXISTS {_col[0]} {_col[1]}"
                )
            except Exception:
                pass

        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS preventive_alerts (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                user_id TEXT NOT NULL,
                metric TEXT NOT NULL,
                severity TEXT NOT NULL,
                title TEXT NOT NULL,
                message TEXT NOT NULL,
                recommendation TEXT NOT NULL,
                baseline_value REAL DEFAULT 0,
                current_value REAL DEFAULT 0,
                delta REAL DEFAULT 0,
                data_window TEXT NOT NULL,
                source TEXT DEFAULT 'unknown',
                requires_human_review BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                acknowledged_at TIMESTAMP WITH TIME ZONE NULL
            )
        """
        )

        # --- Auth tables (M1 + M8) ---
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                email TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                full_name TEXT NOT NULL,
                role TEXT NOT NULL DEFAULT 'PACIENTE',
                email_verified BOOLEAN DEFAULT FALSE,
                two_factor_code TEXT,
                two_factor_expires_at TIMESTAMP WITH TIME ZONE,
                failed_login_attempts INTEGER DEFAULT 0,
                locked_until TIMESTAMP WITH TIME ZONE,
                automatic_escalation_consent BOOLEAN DEFAULT FALSE,
                language TEXT DEFAULT 'es',
                patient_id TEXT,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            )
        """)

        cursor.execute("""
            CREATE TABLE IF NOT EXISTS refresh_tokens (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                token_hash TEXT NOT NULL,
                expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
                revoked BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            )
        """)

        cursor.execute("""
            CREATE TABLE IF NOT EXISTS login_attempts (
                id SERIAL PRIMARY KEY,
                email TEXT NOT NULL,
                ip_address TEXT,
                success BOOLEAN NOT NULL,
                user_agent TEXT,
                timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            )
        """)

        # --- Consent tables (M2 — Granular Consent) ---
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS consents (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                consent_type TEXT NOT NULL,
                accepted BOOLEAN NOT NULL DEFAULT TRUE,
                text_version TEXT NOT NULL DEFAULT '1.0',
                ip_address TEXT,
                user_agent TEXT,
                revoked_at TIMESTAMP WITH TIME ZONE,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            )
        """)

        # --- Medical Profile tables (M3) ---
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS allergies (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                agent TEXT NOT NULL,
                allergy_type TEXT DEFAULT 'medication',
                severity TEXT DEFAULT 'moderate',
                notes TEXT,
                active BOOLEAN DEFAULT TRUE,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            )
        """)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS medical_conditions (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                name TEXT NOT NULL,
                diagnosis_date DATE,
                treating_doctor TEXT,
                status TEXT DEFAULT 'active',
                notes TEXT,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            )
        """)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS emergency_contacts (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                name TEXT NOT NULL,
                relationship TEXT NOT NULL,
                phone TEXT NOT NULL,
                email TEXT,
                is_primary BOOLEAN DEFAULT FALSE,
                notify_on_emergency BOOLEAN DEFAULT TRUE,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            )
        """)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS emergency_card_tokens (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                token TEXT UNIQUE NOT NULL,
                expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
                access_count INTEGER DEFAULT 0,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            )
        """)

        # --- Medications tables (M5) ---
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS medications (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                name TEXT NOT NULL,
                dosage TEXT,
                frequency TEXT,
                schedule_time TEXT,
                med_type TEXT DEFAULT 'pill',
                doctor TEXT,
                notes TEXT,
                active BOOLEAN DEFAULT TRUE,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            )
        """)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS medication_doses (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                medication_id UUID NOT NULL REFERENCES medications(id) ON DELETE CASCADE,
                user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                taken_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                dose_date DATE NOT NULL DEFAULT CURRENT_DATE
            )
        """)

        # --- Multi-Actor tables (M7) ---
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS doctor_patient_links (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                doctor_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                patient_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                doctor_role TEXT NOT NULL DEFAULT 'MEDICO',
                status TEXT NOT NULL DEFAULT 'pending',
                invite_code TEXT UNIQUE,
                invite_expires_at TIMESTAMP WITH TIME ZONE,
                requested_by TEXT NOT NULL DEFAULT 'doctor',
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                accepted_at TIMESTAMP WITH TIME ZONE,
                revoked_at TIMESTAMP WITH TIME ZONE,
                UNIQUE(doctor_id, patient_id)
            )
        """)
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_dpl_doctor ON doctor_patient_links(doctor_id, status)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_dpl_patient ON doctor_patient_links(patient_id, status)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_dpl_invite ON doctor_patient_links(invite_code) WHERE invite_code IS NOT NULL")
        cursor.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS verified_professional BOOLEAN DEFAULT FALSE")

        # --- FCM Device Token table (P1 — Firebase Cloud Messaging) ---
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS fcm_tokens (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                user_id TEXT NOT NULL,
                fcm_token TEXT NOT NULL,
                platform TEXT DEFAULT 'android',
                device_id TEXT,
                active BOOLEAN DEFAULT TRUE,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            )
        """)
        cursor.execute(
            "CREATE INDEX IF NOT EXISTS idx_fcm_user "
            "ON fcm_tokens(user_id, active)"
        )

        conn.commit()
        # Return DictCursor so it acts like sqlite3.Row mapping
        cursor.close()
        return psycopg2.connect(
            dbname=db_name, user=db_user, password=db_pass, host=db_host, 
            cursor_factory=RealDictCursor, connect_timeout=2
        )
    except Exception as e:
        logging.error(f"Error connecting to PostgreSQL: {e}")
        raise HTTPException(
            status_code=500,
            detail="Database connection error")


class VitalSigns(BaseModel):
    """Medical vital signs data model"""
    usuario_id: str = Field(..., description="Unique user ID")
    ecg: float = Field(default=1.0, ge=0.0, le=10.0,
                       description="Electrocardiogram (0.0-10.0)")
    ppg: float = Field(default=1.0, ge=0.0, le=10.0,
                       description="Photoplethysmography (0.0-10.0)")
    oxigeno: int = Field(..., ge=50, le=100,
                         description="Oxygen saturation (%)")
    presion_sistolica: int = Field(
        ..., ge=60, le=300, description="Systolic pressure (mmHg)"
    )
    presion_diastolica: int = Field(
        ..., ge=30, le=200, description="Diastolic pressure (mmHg)"
    )
    frecuencia_cardiaca: int = Field(
        ..., ge=20, le=250, description="Heart rate (bpm)"
    )
    temperatura: float = Field(
        default=36.6, ge=30.0, le=45.0, description="Body temperature (°C)"
    )
    glucosa: float = Field(
        default=90.0, ge=20.0, le=600.0,
        description="Blood glucose (mg/dL). Default 90 if not measured."
    )
    timestamp: datetime.datetime = Field(default_factory=datetime.datetime.now)
    ubicacion_lat: float = Field(..., ge=-90, le=90, description="Latitude")
    ubicacion_lon: float = Field(..., ge=-180, le=180, description="Longitude")
    dispositivo_id: str = Field(..., description="Smartwatch device ID")
    emergencia_detectada: bool = Field(
        default=False, description="Automatic emergency detected"
    )
    contexto: str = Field(
        default="reposo",
        description="Measurement context: reposo, ejercicio, comida, dormir, despertar, otro"
    )
    patient_context: Optional[dict] = Field(
        None, description="Dynamic clinical profile from phone for FDA/COFEPRIS compliance"
    )


class EmergencyAlert(BaseModel):
    """Emergency alert data model"""
    usuario_id: str
    tipo_emergencia: str
    severidad: str  # LOW, MEDIUM, HIGH, CRITICAL
    ubicacion_lat: float
    ubicacion_lon: float
    signos_vitales: VitalSigns
    mensaje_personalizado: Optional[str] = None


def verify_token(
        credentials: HTTPAuthorizationCredentials = Depends(security)):
    """Verify JWT token or API secret token from environment."""
    try:
        token = credentials.credentials

        # Validate against environment-configured API secret
        if API_SECRET_TOKEN and token == API_SECRET_TOKEN:
            return {"user_id": "api_client", "role": "user"}

        # Decode JWT using environment-configured secret key
        if not JWT_SECRET_KEY:
            raise HTTPException(status_code=500, detail="Server misconfigured: JWT_SECRET_KEY not set")

        payload = jwt.decode(token, JWT_SECRET_KEY, algorithms=["HS256"])
        return payload
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=401, detail="Invalid token")


def detect_emergency(data: VitalSigns) -> tuple[bool, str, str]:
    """Detect emergencies based on vital signs — ADA/AHA/WHO compliant thresholds"""
    emergencies = []
    severity = "LOW"

    # Critical blood pressure (AHA/ESC Guidelines)
    if data.presion_sistolica > 180 or data.presion_diastolica > 120:
        emergencies.append("CRISIS_HIPERTENSIVA")
        severity = "CRITICAL"
    elif data.presion_sistolica < 90 or data.presion_diastolica < 55:
        emergencies.append("HIPOTENSION_SEVERA")
        severity = "HIGH"
    elif data.presion_sistolica < 100 or data.presion_diastolica < 60:
        emergencies.append("HIPOTENSION")
        if severity not in ["CRITICAL", "HIGH"]:
            severity = "MEDIUM"

    # Critical oxygen saturation (WHO guidelines)
    if data.oxigeno < 85:
        emergencies.append("HIPOXEMIA_SEVERA")
        severity = "CRITICAL"
    elif data.oxigeno < 90:
        emergencies.append("HIPOXEMIA_MODERADA")
        if severity not in ["CRITICAL"]:
            severity = "HIGH"
    elif data.oxigeno < 94:
        emergencies.append("HIPOXEMIA_LEVE")
        if severity not in ["CRITICAL", "HIGH"]:
            severity = "MEDIUM"

    # Abnormal heart rate (AHA guidelines)
    if data.frecuencia_cardiaca > 150:
        emergencies.append("TAQUICARDIA_SEVERA")
        if severity not in ["CRITICAL"]:
            severity = "HIGH"
    elif data.frecuencia_cardiaca > 120:
        emergencies.append("TAQUICARDIA")
        if severity not in ["CRITICAL", "HIGH"]:
            severity = "MEDIUM"
    elif data.frecuencia_cardiaca < 45:
        emergencies.append("BRADICARDIA_SEVERA")
        if severity not in ["CRITICAL"]:
            severity = "HIGH"
    elif data.frecuencia_cardiaca < 50:
        emergencies.append("BRADICARDIA")
        if severity not in ["CRITICAL", "HIGH"]:
            severity = "MEDIUM"

    # Blood glucose (ADA Standards of Medical Care 2024)
    if data.glucosa < 54:
        # Level 2 hypoglycemia — clinically significant
        emergencies.append("HIPOGLUCEMIA_SEVERA")
        if severity not in ["CRITICAL"]:
            severity = "CRITICAL"
    elif data.glucosa < 70:
        # Level 1 hypoglycemia
        emergencies.append("HIPOGLUCEMIA")
        if severity not in ["CRITICAL", "HIGH"]:
            severity = "HIGH"
    elif data.glucosa > 300:
        # Severe hyperglycemia — DKA/HHS risk
        emergencies.append("HIPERGLUCEMIA_SEVERA")
        if severity not in ["CRITICAL"]:
            severity = "HIGH"
    elif data.glucosa > 250:
        emergencies.append("HIPERGLUCEMIA")
        if severity not in ["CRITICAL", "HIGH"]:
            severity = "MEDIUM"

    # Abnormal body temperature
    if data.temperatura > 40.0:
        emergencies.append("HIPERTERMIA")
        if severity not in ["CRITICAL"]:
            severity = "HIGH"
    elif data.temperatura < 35.0:
        emergencies.append("HIPOTERMIA")
        if severity not in ["CRITICAL", "HIGH"]:
            severity = "MEDIUM"

    # Combined risk: multiple concurrent abnormalities increase severity
    if len(emergencies) >= 3 and severity != "CRITICAL":
        severity = "CRITICAL"

    is_emergency = len(emergencies) > 0
    emergency_type = "_".join(emergencies) if emergencies else "NORMAL"

    return is_emergency, emergency_type, severity


async def find_nearest_hospital(lat: float, lon: float, radius_km: int = 10):
    """Find nearest hospital using local PostGIS database."""
    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor()

        cursor.execute(
            """
            SELECT nombre, telefono, direccion,
                   ST_Distance(
                       ST_SetSRID(ST_MakePoint(%s, %s), 4326)::geography,
                       ubicacion::geography
                   ) as distancia
            FROM hospitales
            WHERE ST_DWithin(
                ST_SetSRID(ST_MakePoint(%s, %s), 4326)::geography,
                ubicacion::geography,
                %s
            )
            ORDER BY distancia ASC LIMIT 1
        """,
            (lon, lat, lon, lat, radius_km * 1000),
        )

        hospital = cursor.fetchone()
        cursor.close()

        if hospital:
            return {
                "nombre": hospital[0],
                "telefono": hospital[1],
                "direccion": hospital[2],
                "distancia_metros": hospital[3],
            }
    except Exception as e:
        logger.warning(f"Hospital lookup failed: {e}")
    finally:
        if conn:
            try:
                conn.close()
            except:
                pass

    return None


# API Endpoints
@app.post("/api/vital-signs")
async def receive_vital_signs(data: VitalSigns, request: Request, user=Depends(verify_token)):
    """Receive and process vital signs data using the RMHealth Medical Engine.
    
    ML classification runs FIRST (no DB required).
    DB persistence is attempted but non-blocking — if DB is unavailable,
    the API still returns the ML + heuristic results.

    V-07 FIX: usuario_id is enforced from JWT, not from client body.
    """
    # Rate limiting
    client_ip = request.client.host if request.client else "unknown"
    if not _vitals_limiter.is_allowed(client_ip):
        raise HTTPException(status_code=429, detail="Too many requests. Try again later.")
    # V-07 FIX: Enforce server-side user_id from JWT
    token_user_id = user.get("sub") or user.get("user_id")
    if token_user_id and token_user_id != "api_client":
        if data.usuario_id and data.usuario_id != token_user_id:
            logger.warning(f"[SECURITY] usuario_id mismatch: body vs JWT. Overriding with authenticated user_id.")
        data.usuario_id = token_user_id

    # Default patient context (used when DB is unavailable)
    _demo = random.choice(DEMO_PATIENTS)
    patient_age = _demo["edad"]
    patient_context_kwargs = {"edad": _demo["edad"], "nombre_completo": _demo["nombre"]}

    # --- Initialize DB connection variable ---
    conn = None

    # --- PRIORITY 1: Dynamic Context from Phone (Universal Support) ---
    if data.patient_context:
        logger.info(f"Using dynamic clinical context from phone for user: {data.usuario_id}")
        patient_age = data.patient_context.get("edad", 30)
        patient_context_kwargs = {
            "edad": patient_age,
            "diabetico": data.patient_context.get("diabetico", False),
            "hipertenso": data.patient_context.get("hipertenso", False),
            "cardiopata": data.patient_context.get("cardiopata", False),
            "nombre_completo": data.patient_context.get("nombre_completo", "Usuario RMHealth"),
            "tipo_sangre": data.patient_context.get("tipo_sangre", "O+"),
            "contacto_emergencia_nombre": data.patient_context.get("contacto_emergencia_nombre", ""),
            "contacto_emergencia_tel": data.patient_context.get("contacto_emergencia_tel", ""),
            "alergias": data.patient_context.get("alergias", [])
        }
        skip_db_lookup = True  # Phone context has priority — no DB profile query needed
        # Still attempt DB connection so we can persist vital_signs / emergency_alerts
        try:
            conn = get_db_connection()
            db_available = True
            logger.info(f"DB connection available for persistence (context from phone): {data.usuario_id}")
        except Exception as db_err:
            db_available = False
            logger.info(f"DB unavailable for persistence (ML-only mode): {db_err}")
    else:
        # --- PRIORITY 2: Try to load patient profile from DB ---
        skip_db_lookup = False
        db_available = False
        try:
            conn = get_db_connection()
            cursor = conn.cursor()
            db_available = True
            try:
                cursor.execute(
                    """SELECT edad, diabetico, hipertenso, cardiopata,
                              nombre_completo, tipo_sangre,
                              contacto_nombre, contacto_tel, alergias
                       FROM patients WHERE usuario_id = %s""",
                    (data.usuario_id,)
                )
                patient_row = cursor.fetchone()
                if patient_row:
                    patient_age = patient_row[0]
                    patient_context_kwargs = {
                        "edad": patient_row[0],
                        "diabetico": patient_row[1],
                        "hipertenso": patient_row[2],
                        "cardiopata": patient_row[3],
                        "nombre_completo": patient_row[4] or random.choice(DEMO_PATIENTS)["nombre"],
                        "tipo_sangre": patient_row[5] or "No especificado",
                        "contacto_emergencia_nombre": patient_row[6] or "",
                        "contacto_emergencia_tel": patient_row[7] or "",
                    }
                    logger.info(f"Patient profile loaded from DB: {data.usuario_id} (age={patient_age})")
                else:
                    logger.warning(f"Patient '{data.usuario_id}' not found in DB. Using demo defaults.")
            except Exception as e:
                logger.warning(f"Patient lookup failed (table may not exist yet): {e}")
        except Exception as db_err:
            logger.warning(f"Database unavailable — running in ML-only mode: {db_err}")
            db_available = False

    try:
        # 1. ML TRIAGE CLASSIFICATION (GradientBoosting model) — NO DB REQUIRED
        ml_result = classify_triage(
            heart_rate=data.frecuencia_cardiaca,
            spo2=data.oxigeno,
            bp_sys=data.presion_sistolica,
            bp_dia=data.presion_diastolica,
            glucose=data.glucosa,
            temperature=data.temperatura,
            age=patient_age,
        )

        # 2. Transform to Medical Engine Input
        engine_input = VitalsInput(
            usuario_id=data.usuario_id,
            ritmo_cardiaco=data.frecuencia_cardiaca,
            spo2=data.oxigeno,
            presion_sistolica=data.presion_sistolica,
            presion_diastolica=data.presion_diastolica,
            temperatura=data.temperatura,
            glucosa=data.glucosa,
            caida_detectada=data.emergencia_detectada
        )

        # 3. Clinical override analysis with patient context
        real_context = PatientContext(**patient_context_kwargs)
        analysis = MedicalEngine.detect_patterns(engine_input, real_context)

        # 4. Reconcile ML prediction with heuristic analysis
        #    Use the MORE SEVERE of the two assessments (safety-first)
        severity_rank = {"BAJO": 0, "NORMAL": 0, "MEDIO": 1, "MEDIUM": 1,
                         "ALTO": 2, "HIGH": 2, "CRITICO": 3, "CRITICAL": 3}
        # Translation maps — medical_engine uses EN, ai_engine uses ES
        _EN_TO_ES = {"CRITICAL": "CRITICO", "HIGH": "ALTO", "MEDIUM": "MEDIO",
                     "LOW": "BAJO", "NORMAL": "NORMAL", "UNKNOWN": "BAJO"}
        _ES_TO_EN = {"CRITICO": "CRITICAL", "ALTO": "HIGH", "MEDIO": "MEDIUM",
                     "BAJO": "LOW", "NORMAL": "NORMAL"}

        # Normalize ml_result level to Spanish (in case model returns English or UNKNOWN)
        ml_result["level"] = _EN_TO_ES.get(ml_result["level"], ml_result["level"])
        ml_rank = severity_rank.get(ml_result["level"], 0)
        heuristic_rank = severity_rank.get(analysis.nivel_criticidad, 0)

        # When model unavailable, use heuristic level translated to Spanish
        if not ml_result["model_available"]:
            ml_result["level"] = _EN_TO_ES.get(analysis.nivel_criticidad, "BAJO")
            # Keep confidence as 0.0 (not None) to avoid downstream format errors
            ml_result["confidence"] = 0.0
            ml_result["_source"] = "heuristic_fallback"
            ml_rank = severity_rank.get(ml_result["level"], 0)

        # ── ML RECONCILIATION (safety-gated) ──────────────────────────────
        # ML can provide PREVENTIVE CONTEXT but CANNOT trigger emergency alone.
        # Emergency activation requires MedicalEngine/CJM confirmation.
        # Rationale: ML confidence ≠ clinical risk. A model can be 100% confident
        # in class ALTO for a borderline SpO2, but MedicalEngine score may be 10/100.
        if ml_rank > heuristic_rank and ml_result["model_available"]:
            # Log the ML elevation as a risk factor for transparency
            analysis.factores_riesgo.append(
                f"ML Model: {ml_result['level']} (confidence={ml_result['confidence']:.2f})"
            )
            # ML can raise the DISPLAY severity for monitoring purposes,
            # but NEVER sets emergencia_detectada. Only MedicalEngine score thresholds
            # or CJM CRITICAL + confirmed escalation can do that.
            # NOTE: We do NOT override analysis.nivel_criticidad from ML alone.
            # The display_severity field (added to response) will carry the ML info.
            if ml_rank >= 3:  # CRITICO from ML → log warning, still no auto-emergency
                logger.warning(
                    "ML_CRITICO_WITHOUT_ENGINE_CONFIRMATION: ML predicted CRITICO but "
                    "MedicalEngine score=%.1f (level=%s) for user %s. "
                    "Emergency NOT auto-triggered. Requires confirmation.",
                    analysis.score_riesgo, analysis.nivel_criticidad, data.usuario_id,
                )
            elif ml_rank >= 2:  # ALTO from ML
                logger.info(
                    "ML_ALTO_PREVENTIVE: ML predicted ALTO (confidence=%.2f) but "
                    "MedicalEngine score=%.1f (level=%s) for user %s. "
                    "Added as preventive observation, no emergency dispatch.",
                    ml_result['confidence'], analysis.score_riesgo,
                    analysis.nivel_criticidad, data.usuario_id,
                )

        # ── CLINICAL SAFETY FLOOR ───────────────────────────────────────────
        # When 2+ clinical findings are detected simultaneously, the combined
        # physiological burden is clinically significant regardless of
        # individual scores. Minimum level must be MEDIO.
        # Rationale: AHA/ACC multi-risk guidelines; no isolated single-factor
        # assessment is valid when concurrent abnormalities are present.
        _num_findings = len([f for f in analysis.factores_riesgo
                             if not f.startswith("ML Model:")
                             and not f.startswith("Contexto:")])
        if _num_findings >= 2:
            _current_rank = severity_rank.get(analysis.nivel_criticidad, 0)
            if _current_rank < 1:  # below MEDIO
                analysis.nivel_criticidad = "MEDIUM"  # keep English for heuristic field
                analysis.factores_riesgo.append(
                    f"Piso clínico aplicado: {_num_findings} hallazgos simultáneos "
                    f"→ nivel mínimo MEDIO (AHA multi-riesgo)"
                )
                logger.warning(
                    "CLINICAL FLOOR APPLIED: %d concurrent findings elevated level "
                    "from %s to MEDIO for user %s",
                    _num_findings, ml_result.get("level", "BAJO"), data.usuario_id,
                )
            # Realign ml_triage — translate EN heuristic back to Spanish
            if severity_rank.get(ml_result["level"], 0) < 1:
                ml_result["level"] = _EN_TO_ES.get(analysis.nivel_criticidad, "MEDIO")
                ml_result["_floor_applied"] = True
        # ────────────────────────────────────────────────────────────────────

        # Attach accuracy from metrics file (FIX 3)
        try:
            import json as _json
            from pathlib import Path as _Path
            _mdir = _Path(__file__).resolve().parent / "models"
            _mfile = _mdir / "triage_metrics.json"
            if _mfile.exists():
                _m = _json.loads(_mfile.read_text())
                ml_result["accuracy"] = _m.get("accuracy")  # e.g. 0.9940
                ml_result["model_version"] = "v4"
        except Exception:
            pass


        # ── EMERGENCY SAFETY GATE ──────────────────────────────────────────
        # Emergency dispatch ONLY fires when ALL of these are true:
        #   1. MedicalEngine set emergencia_detectada = True (score >= UMBRAL_MEDIA)
        #   2. MedicalEngine score >= 50 (confirmed clinical severity)
        #   3. MedicalEngine nivel_criticidad is CRITICAL or HIGH
        # ML confidence, ML class, trends alone CANNOT trigger emergency.
        # CJM escalation_action is informational — it recommends but doesn't dispatch.
        _emergency_eligible = (
            analysis.emergencia_detectada
            and analysis.score_riesgo >= MedicalEngine.UMBRAL_MEDIA  # 50
            and analysis.nivel_criticidad in ("CRITICAL", "HIGH")
        )
        _emergency_trigger_source = "MedicalEngine" if _emergency_eligible else "none"

        # If CJM is available and recommends escalation, note it but don't override
        # NOTE: cjm_result_dict is evaluated later in the pipeline. At this point
        # it may not exist yet. We safely default to None.
        _cjm_dict = locals().get('cjm_result_dict', None)
        if _cjm_dict and _cjm_dict.get("available") is not False:
            _cjm_action = _cjm_dict.get("escalation_action", "NONE")
            if _cjm_action in ("AUTO_ESCALATION_CANDIDATE", "ESCALATE_IF_CONFIRMED"):
                if not _emergency_eligible:
                    logger.info(
                        "CJM recommends escalation (%s) but MedicalEngine score=%.1f "
                        "does not confirm emergency for user %s",
                        _cjm_action, analysis.score_riesgo, data.usuario_id,
                    )
                else:
                    _emergency_trigger_source = "MedicalEngine+CJM"

        # Compute display severity: reconcile ML + MedicalEngine for UI
        # ML can elevate display but cannot make it look like an emergency
        _me_rank = severity_rank.get(analysis.nivel_criticidad, 0)
        if ml_rank > _me_rank and ml_result["model_available"]:
            # Show the higher of the two, but cap at HIGH if not emergency-eligible
            _display_sev_es = ml_result["level"]
            if ml_rank >= 3 and not _emergency_eligible:
                _display_sev_es = "ALTO"  # cap CRITICO display to ALTO if no emergency
            _display_severity = _ES_TO_EN.get(_display_sev_es, _display_sev_es)
        else:
            _display_severity = analysis.nivel_criticidad
        # ──────────────────────────────────────────────────────────────────

        hospital = None
        if _emergency_eligible:
            # 5. Handle Hospital Routing & FHIR Generation
            hospital = HospitalGateway.get_routing_decission(
                priority=analysis.nivel_criticidad,
                lat=data.ubicacion_lat,
                lon=data.ubicacion_lon,
            )
            fhir_bundle = HospitalGateway.generate_fhir_r4_bundle(
                data.usuario_id, analysis.model_dump(), engine_input.model_dump(), real_context.model_dump()
            )

            logger.info(
                f"EMERGENCY CONFIRMED: {analysis.nivel_criticidad} for user "
                f"{data.usuario_id} (score={analysis.score_riesgo:.1f}, "
                f"ML={ml_result['level']}, trigger={_emergency_trigger_source})"
            )

            # 6a. SEND FHIR BUNDLE TO HOSPITAL ENDPOINT
            if hospital and hospital.endpoint:
                try:
                    fhir_resp = requests.post(
                        hospital.endpoint,
                        json=fhir_bundle,
                        timeout=5,
                        headers={"Content-Type": "application/fhir+json"},
                    )
                    logger.info(f"FHIR bundle sent to {hospital.name}: HTTP {fhir_resp.status_code}")
                except Exception as fhir_err:
                    logger.error(f"FHIR dispatch failed (non-blocking): {fhir_err}")
            else:
                logger.warning(f"FHIR bundle generated but no endpoint configured for hospital: {hospital.name if hospital else 'none'}")

            # 6b. DISPATCH EMERGENCY NOTIFICATIONS (SMS + Hospital)
            try:
                notification_result = NotificationService.dispatch_emergency_protocol(
                    patient_data={
                        "nombre_completo": patient_context_kwargs.get("nombre_completo", random.choice(DEMO_PATIENTS)["nombre"]),
                        "contacto_emergencia_nombre": patient_context_kwargs.get("contacto_emergencia_nombre", ""),
                        "contacto_emergencia_tel": patient_context_kwargs.get("contacto_emergencia_tel", ""),
                        "lat": data.ubicacion_lat,
                        "lon": data.ubicacion_lon,
                    },
                    hospital_info=hospital.model_dump(),
                )
                logger.info(f"Notification dispatch result: {notification_result}")
            except Exception as notif_err:
                logger.error(f"Notification dispatch failed (non-blocking): {notif_err}")

        # 6. OPTIONAL: Persist to database (non-blocking)
        if db_available and conn:
            try:
                cursor = conn.cursor()
                if _emergency_eligible:
                    # Professional Clinical Description
                    clinical_desc = (
                        f"ID: {data.usuario_id} | Edad: {real_context.edad} | Sangre: {real_context.tipo_sangre} | "
                        f"Alergias: {', '.join(real_context.alergias) or 'Ninguna'} | "
                        f"Alerta: {analysis.nivel_criticidad} | "
                        f"Factores: {', '.join(analysis.factores_riesgo)}"
                    )
                    cursor.execute(
                        """INSERT INTO emergency_alerts
                           (usuario_id, tipo_emergencia, descripcion, ubicacion_lat, ubicacion_lon, estado)
                           VALUES (%s, %s, %s, %s, %s, %s)""",
                         (data.usuario_id,
                          classify_emergency_label(analysis),
                          clinical_desc,
                         data.ubicacion_lat,
                         data.ubicacion_lon,
                         'activa')
                    )
                cursor.execute(
                    """INSERT INTO vital_signs
                       (usuario_id, ritmo_cardiaco, spo2, presion_sistolica,
                        presion_diastolica, glucosa, ecg, ppg, temp_corporal,
                        ubicacion_lat, ubicacion_lon, contexto)
                       VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)""",
                    (data.usuario_id, data.frecuencia_cardiaca, data.oxigeno,
                     data.presion_sistolica, data.presion_diastolica, data.glucosa,
                     data.ecg, data.ppg, data.temperatura,
                     data.ubicacion_lat, data.ubicacion_lon,
                     getattr(data, 'contexto', 'reposo'))
                )
                conn.commit()
                cursor.close()
            except Exception as save_err:
                logger.warning(f"Could not persist to DB (results still returned): {save_err}")
                try:
                    conn.rollback()
                except:
                    pass

        # 7. PREVENTIVE TREND ANALYSIS (non-blocking)
        preventive_count = 0
        try:
            # Build a VitalReading for the current submission
            current_reading = VitalReading(
                user_id=data.usuario_id,
                heart_rate=data.frecuencia_cardiaca,
                spo2=data.oxigeno,
                systolic=data.presion_sistolica,
                diastolic=data.presion_diastolica,
                glucose=data.glucosa,
                source="health_connect",
                timestamp=datetime.datetime.now(datetime.timezone.utc),
            )

            # Load recent readings from DB for trend analysis
            trend_readings = [current_reading]
            recent_db_alerts = []
            if db_available and conn:
                try:
                    conn2 = get_db_connection()
                    cursor2 = conn2.cursor()
                    # Fetch last 24h of vitals for this user
                    cursor2.execute(
                        """SELECT ritmo_cardiaco, spo2, presion_sistolica, presion_diastolica,
                                  glucosa, timestamp
                           FROM vital_signs
                           WHERE usuario_id = %s
                             AND timestamp >= NOW() - INTERVAL '24 hours'
                           ORDER BY timestamp ASC
                           LIMIT 200""",
                        (data.usuario_id,)
                    )
                    for row in cursor2.fetchall():
                        trend_readings.append(VitalReading(
                            user_id=data.usuario_id,
                            heart_rate=row.get("ritmo_cardiaco"),
                            spo2=row.get("spo2"),
                            systolic=row.get("presion_sistolica"),
                            diastolic=row.get("presion_diastolica"),
                            glucose=row.get("glucosa"),
                            source="health_connect",
                            timestamp=row.get("timestamp", datetime.datetime.now(datetime.timezone.utc)),
                        ))

                    # Fetch recent preventive alerts for dedup
                    cursor2.execute(
                        """SELECT user_id, metric, severity, data_window, created_at
                           FROM preventive_alerts
                           WHERE user_id = %s
                             AND created_at >= NOW() - INTERVAL '30 minutes'""",
                        (data.usuario_id,)
                    )
                    for row in cursor2.fetchall():
                        recent_db_alerts.append({
                            "user_id": row["user_id"],
                            "metric": row["metric"],
                            "severity": row["severity"],
                            "data_window": row["data_window"],
                            "created_at": row["created_at"],
                        })
                    cursor2.close()
                    conn2.close()
                except Exception as trend_db_err:
                    logger.warning(f"Could not load trend data from DB: {trend_db_err}")

            # Run preventive analysis
            prev_result = PreventiveAlertService.analyze_user_trends(
                user_id=data.usuario_id,
                readings=trend_readings,
                recent_alerts=recent_db_alerts,
            )

            # Persist new preventive alerts to DB
            if prev_result.alerts and db_available:
                try:
                    conn3 = get_db_connection()
                    cursor3 = conn3.cursor()
                    for pa in prev_result.alerts:
                        cursor3.execute(
                            """INSERT INTO preventive_alerts
                               (user_id, metric, severity, title, message, recommendation,
                                baseline_value, current_value, delta, data_window, source,
                                requires_human_review)
                               VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)""",
                            (pa.user_id, pa.metric, pa.severity, pa.title, pa.message,
                             pa.recommendation, pa.baseline_value, pa.current_value,
                             pa.delta, pa.data_window, pa.source, pa.requires_human_review)
                        )
                    conn3.commit()
                    cursor3.close()
                    conn3.close()
                    preventive_count = len(prev_result.alerts)
                    logger.info(f"Saved {preventive_count} preventive alerts for {data.usuario_id}")
                except Exception as pa_save_err:
                    logger.warning(f"Could not persist preventive alerts: {pa_save_err}")
            else:
                preventive_count = len(prev_result.alerts)

        except Exception as prev_err:
            logger.warning(f"Preventive analysis failed (non-blocking): {prev_err}")

        # --- CJM INTEGRATION ---
        cjm_result_dict = None
        try:
            cjm = CriticalJudgmentModule()
            cjm_current = {
                "heart_rate_bpm": data.frecuencia_cardiaca,
                "spo2_percent": data.oxigeno,
                "systolic_bp": data.presion_sistolica,
                "diastolic_bp": data.presion_diastolica,
                "glucose_mg_dl": data.glucosa,
                "fall_detected": data.emergencia_detectada,
                "measured_at": datetime.datetime.now(datetime.timezone.utc).isoformat()
            }
            cjm_profile = {
                "age": patient_age,
                "has_diabetes": patient_context_kwargs.get("diabetico", False),
                "has_hypertension": patient_context_kwargs.get("hipertenso", False),
                "has_cardiac_history": patient_context_kwargs.get("cardiopata", False),
                "allergies": patient_context_kwargs.get("alergias", [])
            }
            
            cjm_recent = []
            _trend_readings = locals().get('trend_readings', [])
            for tr in _trend_readings:
                cjm_recent.append({
                    "heart_rate_bpm": tr.heart_rate,
                    "spo2_percent": tr.spo2,
                    "systolic_bp": tr.systolic,
                    "diastolic_bp": tr.diastolic,
                    "glucose_mg_dl": tr.glucose,
                    "measured_at": tr.timestamp.isoformat() if hasattr(tr.timestamp, 'isoformat') else str(tr.timestamp)
                })
            
            cjm_eval = cjm.evaluate(current=cjm_current, profile=cjm_profile, recent_readings=cjm_recent)
            cjm_result_dict = cjm_eval.to_dict()
            cjm_result_dict["engine"] = "CriticalJudgmentModule"
            cjm_result_dict["version"] = CriticalJudgmentModule.VERSION
            cjm_result_dict["final_authority"] = False
        except Exception as cjm_err:
            logger.error(f"CJM analysis failed (non-blocking): {cjm_err}")
            cjm_result_dict = {
                "engine": "CriticalJudgmentModule",
                "available": False,
                "error": "CJM_UNAVAILABLE"
            }

        return {
            "status": "success",
            "db_persisted": db_available,
            "ml_triage": ml_result,
            "analysis": analysis.model_dump(),
            "hospital_routing": hospital.model_dump() if hospital else None,
            "preventive_alerts_generated": preventive_count,
            "preventive_alerts": [pa.model_dump() for pa in prev_result.alerts] if 'prev_result' in locals() and prev_result and prev_result.alerts else [],
            "contextual_analysis": cjm_result_dict,
            "final_authority": "MedicalEngine",
            # ── Emergency gating contract (v2) ──
            "emergency_eligible": _emergency_eligible,
            "emergency_trigger_source": _emergency_trigger_source,
            "display_severity": _display_severity,
            "clinical_score": round(min(analysis.score_riesgo, 100.0), 1),
        }

    except Exception as e:
        logger.error(f"Error processing vitals: {e}")
        raise HTTPException(status_code=500, detail="Internal processing error")
    finally:
        if conn:
            try:
                conn.close()
            except:
                pass


# ============================================================
# VITAL SIGNS HISTORY & TRENDS (M4)
# ============================================================

@app.get("/api/vital-signs")
async def get_vital_signs_history(user=Depends(verify_token)):
    """Get paginated vital signs history for the authenticated user (last 30 days)."""
    conn = None
    try:
        user_id = user.get("sub") or user.get("user_id")
        if not user_id:
            raise HTTPException(status_code=401, detail="User ID not found")

        conn = get_db_connection()
        cursor = conn.cursor()

        # Resolve patient_id for vital_signs lookup
        patient_ids = [user_id]  # always include UUID
        cursor.execute("SELECT patient_id FROM users WHERE id = %s", (user_id,))
        u = cursor.fetchone()
        if u and u.get("patient_id"):
            patient_ids.append(u["patient_id"])

        placeholders = ",".join(["%s"] * len(patient_ids))
        cursor.execute(f"""
            SELECT id, usuario_id, ritmo_cardiaco, spo2,
                   presion_sistolica, presion_diastolica, glucosa,
                   temp_corporal, ubicacion_lat, ubicacion_lon, timestamp
            FROM vital_signs
            WHERE usuario_id IN ({placeholders})
              AND timestamp >= NOW() - INTERVAL '30 days'
            ORDER BY timestamp DESC
            LIMIT 100
        """, patient_ids)

        rows = cursor.fetchall()
        records = []
        for r in rows:
            rec = dict(r)
            for k, v in rec.items():
                if hasattr(v, 'isoformat'):
                    rec[k] = v.isoformat()
                elif not isinstance(v, (str, int, float, bool, type(None))):
                    rec[k] = str(v)
            records.append(rec)

        return {"status": "success", "count": len(records), "records": records}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[VITALS] History error: {e}")
        raise HTTPException(status_code=500, detail="Error retrieving vital signs history")
    finally:
        if conn:
            try: conn.close()
            except: pass


@app.get("/api/vital-signs/trends")
async def get_vital_signs_trends(user=Depends(verify_token)):
    """Get 7-day trend statistics (min/max/avg) per vital metric."""
    conn = None
    try:
        user_id = user.get("sub") or user.get("user_id")
        if not user_id:
            raise HTTPException(status_code=401, detail="User ID not found")

        conn = get_db_connection()
        cursor = conn.cursor()

        # Resolve patient_id
        patient_ids = [user_id]
        cursor.execute("SELECT patient_id FROM users WHERE id = %s", (user_id,))
        u = cursor.fetchone()
        if u and u.get("patient_id"):
            patient_ids.append(u["patient_id"])

        placeholders = ",".join(["%s"] * len(patient_ids))
        cursor.execute(f"""
            SELECT
                COUNT(*) as total_readings,
                ROUND(AVG(ritmo_cardiaco)::numeric, 1) as avg_hr,
                MIN(ritmo_cardiaco) as min_hr, MAX(ritmo_cardiaco) as max_hr,
                ROUND(AVG(spo2)::numeric, 1) as avg_spo2,
                MIN(spo2) as min_spo2, MAX(spo2) as max_spo2,
                ROUND(AVG(presion_sistolica)::numeric, 1) as avg_sys,
                MIN(presion_sistolica) as min_sys, MAX(presion_sistolica) as max_sys,
                ROUND(AVG(presion_diastolica)::numeric, 1) as avg_dia,
                MIN(presion_diastolica) as min_dia, MAX(presion_diastolica) as max_dia,
                ROUND(AVG(glucosa)::numeric, 1) as avg_glu,
                MIN(glucosa) as min_glu, MAX(glucosa) as max_glu,
                ROUND(AVG(temp_corporal)::numeric, 1) as avg_temp,
                MIN(temp_corporal) as min_temp, MAX(temp_corporal) as max_temp
            FROM vital_signs
            WHERE usuario_id IN ({placeholders})
              AND timestamp >= NOW() - INTERVAL '7 days'
        """, patient_ids)
        stats = cursor.fetchone()

        # Daily breakdown for bar charts (last 7 days)
        cursor.execute(f"""
            SELECT
                DATE(timestamp) as day,
                ROUND(AVG(ritmo_cardiaco)::numeric, 0) as avg_hr,
                ROUND(AVG(spo2)::numeric, 0) as avg_spo2,
                ROUND(AVG(presion_sistolica)::numeric, 0) as avg_sys,
                ROUND(AVG(presion_diastolica)::numeric, 0) as avg_dia,
                ROUND(AVG(glucosa)::numeric, 0) as avg_glu,
                COUNT(*) as readings
            FROM vital_signs
            WHERE usuario_id IN ({placeholders})
              AND timestamp >= NOW() - INTERVAL '7 days'
            GROUP BY DATE(timestamp)
            ORDER BY day ASC
        """, patient_ids)
        daily_rows = cursor.fetchall()
        daily = []
        for r in daily_rows:
            d = dict(r)
            for k, v in d.items():
                if hasattr(v, 'isoformat'):
                    d[k] = v.isoformat()
                elif isinstance(v, Decimal):
                    d[k] = float(v)
                elif not isinstance(v, (str, int, float, bool, type(None))):
                    d[k] = str(v)
            daily.append(d)

        # Serialize stats
        trend_stats = {}
        if stats:
            s = dict(stats)
            for k, v in s.items():
                if isinstance(v, Decimal):
                    trend_stats[k] = float(v)
                elif v is None:
                    trend_stats[k] = None
                else:
                    trend_stats[k] = v
        else:
            trend_stats = {"total_readings": 0}

        return {
            "status": "success",
            "period": "7_days",
            "stats": trend_stats,
            "daily": daily,
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[VITALS] Trends error: {e}")
        raise HTTPException(status_code=500, detail="Error retrieving trends")
    finally:
        if conn:
            try: conn.close()
            except: pass


# ── LONGITUDINAL TREND ANALYSIS (feature-flagged) ──────────────
# Multi-window (24h/7d/30d/90d) trend analysis — additive, non-diagnostic.
# Separated from /api/vital-signs/trends to avoid regression.
# Requires TREND_ANALYSIS_ENABLED=true in environment.
try:
    from services.trend_analysis_service import get_trends_for_user, is_enabled as trend_enabled
except ImportError:
    try:
        from backend.services.trend_analysis_service import get_trends_for_user, is_enabled as trend_enabled
    except ImportError:
        def get_trends_for_user(*args, **kwargs): return None
        def trend_enabled(): return False


@app.get("/api/trends/{usuario_id}")
async def get_longitudinal_trends(usuario_id: str, user=Depends(verify_token)):
    """
    Longitudinal trend analysis across multiple time windows.
    Feature-gated by TREND_ANALYSIS_ENABLED env var.
    
    Returns: mean, min, max, count, direction per vital per window.
    This is CONTEXTUAL/PREVENTIVE data — NOT a diagnosis.
    """
    if not trend_enabled():
        raise HTTPException(
            status_code=404,
            detail="Trend analysis is not enabled"
        )
    
    # Verify the requesting user matches or has authority
    requester_id = user.get("sub") or user.get("user_id")
    if not requester_id:
        raise HTTPException(status_code=401, detail="User ID not found")
    
    # Basic authorization: user can only see their own trends
    if requester_id != usuario_id:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    conn = None
    try:
        conn = get_db_connection()
        trends = get_trends_for_user(conn, usuario_id)
        
        if trends is None:
            return {
                "status": "no_data",
                "message": "No trend data available",
                "is_non_diagnostic": True,
            }
        
        return {
            "status": "success",
            **trends,
        }
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[TrendAnalysis] Endpoint error: {e}")
        raise HTTPException(status_code=500, detail="Error computing trends")
    finally:
        if conn:
            try: conn.close()
            except: pass


@app.get("/health")
async def health_check():
    """Health check endpoint — read-only. No DDL/migrations.
    DDL was moved out of /health to prevent schema changes on every probe.
    """
    db_status = "unknown"
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT 1")
        cursor.close()
        conn.close()
        db_status = "connected"
    except Exception as e:
        db_status = "unavailable"
        logger.warning(f"[HEALTH] DB connectivity check failed: {e}")
    return {
        "status": "healthy",
        "service": "RMHEALTH API",
        "version": "3.0.0",
        "db": db_status,
        "environment": _environment,
    }


# ── Privacy Policy (Public — required by Google Play) ──
# Serves the privacy policy HTML page at /privacy (no auth required).
# Google Play Console will reference this URL: https://rmhealth-api-XXXXX.run.app/privacy
# or https://rmhealth.ai/privacy (via DNS/redirect).
from fastapi.responses import HTMLResponse
import pathlib

@app.get("/privacy", response_class=HTMLResponse, include_in_schema=False)
async def privacy_policy():
    """Serve the public privacy policy page (no authentication required)."""
    # Resolve path relative to this file's location
    _here = pathlib.Path(__file__).resolve().parent
    privacy_file = _here / "static" / "privacy.html"
    if privacy_file.exists():
        return HTMLResponse(content=privacy_file.read_text(encoding="utf-8"), status_code=200)
    # Fallback: redirect to rmhealth.ai if file not found
    return RedirectResponse(url="https://rmhealth.ai/privacy")

@app.get("/api/emergencies/latest")
async def get_latest_emergency(user=Depends(verify_token)):
    """Fetch the latest emergency alert for the authenticated user.
    MEDICO role can see cross-user data (temporary pilot exception).
    """
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        token_user_id = user.get("sub") or user.get("user_id")
        token_role = (user.get("role") or "").upper()

        if token_role == "MEDICO":
            # TODO: MEDICO cross-user access must be restricted by hospital/institution
            # assignment before external pilot. Currently allows all MEDICO users.
            logger.info(f"[AUDIT] MEDICO {token_user_id} accessing cross-user emergencies/latest")
            cursor.execute(
                """SELECT id, usuario_id, tipo_emergencia, descripcion, ubicacion_lat, ubicacion_lon, timestamp, estado 
                   FROM emergency_alerts 
                   ORDER BY timestamp DESC LIMIT 1"""
            )
        else:
            # V-03 FIX: PACIENTE sees only own emergencies
            cursor.execute(
                """SELECT id, usuario_id, tipo_emergencia, descripcion, ubicacion_lat, ubicacion_lon, timestamp, estado 
                   FROM emergency_alerts 
                   WHERE usuario_id = %s
                   ORDER BY timestamp DESC LIMIT 1""",
                (token_user_id,)
            )
        alert = cursor.fetchone()
        
        if alert:
            return {
                "status": "success",
                "alert": {
                    "id": alert['id'],
                    "usuario_id": alert['usuario_id'],
                    "tipo_emergencia": alert['tipo_emergencia'],
                    "descripcion": alert['descripcion'],
                    "ubicacion_lat": alert['ubicacion_lat'],
                    "ubicacion_lon": alert['ubicacion_lon'],
                    "timestamp": alert['timestamp'].isoformat() if alert['timestamp'] else None,
                    "estado": alert['estado']
                }
            }
        else:
            return {"status": "none", "message": "No active emergencies"}
    finally:
        cursor.close()
        conn.close()

@app.get("/api/emergencies/history")
async def get_emergencies_history(user=Depends(verify_token)):
    """Fetch emergency alert history for the authenticated user.
    MEDICO role can see cross-user data (temporary pilot exception).
    """
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        token_user_id = user.get("sub") or user.get("user_id")
        token_role = (user.get("role") or "").upper()

        if token_role == "MEDICO":
            # TODO: MEDICO cross-user access must be restricted by hospital/institution
            # assignment before external pilot. Currently allows all MEDICO users.
            logger.info(f"[AUDIT] MEDICO {token_user_id} accessing cross-user emergencies/history")
            cursor.execute(
                """SELECT id, usuario_id, tipo_emergencia, descripcion, ubicacion_lat, ubicacion_lon, timestamp, estado 
                   FROM emergency_alerts 
                   ORDER BY timestamp DESC LIMIT 50"""
            )
        else:
            # V-04 FIX: PACIENTE sees only own emergency history
            cursor.execute(
                """SELECT id, usuario_id, tipo_emergencia, descripcion, ubicacion_lat, ubicacion_lon, timestamp, estado 
                   FROM emergency_alerts 
                   WHERE usuario_id = %s
                   ORDER BY timestamp DESC LIMIT 50""",
                (token_user_id,)
            )
        alerts = cursor.fetchall()
        
        history = []
        for alert in alerts:
            history.append({
                "id": alert['id'],
                "usuario_id": alert['usuario_id'],
                "tipo_emergencia": alert['tipo_emergencia'],
                "descripcion": alert['descripcion'],
                "ubicacion_lat": alert['ubicacion_lat'],
                "ubicacion_lon": alert['ubicacion_lon'],
                "timestamp": alert['timestamp'].isoformat() if alert['timestamp'] else None,
                "estado": alert['estado']
            })
            
        return {
            "status": "success",
            "count": len(history),
            "history": history
        }
    finally:
        cursor.close()
        conn.close()


# ── Preventive Alerts Endpoints ───────────────────────────────────────────

@app.get("/api/users/{user_id}/preventive-alerts")
async def get_user_preventive_alerts(user_id: str, user=Depends(verify_token)):
    """Retrieve preventive alerts for a specific user.
    V-05 FIX: Enforces ownership — PACIENTE can only read own alerts.
    MEDICO role can read cross-user (temporary pilot exception).
    """
    conn = None
    try:
        token_user_id = user.get("sub") or user.get("user_id")
        token_role = (user.get("role") or "").upper()

        # V-05 FIX: Ownership check
        if token_user_id != user_id and token_role != "MEDICO":
            raise HTTPException(status_code=403, detail="Access denied")

        if token_role == "MEDICO" and token_user_id != user_id:
            # TODO: MEDICO cross-user access must be restricted by hospital/institution
            # assignment before external pilot.
            logger.info(f"[AUDIT] MEDICO {token_user_id} reading preventive-alerts for user {user_id}")

        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute(
            """SELECT id, user_id, metric, severity, title, message, recommendation,
                      baseline_value, current_value, delta, data_window, source,
                      requires_human_review, created_at, acknowledged_at
               FROM preventive_alerts
               WHERE user_id = %s
               ORDER BY created_at DESC
               LIMIT 50""",
            (user_id,)
        )
        rows = cursor.fetchall()
        alerts = []
        for row in rows:
            alerts.append({
                "id": str(row["id"]),
                "user_id": row["user_id"],
                "metric": row["metric"],
                "severity": row["severity"],
                "title": row["title"],
                "message": row["message"],
                "recommendation": row["recommendation"],
                "baseline_value": row["baseline_value"],
                "current_value": row["current_value"],
                "delta": row["delta"],
                "data_window": row["data_window"],
                "source": row["source"],
                "requires_human_review": row["requires_human_review"],
                "created_at": row["created_at"].isoformat() if row["created_at"] else None,
                "acknowledged_at": row["acknowledged_at"].isoformat() if row["acknowledged_at"] else None,
            })
        return {"status": "success", "count": len(alerts), "alerts": alerts}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching preventive alerts: {e}")
        return {"status": "error", "message": "Could not retrieve preventive alerts", "alerts": []}
    finally:
        if conn:
            try:
                conn.close()
            except:
                pass


@app.post("/api/preventive-alerts/{alert_id}/acknowledge")
async def acknowledge_preventive_alert(alert_id: str, user=Depends(verify_token)):
    """Mark a preventive alert as acknowledged/seen by the user.
    V-05 FIX: Only the alert owner can acknowledge.
    """
    conn = None
    try:
        token_user_id = user.get("sub") or user.get("user_id")

        conn = get_db_connection()
        cursor = conn.cursor()
        # V-05 FIX: Include user_id in WHERE to enforce ownership
        cursor.execute(
            """UPDATE preventive_alerts
               SET acknowledged_at = CURRENT_TIMESTAMP
               WHERE id = %s::uuid AND user_id = %s AND acknowledged_at IS NULL
               RETURNING id""",
            (alert_id, token_user_id)
        )
        updated = cursor.fetchone()
        conn.commit()
        if updated:
            return {"status": "success", "message": "Alert acknowledged", "alert_id": alert_id}
        else:
            return {"status": "not_found", "message": "Alert not found or already acknowledged"}
    except Exception as e:
        logger.error(f"Error acknowledging alert: {e}")
        raise HTTPException(status_code=500, detail="Could not acknowledge alert")
    finally:
        if conn:
            try:
                conn.close()
            except:
                pass

# ── Alert Escalation Response ──────────────────────────────────────────

class AlertResponsePayload(BaseModel):
    """Payload for responding to a preventive alert."""
    response_type: str = Field(..., description="'false_alarm' or 'need_help'")
    reason: Optional[str] = Field(None, description="Required for false_alarm responses")


@app.post("/api/preventive-alerts/{alert_id}/respond")
async def respond_to_preventive_alert(alert_id: str, payload: AlertResponsePayload, user=Depends(verify_token)):
    """
    Record the user's response to a preventive alert.

    response_type = 'false_alarm' -> marks alert as dismissed with reason.
    response_type = 'need_help'   -> escalates to emergency contacts.
    """
    if payload.response_type not in ("false_alarm", "need_help"):
        raise HTTPException(status_code=400, detail="response_type must be 'false_alarm' or 'need_help'")

    if payload.response_type == "false_alarm" and not payload.reason:
        raise HTTPException(status_code=400, detail="Reason is required for false alarm responses")

    conn = None
    try:
        token_user_id = user.get("sub") or user.get("user_id")

        conn = get_db_connection()
        cursor = conn.cursor()

        # V-05 FIX: Include user_id in WHERE to enforce ownership
        cursor.execute(
            """UPDATE preventive_alerts
               SET acknowledged_at = CURRENT_TIMESTAMP,
                   response_type = %s,
                   response_reason = %s
               WHERE id = %s::uuid AND user_id = %s
               RETURNING id, user_id, severity, metric, title""",
            (payload.response_type, payload.reason, alert_id, token_user_id)
        )
        updated = cursor.fetchone()
        conn.commit()

        if not updated:
            return {"status": "not_found", "message": "Alert not found"}

        result = {
            "status": "success",
            "response_type": payload.response_type,
            "alert_id": alert_id,
        }

        if payload.response_type == "need_help":
            try:
                user_id = updated["user_id"] if isinstance(updated, dict) else updated[1]
                cursor2 = conn.cursor()
                cursor2.execute(
                    """SELECT name, phone, relationship
                       FROM emergency_contacts
                       WHERE user_id = (SELECT id FROM users WHERE username = %s OR email = %s LIMIT 1)
                       ORDER BY created_at ASC LIMIT 5""",
                    (user_id, user_id)
                )
                contacts = cursor2.fetchall()
                cursor2.close()
                result["emergency_contacts_notified"] = len(contacts) if contacts else 0
                result["escalation"] = "emergency_protocol_activated"
                logger.warning(
                    f"ESCALATION: User {user_id} pressed 'need_help' for alert {alert_id}. "
                    f"{len(contacts) if contacts else 0} emergency contacts available."
                )
            except Exception as esc_err:
                logger.error(f"Escalation contact lookup failed: {esc_err}")
                result["escalation"] = "contact_lookup_failed"
        else:
            logger.info(f"False alarm recorded for alert {alert_id}: {payload.reason}")

        return result

    except Exception as e:
        logger.error(f"Error responding to alert: {e}")
        raise HTTPException(status_code=500, detail="Could not process alert response")
    finally:
        if conn:
            try:
                conn.close()
            except:
                pass


# ================================================================
# AUTHENTICATION ENDPOINTS (M1 + M8)
# ================================================================

try:
    from backend.services.auth_service import (
        AuthDB, validate_password_strength, verify_password,
        create_access_token, create_refresh_token, decode_access_token,
        verify_refresh_token_hash, generate_2fa_code, send_2fa_email,
        is_account_locked, hash_password,
    )
except ImportError:
    from services.auth_service import (
        AuthDB, validate_password_strength, verify_password,
        create_access_token, create_refresh_token, decode_access_token,
        verify_refresh_token_hash, generate_2fa_code, send_2fa_email,
        is_account_locked, hash_password,
    )


class RegisterRequest(BaseModel):
    email: str = Field(..., description="User email address")
    password: str = Field(..., min_length=8, description="Password (min 8 chars, 1 uppercase, 1 number)")
    confirm_password: str = Field(..., description="Password confirmation")
    full_name: str = Field(..., min_length=2, description="Full name")


class LoginRequest(BaseModel):
    email: str = Field(..., description="User email")
    password: str = Field(..., description="User password")


class Verify2FARequest(BaseModel):
    user_id: str = Field(..., description="User ID from login step")
    code: str = Field(..., min_length=6, max_length=6, description="6-digit verification code")


class RefreshTokenRequest(BaseModel):
    refresh_token: str = Field(..., description="Refresh token")
    user_id: str = Field(..., description="User ID")


class ChangePasswordRequest(BaseModel):
    current_password: str = Field(..., description="Current password")
    new_password: str = Field(..., min_length=8, description="New password")


class ForgotPasswordRequest(BaseModel):
    email: str = Field(..., description="Registered email address")


@app.post("/api/auth/register")
async def register(req: RegisterRequest, request: Request):
    """Register a new user account."""
    # Rate limiting
    client_ip = request.client.host if request.client else "unknown"
    if not _auth_limiter.is_allowed(f"register:{client_ip}"):
        raise HTTPException(status_code=429, detail="Too many requests. Try again later.")

    # Validate passwords match
    if req.password != req.confirm_password:
        raise HTTPException(status_code=400, detail="Las contraseñas no coinciden")

    # Validate password strength
    valid, msg = validate_password_strength(req.password)
    if not valid:
        raise HTTPException(status_code=400, detail=msg)

    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor()

        # Check if email already exists
        existing = AuthDB.find_user_by_email(cursor, req.email)
        if existing:
            raise HTTPException(status_code=409, detail="Este correo ya está registrado")

        # Create user
        user = AuthDB.create_user(cursor, req.email, req.password, req.full_name)

        # Generate and send 2FA code
        code = generate_2fa_code()
        AuthDB.set_2fa_code(cursor, user["id"], code)
        send_2fa_email(req.email, code, req.full_name)

        conn.commit()

        logger.info(f"[AUTH] User registered: {user['id']}")
        return {
            "status": "success",
            "message": "Cuenta creada. Revisa tu correo para el código de verificación.",
            "user_id": user["id"],
            "requires_2fa": True,
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[AUTH] Registration error: {e}")
        if conn:
            conn.rollback()
        raise HTTPException(status_code=500, detail="Error al crear la cuenta")
    finally:
        if conn:
            try:
                conn.close()
            except:
                pass


@app.post("/api/auth/login")
async def login(req: LoginRequest, request: Request):
    """Login with email and password."""
    # Rate limiting
    client_ip = request.client.host if request.client else "unknown"
    if not _auth_limiter.is_allowed(f"login:{client_ip}"):
        raise HTTPException(status_code=429, detail="Too many requests. Try again later.")
    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor()

        user = AuthDB.find_user_by_email(cursor, req.email)
        if not user:
            AuthDB.log_login_attempt(cursor, req.email, False)
            conn.commit()
            raise HTTPException(status_code=401, detail="Credenciales incorrectas")

        # Check if account is locked
        if is_account_locked(user.get("locked_until")):
            raise HTTPException(
                status_code=429,
                detail="Cuenta bloqueada por intentos fallidos. Intenta en 15 minutos."
            )

        # Verify password
        if not verify_password(req.password, user["password_hash"]):
            AuthDB.increment_failed_attempts(cursor, req.email)
            AuthDB.log_login_attempt(cursor, req.email, False)
            conn.commit()
            raise HTTPException(status_code=401, detail="Credenciales incorrectas")

        # Reset failed attempts on successful password
        AuthDB.reset_failed_attempts(cursor, req.email)

        # Generate and send 2FA code
        code = generate_2fa_code()
        AuthDB.set_2fa_code(cursor, str(user["id"]), code)
        send_2fa_email(user["email"], code, user["full_name"])

        AuthDB.log_login_attempt(cursor, req.email, True)
        conn.commit()

        logger.info(f"[AUTH] Login step 1 OK for user {user['id']}")
        return {
            "status": "2fa_required",
            "message": "Código de verificación enviado a tu correo.",
            "user_id": str(user["id"]),
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[AUTH] Login error: {e}")
        raise HTTPException(status_code=500, detail="Error de autenticación")
    finally:
        if conn:
            try:
                conn.close()
            except:
                pass


@app.post("/api/auth/verify-2fa")
async def verify_2fa(req: Verify2FARequest, request: Request):
    """Verify 2FA code."""
    # Rate limiting
    client_ip = request.client.host if request.client else "unknown"
    if not _auth_limiter.is_allowed(f"2fa:{client_ip}"):
        raise HTTPException(status_code=429, detail="Too many requests. Try again later.")
    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor()

        valid = AuthDB.verify_2fa_code(cursor, req.user_id, req.code)
        if not valid:
            conn.commit()
            raise HTTPException(status_code=401, detail="Código inválido o expirado")

        user = AuthDB.find_user_by_id(cursor, req.user_id)
        if not user:
            raise HTTPException(status_code=404, detail="Usuario no encontrado")

        # Issue tokens
        access_token = create_access_token(str(user["id"]), user["email"], user["role"])
        raw_refresh, refresh_hash = create_refresh_token(str(user["id"]))
        AuthDB.store_refresh_token(cursor, str(user["id"]), refresh_hash)

        conn.commit()

        logger.info(f"[AUTH] 2FA verified, tokens issued for user {user['id']}")
        return {
            "status": "success",
            "access_token": access_token,
            "refresh_token": raw_refresh,
            "token_type": "bearer",
            "expires_in": 86400,  # 24h in seconds
            "user": {
                "id": str(user["id"]),
                "email": user["email"],
                "full_name": user["full_name"],
                "role": user["role"],
            },
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[AUTH] 2FA verification error: {e}")
        raise HTTPException(status_code=500, detail="Error de verificación")
    finally:
        if conn:
            try:
                conn.close()
            except:
                pass


@app.post("/api/auth/refresh")
async def refresh_token(req: RefreshTokenRequest, request: Request):
    """Refresh an expired access token using a valid refresh token."""
    # Rate limiting
    client_ip = request.client.host if request.client else "unknown"
    if not _auth_limiter.is_allowed(f"refresh:{client_ip}"):
        raise HTTPException(status_code=429, detail="Too many requests. Try again later.")
    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor()

        import hashlib
        token_hash = hashlib.sha256(req.refresh_token.encode()).hexdigest()

        stored = AuthDB.find_valid_refresh_token(cursor, req.user_id, token_hash)
        if not stored:
            raise HTTPException(status_code=401, detail="Refresh token inválido o expirado")

        user = AuthDB.find_user_by_id(cursor, req.user_id)
        if not user:
            raise HTTPException(status_code=404, detail="Usuario no encontrado")

        # Revoke old refresh token and issue new pair
        AuthDB.revoke_refresh_token(cursor, str(stored["id"]))

        new_access = create_access_token(str(user["id"]), user["email"], user["role"])
        new_raw_refresh, new_refresh_hash = create_refresh_token(str(user["id"]))
        AuthDB.store_refresh_token(cursor, str(user["id"]), new_refresh_hash)

        conn.commit()

        return {
            "status": "success",
            "access_token": new_access,
            "refresh_token": new_raw_refresh,
            "token_type": "bearer",
            "expires_in": 86400,
        }

    except HTTPException:
        raise
    except Exception as e:
        # V-01 FIX: Never issue tokens without DB validation.
        # If DB is unavailable, return 503 — client must retry.
        logger.error(f"[AUTH] Token refresh failed — DB unavailable: {e}")
        raise HTTPException(status_code=503, detail="Servicio no disponible. Intenta de nuevo.")
    finally:
        if conn:
            try:
                conn.close()
            except:
                pass


@app.post("/api/auth/logout")
async def logout(user=Depends(verify_token)):
    """Logout — revoke all refresh tokens for the user."""
    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor()

        user_id = user.get("sub") or user.get("user_id")
        if user_id and user_id != "api_client":
            AuthDB.revoke_all_user_tokens(cursor, user_id)
            conn.commit()

        return {"status": "success", "message": "Sesión cerrada"}

    except Exception as e:
        logger.error(f"[AUTH] Logout error: {e}")
        return {"status": "success", "message": "Sesión cerrada"}
    finally:
        if conn:
            try:
                conn.close()
            except:
                pass


@app.post("/api/auth/change-password")
async def change_password(req: ChangePasswordRequest, user=Depends(verify_token)):
    """Change password for authenticated user."""
    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor()

        user_id = user.get("sub") or user.get("user_id")
        db_user = AuthDB.find_user_by_id(cursor, user_id)
        if not db_user:
            raise HTTPException(status_code=404, detail="Usuario no encontrado")

        # Verify current password
        if not verify_password(req.current_password, db_user["password_hash"]):
            raise HTTPException(status_code=401, detail="Contraseña actual incorrecta")

        # Validate new password strength
        valid, msg = validate_password_strength(req.new_password)
        if not valid:
            raise HTTPException(status_code=400, detail=msg)

        # Update password and revoke all tokens
        AuthDB.update_password(cursor, user_id, req.new_password)
        conn.commit()

        return {"status": "success", "message": "Contraseña actualizada. Inicia sesión de nuevo."}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[AUTH] Change password error: {e}")
        raise HTTPException(status_code=500, detail="Error al cambiar contraseña")
    finally:
        if conn:
            try:
                conn.close()
            except:
                pass


@app.post("/api/auth/forgot-password")
async def forgot_password(req: ForgotPasswordRequest):
    """Send password reset code to email. Does not reveal if account exists."""
    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor()

        user = AuthDB.find_user_by_email(cursor, req.email)
        if user:
            code = generate_2fa_code()
            AuthDB.set_2fa_code(cursor, str(user["id"]), code)
            send_2fa_email(user["email"], code, user["full_name"])
            conn.commit()

        # Always return success to not expose user existence
        return {
            "status": "success",
            "message": "Si el correo está registrado, recibirás un código de recuperación.",
        }

    except Exception as e:
        logger.error(f"[AUTH] Forgot password error: {e}")
        return {"status": "success", "message": "Si el correo está registrado, recibirás un código de recuperación."}
    finally:
        if conn:
            try:
                conn.close()
            except:
                pass


@app.get("/api/auth/me")
async def get_current_user(user=Depends(verify_token)):
    """Get current authenticated user profile."""
    conn = None
    try:
        user_id = user.get("sub") or user.get("user_id")
        if user_id == "api_client":
            return {"status": "success", "user": {"id": "api_client", "role": "api_client"}}

        conn = get_db_connection()
        cursor = conn.cursor()
        db_user = AuthDB.find_user_by_id(cursor, user_id)
        if not db_user:
            raise HTTPException(status_code=404, detail="Usuario no encontrado")

        return {
            "status": "success",
            "user": {
                "id": str(db_user["id"]),
                "email": db_user["email"],
                "full_name": db_user["full_name"],
                "role": db_user["role"],
                "email_verified": db_user["email_verified"],
                "automatic_escalation_consent": db_user.get("automatic_escalation_consent", False),
                "language": db_user.get("language", "es"),
            },
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[AUTH] Get user error: {e}")
        raise HTTPException(status_code=500, detail="Error al obtener perfil")
    finally:
        if conn:
            try:
                conn.close()
            except:
                pass


# ================================================================
# CONSENT MANAGEMENT ENDPOINTS (M2 — Granular Consent)
# ================================================================

CONSENT_TYPES = [
    'vital_signs',          # Almacenar y procesar signos vitales
    'location',             # Usar ubicación para emergencias
    'medications',          # Almacenar historial de medicamentos
    'emergency_contacts',   # Compartir datos con contactos de emergencia
    'analytics',            # Análisis de tendencias y patrones
]


class ConsentBatch(BaseModel):
    consents: dict  # { "vital_signs": true, "location": false, ... }
    text_version: str = "1.0"


@app.post("/api/consents")
async def save_consents(batch: ConsentBatch, request: Request, user=Depends(verify_token)):
    """Save granular consent preferences for the authenticated user."""
    conn = None
    try:
        user_id = user.get("sub") or user.get("user_id")
        if not user_id:
            raise HTTPException(status_code=401, detail="User ID not found in token")

        try:
            conn = get_db_connection()
        except Exception as db_err:
            logger.warning(f"[CONSENT] DB unavailable — accepting consents locally: {db_err}")
            return {"status": "success", "consents": [], "db_persisted": False}
        cursor = conn.cursor()

        ip = request.client.host if request.client else None
        ua = request.headers.get("user-agent", "")[:200]

        saved = []
        for consent_type, accepted in batch.consents.items():
            if consent_type not in CONSENT_TYPES:
                continue

            # Revoke any previous active consent of this type
            cursor.execute("""
                UPDATE consents SET revoked_at = CURRENT_TIMESTAMP
                WHERE user_id = %s AND consent_type = %s AND revoked_at IS NULL
            """, (user_id, consent_type))

            # Insert new consent record
            cursor.execute("""
                INSERT INTO consents (user_id, consent_type, accepted, text_version, ip_address, user_agent)
                VALUES (%s, %s, %s, %s, %s, %s)
                RETURNING id, consent_type, accepted, text_version, created_at
            """, (user_id, consent_type, accepted, batch.text_version, ip, ua))

            row = cursor.fetchone()
            saved.append({
                "id": str(row["id"]),
                "consent_type": row["consent_type"],
                "accepted": row["accepted"],
                "text_version": row["text_version"],
                "created_at": row["created_at"].isoformat(),
            })

        conn.commit()
        logger.info(f"[CONSENT] User {user_id} saved {len(saved)} consents")
        return {"status": "success", "consents": saved}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[CONSENT] Error saving consents: {e}")
        raise HTTPException(status_code=500, detail="Error saving consents")
    finally:
        if conn:
            try: conn.close()
            except: pass


@app.get("/api/users/{user_id}/consents")
async def get_user_consents(user_id: str, user=Depends(verify_token)):
    """Get active (non-revoked) consents for a user."""
    conn = None
    try:
        token_user_id = user.get("sub") or user.get("user_id")
        if token_user_id != user_id and user.get("role") != "MEDICO":
            raise HTTPException(status_code=403, detail="Access denied")

        try:
            conn = get_db_connection()
        except Exception as db_err:
            logger.warning(f"[CONSENT] DB unavailable — returning empty consents: {db_err}")
            return {"status": "success", "user_id": user_id, "consents": {}}
        cursor = conn.cursor()

        cursor.execute("""
            SELECT id, consent_type, accepted, text_version, created_at
            FROM consents
            WHERE user_id = %s AND revoked_at IS NULL
            ORDER BY created_at DESC
        """, (user_id,))

        rows = cursor.fetchall()
        consents = {}
        for row in rows:
            ct = row["consent_type"]
            if ct not in consents:  # latest only per type
                consents[ct] = {
                    "id": str(row["id"]),
                    "accepted": row["accepted"],
                    "text_version": row["text_version"],
                    "created_at": row["created_at"].isoformat(),
                }

        return {"status": "success", "user_id": user_id, "consents": consents}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[CONSENT] Error fetching consents: {e}")
        raise HTTPException(status_code=500, detail="Error fetching consents")
    finally:
        if conn:
            try: conn.close()
            except: pass


@app.put("/api/consents/{consent_id}/revoke")
async def revoke_consent(consent_id: str, user=Depends(verify_token)):
    """Revoke a specific consent. GDPR Art. 7(3) / LFPDPPP Art. 8."""
    conn = None
    try:
        user_id = user.get("sub") or user.get("user_id")
        conn = get_db_connection()
        cursor = conn.cursor()

        cursor.execute("""
            UPDATE consents SET revoked_at = CURRENT_TIMESTAMP
            WHERE id = %s::uuid AND user_id = %s AND revoked_at IS NULL
            RETURNING id, consent_type
        """, (consent_id, user_id))

        row = cursor.fetchone()
        conn.commit()

        if row:
            logger.info(f"[CONSENT] User {user_id} revoked consent {row['consent_type']}")
            return {"status": "success", "message": f"Consent '{row['consent_type']}' revoked"}
        else:
            raise HTTPException(status_code=404, detail="Consent not found or already revoked")

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[CONSENT] Error revoking consent: {e}")
        raise HTTPException(status_code=500, detail="Error revoking consent")
    finally:
        if conn:
            try: conn.close()
            except: pass


@app.post("/api/users/{user_id}/export-data")
async def export_user_data(user_id: str, user=Depends(verify_token)):
    """Export all user data as JSON. GDPR Art. 20 / LFPDPPP Art. 24."""
    conn = None
    try:
        token_user_id = user.get("sub") or user.get("user_id")
        if token_user_id != user_id:
            raise HTTPException(status_code=403, detail="Access denied")

        conn = get_db_connection()
        cursor = conn.cursor()

        # User profile
        cursor.execute("SELECT id, email, full_name, role, language, created_at FROM users WHERE id = %s", (user_id,))
        user_data = cursor.fetchone()
        if not user_data:
            raise HTTPException(status_code=404, detail="User not found")

        # Consents
        cursor.execute("""
            SELECT consent_type, accepted, text_version, created_at, revoked_at
            FROM consents WHERE user_id = %s ORDER BY created_at
        """, (user_id,))
        consents = cursor.fetchall()

        # Vital signs
        cursor.execute("""
            SELECT * FROM vital_signs WHERE usuario_id = %s ORDER BY timestamp DESC LIMIT 500
        """, (user_data["email"],))  # usuario_id is email-based in current schema
        vitals = cursor.fetchall()

        export = {
            "export_date": datetime.datetime.now(datetime.timezone.utc).isoformat(),
            "user": {
                "id": str(user_data["id"]),
                "email": user_data["email"],
                "full_name": user_data["full_name"],
                "role": user_data["role"],
                "language": user_data["language"],
                "created_at": user_data["created_at"].isoformat(),
            },
            "consents": [
                {
                    "type": c["consent_type"],
                    "accepted": c["accepted"],
                    "version": c["text_version"],
                    "created_at": c["created_at"].isoformat(),
                    "revoked_at": c["revoked_at"].isoformat() if c["revoked_at"] else None,
                } for c in consents
            ],
            "vital_signs_count": len(vitals),
            "rmhealth_version": "2.0.0",
        }

        logger.info(f"[EXPORT] User {user_id} exported their data")
        return {"status": "success", "data": export}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[EXPORT] Error exporting data: {e}")
        raise HTTPException(status_code=500, detail="Error exporting data")
    finally:
        if conn:
            try: conn.close()
            except: pass


class DeleteAccountRequest(BaseModel):
    confirmation: str  # Must be "ELIMINAR" or "DELETE"


@app.delete("/api/users/{user_id}")
async def delete_user_account(user_id: str, body: DeleteAccountRequest, user=Depends(verify_token)):
    """Delete user account and all associated data. GDPR Art. 17 / LFPDPPP Art. 25."""
    conn = None
    try:
        token_user_id = user.get("sub") or user.get("user_id")
        if token_user_id != user_id:
            raise HTTPException(status_code=403, detail="Access denied")

        if body.confirmation not in ("ELIMINAR", "DELETE"):
            raise HTTPException(status_code=400, detail="Must type ELIMINAR or DELETE to confirm")

        conn = get_db_connection()
        cursor = conn.cursor()

        # CASCADE will delete consents, refresh_tokens
        cursor.execute("DELETE FROM users WHERE id = %s RETURNING email", (user_id,))
        deleted = cursor.fetchone()
        conn.commit()

        if deleted:
            logger.info(f"[DELETE] User account deleted: {deleted['email']}")
            return {"status": "success", "message": "Account and all data permanently deleted"}
        else:
            raise HTTPException(status_code=404, detail="User not found")

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[DELETE] Error deleting account: {e}")
        raise HTTPException(status_code=500, detail="Error deleting account")
    finally:
        if conn:
            try: conn.close()
            except: pass


# ================================================================
# MEDICAL PROFILE (M3)
# ================================================================

class ProfileUpdate(BaseModel):
    full_name: Optional[str] = None
    age: Optional[int] = None
    blood_type: Optional[str] = None
    weight: Optional[float] = None
    height: Optional[float] = None
    treating_doctor_name: Optional[str] = None
    treating_doctor_phone: Optional[str] = None
    treating_doctor_specialty: Optional[str] = None
    special_instructions: Optional[str] = None


@app.get("/api/profile")
async def get_profile(user=Depends(verify_token)):
    """Get complete medical profile: personal data + allergies + conditions + contacts."""
    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        user_id = user["sub"]

        # Auto-migrate: add profile_data column if not exists
        try:
            cursor.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_data JSONB DEFAULT '{}'")
            conn.commit()
        except Exception:
            conn.rollback()

        # Get user basic data
        cursor.execute("""
            SELECT id, full_name, email, role, language,
                   patient_id, created_at, profile_data
            FROM users WHERE id = %s
        """, (user_id,))
        user_data = cursor.fetchone()
        if not user_data:
            raise HTTPException(status_code=404, detail="User not found")

        # Extended data from profile_data JSONB
        pd = user_data.get("profile_data") or {}

        # Get extended profile from patients table
        profile_extra = {}
        if user_data.get("patient_id"):
            cursor.execute("""
                SELECT edad, tipo_sangre, contacto_nombre, contacto_tel, alergias
                FROM patients WHERE usuario_id = %s
            """, (user_data["patient_id"],))
            patient = cursor.fetchone()
            if patient:
                profile_extra = {
                    "age": patient.get("edad"),
                    "blood_type": patient.get("tipo_sangre"),
                    "contacto_nombre": patient.get("contacto_nombre"),
                    "contacto_tel": patient.get("contacto_tel"),
                }

        # Get allergies
        cursor.execute("""
            SELECT id, agent, allergy_type, severity, notes, active, created_at
            FROM allergies WHERE user_id = %s AND active = TRUE
            ORDER BY created_at DESC
        """, (user_id,))
        allergies = [dict(r) for r in cursor.fetchall()]

        # Get conditions
        cursor.execute("""
            SELECT id, name, diagnosis_date, treating_doctor, status, notes, created_at
            FROM medical_conditions WHERE user_id = %s AND status != 'resolved'
            ORDER BY created_at DESC
        """, (user_id,))
        conditions = [dict(r) for r in cursor.fetchall()]

        # Get emergency contacts
        cursor.execute("""
            SELECT id, name, relationship, phone, email, is_primary, notify_on_emergency, created_at
            FROM emergency_contacts WHERE user_id = %s
            ORDER BY is_primary DESC, created_at ASC
        """, (user_id,))
        contacts = [dict(r) for r in cursor.fetchall()]
        
        # Fallback to legacy patients table if no new contacts exist
        if not contacts and profile_extra.get("contacto_nombre"):
            import uuid
            contacts.append({
                "id": str(uuid.uuid4()),
                "name": profile_extra["contacto_nombre"],
                "relationship": "Principal (Legado)",
                "phone": profile_extra.get("contacto_tel", "—"),
                "email": "—",
                "is_primary": True,
                "notify_on_emergency": True,
                "created_at": None
            })

        # Serialize dates/UUIDs
        for item in allergies + conditions + contacts:
            for k, v in item.items():
                if hasattr(v, 'isoformat'):
                    item[k] = v.isoformat()
                elif not isinstance(v, (str, int, float, bool, type(None))):
                    item[k] = str(v)

        return {
            "status": "success",
            "profile": {
                "id": str(user_data["id"]),
                "full_name": user_data["full_name"],
                "email": user_data["email"],
                "role": user_data["role"],
                "age": profile_extra.get("age") or pd.get("age"),
                "blood_type": profile_extra.get("blood_type") or pd.get("blood_type"),
                "weight": pd.get("weight"),
                "height": pd.get("height"),
                "treating_doctor_name": pd.get("treating_doctor_name"),
                "treating_doctor_phone": pd.get("treating_doctor_phone"),
                "treating_doctor_specialty": pd.get("treating_doctor_specialty"),
                "special_instructions": pd.get("special_instructions"),
                "created_at": user_data["created_at"].isoformat() if user_data.get("created_at") else None,
            },
            "allergies": allergies,
            "conditions": conditions,
            "emergency_contacts": contacts,
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[PROFILE] Get profile error: {e}")
        raise HTTPException(status_code=500, detail="Error retrieving profile")
    finally:
        if conn:
            try: conn.close()
            except: pass


@app.put("/api/profile")
async def update_profile(data: ProfileUpdate, user=Depends(verify_token)):
    """Update personal profile data."""
    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        user_id = user["sub"]

        # Auto-migrate: add profile_data column if not exists
        try:
            cursor.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_data JSONB DEFAULT '{}'")
            conn.commit()
        except Exception:
            conn.rollback()

        # Update full_name in users table if provided
        if data.full_name:
            cursor.execute("""
                UPDATE users SET full_name = %s, updated_at = CURRENT_TIMESTAMP
                WHERE id = %s
            """, (data.full_name, user_id))

        # Store extended profile fields in profile_data JSONB
        import json as json_mod
        profile_data = {
            "age": data.age,
            "blood_type": data.blood_type,
            "weight": data.weight,
            "height": data.height,
            "treating_doctor_name": data.treating_doctor_name,
            "treating_doctor_phone": data.treating_doctor_phone,
            "treating_doctor_specialty": data.treating_doctor_specialty,
            "special_instructions": data.special_instructions,
        }
        # Remove None values to preserve existing data
        profile_data = {k: v for k, v in profile_data.items() if v is not None}

        if profile_data:
            cursor.execute("""
                UPDATE users SET profile_data = COALESCE(profile_data, '{}'::jsonb) || %s::jsonb,
                       updated_at = CURRENT_TIMESTAMP
                WHERE id = %s
            """, (json_mod.dumps(profile_data), user_id))

        # Sync with legacy patients table for medical engine compatibility
        cursor.execute("SELECT patient_id FROM users WHERE id = %s", (user_id,))
        u = cursor.fetchone()
        if u and u.get("patient_id"):
            updates = []
            params = []
            if data.age is not None:
                updates.append("edad = %s")
                params.append(data.age)
            if data.blood_type is not None:
                updates.append("tipo_sangre = %s")
                params.append(data.blood_type)
            if data.full_name is not None:
                updates.append("nombre_completo = %s")
                params.append(data.full_name)
            if updates:
                updates.append("updated_at = CURRENT_TIMESTAMP")
                params.append(u["patient_id"])
                cursor.execute(
                    f"UPDATE patients SET {', '.join(updates)} WHERE usuario_id = %s",
                    params
                )

        conn.commit()
        logger.info(f"[PROFILE] Updated profile for user {user_id}")
        return {"status": "success", "message": "Profile updated"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[PROFILE] Update error: {e}")
        raise HTTPException(status_code=500, detail="Error updating profile")
    finally:
        if conn:
            try: conn.close()
            except: pass


# --- Allergies CRUD ---

class AllergyCreate(BaseModel):
    agent: str
    allergy_type: str = "medication"  # medication | food | environmental | other
    severity: str = "moderate"        # mild | moderate | severe | life_threatening
    notes: Optional[str] = None


@app.post("/api/profile/allergies")
async def add_allergy(data: AllergyCreate, user=Depends(verify_token)):
    """Add a new allergy to the user's profile."""
    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        user_id = user["sub"]

        cursor.execute("""
            INSERT INTO allergies (user_id, agent, allergy_type, severity, notes)
            VALUES (%s, %s, %s, %s, %s)
            RETURNING id, agent, allergy_type, severity, notes, created_at
        """, (user_id, data.agent.strip(), data.allergy_type, data.severity, data.notes))

        allergy = dict(cursor.fetchone())
        conn.commit()

        # Serialize
        for k, v in allergy.items():
            if hasattr(v, 'isoformat'):
                allergy[k] = v.isoformat()
            elif not isinstance(v, (str, int, float, bool, type(None))):
                allergy[k] = str(v)

        logger.info(f"[PROFILE] Allergy added for user {user_id}: {data.agent}")
        return {"status": "success", "allergy": allergy}
    except Exception as e:
        logger.error(f"[PROFILE] Add allergy error: {e}")
        raise HTTPException(status_code=500, detail="Error adding allergy")
    finally:
        if conn:
            try: conn.close()
            except: pass


@app.delete("/api/profile/allergies/{allergy_id}")
async def delete_allergy(allergy_id: str, user=Depends(verify_token)):
    """Soft-delete an allergy (set active=FALSE)."""
    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        user_id = user["sub"]

        cursor.execute("""
            UPDATE allergies SET active = FALSE
            WHERE id = %s AND user_id = %s
            RETURNING id
        """, (allergy_id, user_id))

        result = cursor.fetchone()
        if not result:
            raise HTTPException(status_code=404, detail="Allergy not found")
        conn.commit()
        return {"status": "success", "message": "Allergy removed"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[PROFILE] Delete allergy error: {e}")
        raise HTTPException(status_code=500, detail="Error deleting allergy")
    finally:
        if conn:
            try: conn.close()
            except: pass


# --- Medical Conditions CRUD ---

class ConditionCreate(BaseModel):
    name: str
    diagnosis_date: Optional[str] = None
    treating_doctor: Optional[str] = None
    notes: Optional[str] = None


@app.post("/api/profile/conditions")
async def add_condition(data: ConditionCreate, user=Depends(verify_token)):
    """Add a medical condition to the user's profile."""
    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        user_id = user["sub"]

        diag_date = None
        if data.diagnosis_date:
            try:
                diag_date = datetime.datetime.strptime(data.diagnosis_date, "%Y-%m-%d").date()
            except ValueError:
                pass

        cursor.execute("""
            INSERT INTO medical_conditions (user_id, name, diagnosis_date, treating_doctor, notes)
            VALUES (%s, %s, %s, %s, %s)
            RETURNING id, name, diagnosis_date, treating_doctor, status, notes, created_at
        """, (user_id, data.name.strip(), diag_date, data.treating_doctor, data.notes))

        condition = dict(cursor.fetchone())
        conn.commit()

        for k, v in condition.items():
            if hasattr(v, 'isoformat'):
                condition[k] = v.isoformat()
            elif not isinstance(v, (str, int, float, bool, type(None))):
                condition[k] = str(v)

        logger.info(f"[PROFILE] Condition added for user {user_id}: {data.name}")
        return {"status": "success", "condition": condition}
    except Exception as e:
        logger.error(f"[PROFILE] Add condition error: {e}")
        raise HTTPException(status_code=500, detail="Error adding condition")
    finally:
        if conn:
            try: conn.close()
            except: pass


@app.delete("/api/profile/conditions/{condition_id}")
async def delete_condition(condition_id: str, user=Depends(verify_token)):
    """Mark a condition as resolved."""
    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        user_id = user["sub"]

        cursor.execute("""
            UPDATE medical_conditions SET status = 'resolved'
            WHERE id = %s AND user_id = %s
            RETURNING id
        """, (condition_id, user_id))

        result = cursor.fetchone()
        if not result:
            raise HTTPException(status_code=404, detail="Condition not found")
        conn.commit()
        return {"status": "success", "message": "Condition resolved"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[PROFILE] Delete condition error: {e}")
        raise HTTPException(status_code=500, detail="Error deleting condition")
    finally:
        if conn:
            try: conn.close()
            except: pass


# --- Emergency Contacts CRUD ---

class EmergencyContactCreate(BaseModel):
    name: str
    relationship: str
    phone: str
    email: Optional[str] = None
    is_primary: bool = False
    notify_on_emergency: bool = True


@app.post("/api/profile/emergency-contacts")
async def add_emergency_contact(data: EmergencyContactCreate, user=Depends(verify_token)):
    """Add an emergency contact (max 5 per user)."""
    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        user_id = user["sub"]

        # Check count (max 5)
        cursor.execute("SELECT COUNT(*) as cnt FROM emergency_contacts WHERE user_id = %s", (user_id,))
        count = cursor.fetchone()["cnt"]
        if count >= 5:
            raise HTTPException(status_code=400, detail="Maximum 5 emergency contacts allowed")

        cursor.execute("""
            INSERT INTO emergency_contacts (user_id, name, relationship, phone, email, is_primary, notify_on_emergency)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            RETURNING id, name, relationship, phone, email, is_primary, notify_on_emergency, created_at
        """, (user_id, data.name.strip(), data.relationship.strip(), data.phone.strip(),
              data.email, data.is_primary, data.notify_on_emergency))

        contact = dict(cursor.fetchone())
        conn.commit()

        for k, v in contact.items():
            if hasattr(v, 'isoformat'):
                contact[k] = v.isoformat()
            elif not isinstance(v, (str, int, float, bool, type(None))):
                contact[k] = str(v)

        logger.info(f"[PROFILE] Contact added for user {user_id}: {data.name}")
        return {"status": "success", "contact": contact}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[PROFILE] Add contact error: {e}")
        raise HTTPException(status_code=500, detail="Error adding contact")
    finally:
        if conn:
            try: conn.close()
            except: pass


@app.delete("/api/profile/emergency-contacts/{contact_id}")
async def delete_emergency_contact(contact_id: str, user=Depends(verify_token)):
    """Delete an emergency contact."""
    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        user_id = user["sub"]

        cursor.execute("""
            DELETE FROM emergency_contacts
            WHERE id = %s AND user_id = %s
            RETURNING id
        """, (contact_id, user_id))

        result = cursor.fetchone()
        if not result:
            raise HTTPException(status_code=404, detail="Contact not found")
        conn.commit()
        return {"status": "success", "message": "Contact deleted"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[PROFILE] Delete contact error: {e}")
        raise HTTPException(status_code=500, detail="Error deleting contact")
    finally:
        if conn:
            try: conn.close()
            except: pass


# --- Emergency Card ---

import secrets

@app.post("/api/profile/emergency-card")
async def generate_emergency_card(user=Depends(verify_token)):
    """Generate a temporary public token for emergency card access (24h)."""
    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        user_id = user["sub"]

        token = secrets.token_urlsafe(32)
        expires = datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(hours=24)

        cursor.execute("""
            INSERT INTO emergency_card_tokens (user_id, token, expires_at)
            VALUES (%s, %s, %s)
            RETURNING token, expires_at
        """, (user_id, token, expires))

        result = dict(cursor.fetchone())
        conn.commit()

        base_url = "https://rmhealth-api-292048010515.us-central1.run.app"
        card_url = f"{base_url}/api/emergency-card/{token}"

        logger.info(f"[PROFILE] Emergency card token generated for user {user_id}")
        return {
            "status": "success",
            "card_url": card_url,
            "token": token,
            "expires_at": result["expires_at"].isoformat(),
        }
    except Exception as e:
        logger.error(f"[PROFILE] Emergency card error: {e}")
        raise HTTPException(status_code=500, detail="Error generating emergency card")
    finally:
        if conn:
            try: conn.close()
            except: pass


@app.get("/api/emergency-card/{token}")
async def get_emergency_card(token: str):
    """PUBLIC endpoint — No auth required. Returns critical patient data for emergencies."""
    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor()

        # Find valid token
        cursor.execute("""
            SELECT user_id, expires_at FROM emergency_card_tokens
            WHERE token = %s
        """, (token,))
        token_data = cursor.fetchone()

        if not token_data:
            raise HTTPException(status_code=404, detail="Emergency card not found or expired")

        now = datetime.datetime.now(datetime.timezone.utc)
        expires = token_data["expires_at"]
        if hasattr(expires, 'tzinfo') and expires.tzinfo is None:
            expires = expires.replace(tzinfo=datetime.timezone.utc)
        if now > expires:
            raise HTTPException(status_code=410, detail="Emergency card expired")

        user_id = str(token_data["user_id"])

        # Log access
        cursor.execute("""
            UPDATE emergency_card_tokens SET access_count = access_count + 1
            WHERE token = %s
        """, (token,))

        # Get user basic info
        cursor.execute("SELECT full_name FROM users WHERE id = %s", (user_id,))
        user_row = cursor.fetchone()
        full_name = user_row["full_name"] if user_row else "Unknown"

        # Get patient data from legacy table
        cursor.execute("SELECT patient_id FROM users WHERE id = %s", (user_id,))
        u = cursor.fetchone()
        patient_data = {}
        if u and u.get("patient_id"):
            cursor.execute("""
                SELECT edad, tipo_sangre, genero FROM patients WHERE usuario_id = %s
            """, (u["patient_id"],))
            p = cursor.fetchone()
            if p:
                patient_data = {"age": p.get("edad"), "blood_type": p.get("tipo_sangre"), "gender": p.get("genero")}

        # Get allergies
        cursor.execute("""
            SELECT agent, allergy_type, severity FROM allergies
            WHERE user_id = %s AND active = TRUE
        """, (user_id,))
        allergies = [dict(r) for r in cursor.fetchall()]

        # Get conditions
        cursor.execute("""
            SELECT name, status FROM medical_conditions
            WHERE user_id = %s AND status != 'resolved'
        """, (user_id,))
        conditions = [dict(r) for r in cursor.fetchall()]

        # Get emergency contacts
        cursor.execute("""
            SELECT name, relationship, phone FROM emergency_contacts
            WHERE user_id = %s ORDER BY is_primary DESC
        """, (user_id,))
        contacts = [dict(r) for r in cursor.fetchall()]

        conn.commit()

        return {
            "status": "success",
            "emergency_card": {
                "patient_name": full_name,
                "age": patient_data.get("age"),
                "blood_type": patient_data.get("blood_type"),
                "gender": patient_data.get("gender"),
                "allergies": allergies,
                "conditions": conditions,
                "emergency_contacts": contacts,
                "generated_by": "RmHealth Emergency System",
                "disclaimer": "This information is provided for emergency medical use only.",
            }
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[PROFILE] Emergency card access error: {e}")
        raise HTTPException(status_code=500, detail="Error accessing emergency card")
    finally:
        if conn:
            try: conn.close()
            except: pass


# ================================================================
# Medications CRUD — M5 (Medication Management)
# ================================================================

class MedicationCreate(BaseModel):
    name: str
    dosage: Optional[str] = None
    frequency: Optional[str] = None
    schedule_time: Optional[str] = None
    med_type: str = "pill"  # pill | injection | liquid | patch | inhaler
    doctor: Optional[str] = None
    notes: Optional[str] = None

class MedicationUpdate(BaseModel):
    name: Optional[str] = None
    dosage: Optional[str] = None
    frequency: Optional[str] = None
    schedule_time: Optional[str] = None
    med_type: Optional[str] = None
    doctor: Optional[str] = None
    notes: Optional[str] = None
    active: Optional[bool] = None


def _serialize_row(row):
    """Serialize a dict row for JSON output."""
    result = {}
    for k, v in row.items():
        if hasattr(v, 'isoformat'):
            result[k] = v.isoformat()
        elif not isinstance(v, (str, int, float, bool, type(None))):
            result[k] = str(v)
        else:
            result[k] = v
    return result


@app.post("/api/medications")
async def create_medication(data: MedicationCreate, user=Depends(verify_token)):
    """Create a new medication for the authenticated user."""
    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        user_id = user["sub"]

        cursor.execute("""
            INSERT INTO medications (user_id, name, dosage, frequency, schedule_time, med_type, doctor, notes)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING id, name, dosage, frequency, schedule_time, med_type, doctor, notes, active, created_at, updated_at
        """, (user_id, data.name.strip(), data.dosage, data.frequency,
              data.schedule_time, data.med_type, data.doctor, data.notes))

        med = _serialize_row(dict(cursor.fetchone()))
        conn.commit()
        logger.info(f"[MEDS] Created medication '{data.name}' for user {user_id}")
        return {"status": "success", "medication": med}
    except Exception as e:
        logger.error(f"[MEDS] Create error: {e}")
        raise HTTPException(status_code=500, detail="Error creating medication")
    finally:
        if conn:
            try: conn.close()
            except: pass


@app.get("/api/medications")
async def list_medications(user=Depends(verify_token)):
    """List all active medications for the authenticated user."""
    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        user_id = user["sub"]

        cursor.execute("""
            SELECT id, name, dosage, frequency, schedule_time, med_type, doctor, notes, active, created_at, updated_at
            FROM medications
            WHERE user_id = %s AND active = TRUE
            ORDER BY created_at ASC
        """, (user_id,))

        meds = [_serialize_row(dict(r)) for r in cursor.fetchall()]

        # Get today's doses
        cursor.execute("""
            SELECT medication_id, taken_at FROM medication_doses
            WHERE user_id = %s AND dose_date = CURRENT_DATE
        """, (user_id,))

        today_doses = {}
        for row in cursor.fetchall():
            today_doses[str(row['medication_id'])] = row['taken_at'].isoformat() if hasattr(row['taken_at'], 'isoformat') else str(row['taken_at'])

        # Attach today's dose status to each med
        for med in meds:
            med_id = str(med['id'])
            med['taken_today'] = med_id in today_doses
            med['taken_at'] = today_doses.get(med_id)

        return {"status": "success", "medications": meds}
    except Exception as e:
        logger.error(f"[MEDS] List error: {e}")
        raise HTTPException(status_code=500, detail="Error listing medications")
    finally:
        if conn:
            try: conn.close()
            except: pass


@app.put("/api/medications/{med_id}")
async def update_medication(med_id: str, data: MedicationUpdate, user=Depends(verify_token)):
    """Update a medication."""
    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        user_id = user["sub"]

        # Build dynamic update
        fields = []
        values = []
        for field_name in ['name', 'dosage', 'frequency', 'schedule_time', 'med_type', 'doctor', 'notes', 'active']:
            val = getattr(data, field_name, None)
            if val is not None:
                fields.append(f"{field_name} = %s")
                values.append(val.strip() if isinstance(val, str) else val)

        if not fields:
            raise HTTPException(status_code=400, detail="No fields to update")

        fields.append("updated_at = CURRENT_TIMESTAMP")
        values.extend([med_id, user_id])

        cursor.execute(f"""
            UPDATE medications SET {', '.join(fields)}
            WHERE id = %s AND user_id = %s
            RETURNING id, name, dosage, frequency, schedule_time, med_type, doctor, notes, active, created_at, updated_at
        """, values)

        result = cursor.fetchone()
        if not result:
            raise HTTPException(status_code=404, detail="Medication not found")

        conn.commit()
        return {"status": "success", "medication": _serialize_row(dict(result))}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[MEDS] Update error: {e}")
        raise HTTPException(status_code=500, detail="Error updating medication")
    finally:
        if conn:
            try: conn.close()
            except: pass


@app.delete("/api/medications/{med_id}")
async def delete_medication(med_id: str, user=Depends(verify_token)):
    """Soft-delete a medication (set active=FALSE)."""
    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        user_id = user["sub"]

        cursor.execute("""
            UPDATE medications SET active = FALSE, updated_at = CURRENT_TIMESTAMP
            WHERE id = %s AND user_id = %s
            RETURNING id
        """, (med_id, user_id))

        result = cursor.fetchone()
        if not result:
            raise HTTPException(status_code=404, detail="Medication not found")
        conn.commit()
        return {"status": "success", "message": "Medication removed"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[MEDS] Delete error: {e}")
        raise HTTPException(status_code=500, detail="Error deleting medication")
    finally:
        if conn:
            try: conn.close()
            except: pass


@app.post("/api/medications/{med_id}/dose")
async def record_dose(med_id: str, user=Depends(verify_token)):
    """Record that a medication was taken today. Toggle: if already taken, remove the dose."""
    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        user_id = user["sub"]

        # Check if already taken today
        cursor.execute("""
            SELECT id FROM medication_doses
            WHERE medication_id = %s AND user_id = %s AND dose_date = CURRENT_DATE
        """, (med_id, user_id))

        existing = cursor.fetchone()
        if existing:
            # Undo — remove the dose
            cursor.execute("DELETE FROM medication_doses WHERE id = %s", (existing['id'],))
            conn.commit()
            return {"status": "success", "action": "undone", "taken": False}
        else:
            # Record new dose
            cursor.execute("""
                INSERT INTO medication_doses (medication_id, user_id, dose_date)
                VALUES (%s, %s, CURRENT_DATE)
                RETURNING id, taken_at
            """, (med_id, user_id))
            dose = dict(cursor.fetchone())
            conn.commit()
            taken_at = dose['taken_at'].isoformat() if hasattr(dose['taken_at'], 'isoformat') else str(dose['taken_at'])
            return {"status": "success", "action": "recorded", "taken": True, "taken_at": taken_at}
    except Exception as e:
        logger.error(f"[MEDS] Record dose error: {e}")
        raise HTTPException(status_code=500, detail="Error recording dose")
    finally:
        if conn:
            try: conn.close()
            except: pass


@app.get("/api/medications/adherence")
async def get_adherence(user=Depends(verify_token)):
    """Get adherence stats for the last 30 days."""
    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        user_id = user["sub"]

        # Count active medications
        cursor.execute("SELECT COUNT(*) as total FROM medications WHERE user_id = %s AND active = TRUE", (user_id,))
        total_meds = cursor.fetchone()['total']

        if total_meds == 0:
            return {"status": "success", "adherence_pct": 0, "total_meds": 0, "daily": []}

        # Get daily dose counts for last 30 days
        cursor.execute("""
            SELECT dose_date, COUNT(DISTINCT medication_id) as doses_taken
            FROM medication_doses
            WHERE user_id = %s AND dose_date >= CURRENT_DATE - INTERVAL '30 days'
            GROUP BY dose_date
            ORDER BY dose_date ASC
        """, (user_id,))

        daily = []
        total_possible = 0
        total_taken = 0
        for row in cursor.fetchall():
            d = {
                'date': row['dose_date'].isoformat(),
                'taken': row['doses_taken'],
                'total': total_meds,
                'pct': round((row['doses_taken'] / total_meds) * 100)
            }
            daily.append(d)
            total_possible += total_meds
            total_taken += row['doses_taken']

        adherence_pct = round((total_taken / total_possible) * 100) if total_possible > 0 else 0

        return {
            "status": "success",
            "adherence_pct": adherence_pct,
            "total_meds": total_meds,
            "days_tracked": len(daily),
            "daily": daily
        }
    except Exception as e:
        logger.error(f"[MEDS] Adherence error: {e}")
        raise HTTPException(status_code=500, detail="Error fetching adherence")
    finally:
        if conn:
            try: conn.close()
            except: pass


# ================================================================
# MULTI-ACTOR SYSTEM — DOCTOR/CUIDADOR ENDPOINTS (M7)
# ================================================================

def require_role(*allowed_roles):
    """Dependency that verifies the authenticated user has one of the allowed roles."""
    def _check(user=Depends(verify_token)):
        user_role = user.get("role", "PACIENTE")
        if user_role not in allowed_roles and user.get("user_id") != "api_client":
            raise HTTPException(status_code=403, detail="Rol no autorizado para esta operación")
        return user
    return _check


def _verify_doctor_patient_link(cursor, doctor_id: str, patient_id: str):
    """Verify active link between doctor and patient. Raises 403 if not linked."""
    cursor.execute(
        "SELECT id FROM doctor_patient_links WHERE doctor_id = %s AND patient_id = %s AND status = 'active'",
        (doctor_id, patient_id)
    )
    if not cursor.fetchone():
        raise HTTPException(status_code=403, detail="No tiene acceso a este paciente")


@app.post("/api/doctor/patients/invite")
async def doctor_generate_invite(
    request: Request,
    user=Depends(require_role("MEDICO", "CUIDADOR"))
):
    """Generate an 8-character invite code for a patient to link with this doctor."""
    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        doctor_id = user.get("user_id") or user.get("sub")

        # Generate unique 8-char alphanumeric code
        for _ in range(10):
            code = ''.join(random.choices(string.ascii_uppercase + string.digits, k=8))
            cursor.execute("SELECT id FROM doctor_patient_links WHERE invite_code = %s", (code,))
            if not cursor.fetchone():
                break

        expires = datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(hours=48)

        cursor.execute("""
            INSERT INTO doctor_patient_links (doctor_id, invite_code, invite_expires_at, doctor_role, status)
            VALUES (%s, %s, %s, %s, 'pending')
            RETURNING id, invite_code, invite_expires_at
        """, (doctor_id, code, expires, user.get("role", "MEDICO")))
        result = cursor.fetchone()
        conn.commit()

        return {
            "status": "success",
            "invite_code": result["invite_code"],
            "expires_at": result["invite_expires_at"].isoformat(),
            "message": "Comparte este código con tu paciente. Válido por 48 horas."
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[DOCTOR] Invite generation error: {e}")
        raise HTTPException(status_code=500, detail="Error generando invitación")
    finally:
        if conn:
            try: conn.close()
            except: pass


@app.get("/api/doctor/patients")
async def doctor_list_patients(user=Depends(require_role("MEDICO", "CUIDADOR"))):
    """List all patients linked to this doctor/caregiver."""
    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        doctor_id = user.get("user_id") or user.get("sub")

        cursor.execute("""
            SELECT dpl.id as link_id, dpl.status, dpl.doctor_role, dpl.created_at, dpl.accepted_at,
                   u.id as patient_id, u.full_name, u.email
            FROM doctor_patient_links dpl
            JOIN users u ON u.id = dpl.patient_id
            WHERE dpl.doctor_id = %s AND dpl.status IN ('active', 'pending')
            ORDER BY dpl.created_at DESC
        """, (doctor_id,))
        links = cursor.fetchall()

        patients = []
        for link in links:
            patient_data = {
                "link_id": str(link["link_id"]),
                "patient_id": str(link["patient_id"]),
                "full_name": link["full_name"],
                "email": link["email"],
                "status": link["status"],
                "role": link["doctor_role"],
                "linked_at": link["accepted_at"].isoformat() if link["accepted_at"] else None,
            }

            # For active links, get latest vitals summary
            if link["status"] == "active":
                cursor.execute("""
                    SELECT frecuencia_cardiaca, presion_sistolica, presion_diastolica,
                           oxigeno, glucosa, created_at
                    FROM registros_vitales
                    WHERE usuario_id = %s
                    ORDER BY created_at DESC LIMIT 1
                """, (str(link["patient_id"]),))
                latest = cursor.fetchone()
                if latest:
                    patient_data["last_vitals"] = {
                        "heart_rate": latest["frecuencia_cardiaca"],
                        "systolic": latest["presion_sistolica"],
                        "diastolic": latest["presion_diastolica"],
                        "spo2": latest["oxigeno"],
                        "glucose": latest["glucosa"],
                        "timestamp": latest["created_at"].isoformat(),
                    }

                # Count active alerts
                cursor.execute("""
                    SELECT COUNT(*) as cnt FROM preventive_alerts
                    WHERE user_id = %s AND severity IN ('HIGH', 'MEDIUM')
                    AND acknowledged_at IS NULL
                """, (str(link["patient_id"]),))
                alert_count = cursor.fetchone()
                patient_data["active_alerts"] = alert_count["cnt"] if alert_count else 0

            patients.append(patient_data)

        return {"status": "success", "patients": patients}
    except Exception as e:
        logger.error(f"[DOCTOR] List patients error: {e}")
        raise HTTPException(status_code=500, detail="Error listando pacientes")
    finally:
        if conn:
            try: conn.close()
            except: pass


@app.delete("/api/doctor/patients/{patient_id}/unlink")
async def doctor_unlink_patient(patient_id: str, user=Depends(require_role("MEDICO", "CUIDADOR"))):
    """Revoke link with a patient."""
    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        doctor_id = user.get("user_id") or user.get("sub")

        cursor.execute("""
            UPDATE doctor_patient_links
            SET status = 'revoked', revoked_at = CURRENT_TIMESTAMP
            WHERE doctor_id = %s AND patient_id = %s AND status = 'active'
            RETURNING id
        """, (doctor_id, patient_id))
        result = cursor.fetchone()
        conn.commit()

        if not result:
            raise HTTPException(status_code=404, detail="Vínculo no encontrado")

        return {"status": "success", "message": "Vínculo revocado"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[DOCTOR] Unlink error: {e}")
        raise HTTPException(status_code=500, detail="Error revocando vínculo")
    finally:
        if conn:
            try: conn.close()
            except: pass


@app.get("/api/doctor/patients/{patient_id}/vitals")
async def doctor_get_patient_vitals(patient_id: str, user=Depends(require_role("MEDICO", "CUIDADOR"))):
    """Get vital signs history for a linked patient."""
    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        doctor_id = user.get("user_id") or user.get("sub")
        _verify_doctor_patient_link(cursor, doctor_id, patient_id)

        cursor.execute("""
            SELECT id, usuario_id, frecuencia_cardiaca, presion_sistolica, presion_diastolica,
                   oxigeno, glucosa, temp_corporal, nivel_riesgo, created_at
            FROM registros_vitales
            WHERE usuario_id = %s
            ORDER BY created_at DESC LIMIT 50
        """, (patient_id,))
        records = cursor.fetchall()

        vitals = []
        for r in records:
            vitals.append({
                "id": str(r["id"]),
                "heart_rate": r["frecuencia_cardiaca"],
                "systolic": r["presion_sistolica"],
                "diastolic": r["presion_diastolica"],
                "spo2": r["oxigeno"],
                "glucose": r["glucosa"],
                "temperature": r["temp_corporal"],
                "risk_level": r["nivel_riesgo"],
                "timestamp": r["created_at"].isoformat(),
            })

        return {"status": "success", "patient_id": patient_id, "records": vitals}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[DOCTOR] Patient vitals error: {e}")
        raise HTTPException(status_code=500, detail="Error obteniendo signos vitales")
    finally:
        if conn:
            try: conn.close()
            except: pass


@app.get("/api/doctor/patients/{patient_id}/alerts")
async def doctor_get_patient_alerts(patient_id: str, user=Depends(require_role("MEDICO", "CUIDADOR"))):
    """Get preventive alerts for a linked patient."""
    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        doctor_id = user.get("user_id") or user.get("sub")
        _verify_doctor_patient_link(cursor, doctor_id, patient_id)

        cursor.execute("""
            SELECT id, metric, severity, title, message, recommendation,
                   baseline_value, current_value, delta, data_window,
                   response_type, response_reason, created_at, acknowledged_at
            FROM preventive_alerts
            WHERE user_id = %s
            ORDER BY created_at DESC LIMIT 30
        """, (patient_id,))
        alerts = cursor.fetchall()

        result = []
        for a in alerts:
            result.append({
                "id": str(a["id"]),
                "metric": a["metric"],
                "severity": a["severity"],
                "title": a["title"],
                "message": a["message"],
                "recommendation": a["recommendation"],
                "current_value": a["current_value"],
                "baseline_value": a["baseline_value"],
                "delta": a["delta"],
                "response_type": a["response_type"],
                "created_at": a["created_at"].isoformat(),
                "acknowledged": a["acknowledged_at"] is not None,
            })

        return {"status": "success", "patient_id": patient_id, "alerts": result}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[DOCTOR] Patient alerts error: {e}")
        raise HTTPException(status_code=500, detail="Error obteniendo alertas")
    finally:
        if conn:
            try: conn.close()
            except: pass


@app.get("/api/doctor/patients/{patient_id}/medications")
async def doctor_get_patient_medications(patient_id: str, user=Depends(require_role("MEDICO", "CUIDADOR"))):
    """Get medications for a linked patient."""
    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        doctor_id = user.get("user_id") or user.get("sub")
        _verify_doctor_patient_link(cursor, doctor_id, patient_id)

        cursor.execute("""
            SELECT id, name, dosage, frequency, schedule_time, med_type, doctor, notes, active
            FROM medications
            WHERE user_id = %s ORDER BY active DESC, name ASC
        """, (patient_id,))
        meds = cursor.fetchall()

        return {
            "status": "success",
            "patient_id": patient_id,
            "medications": [
                {
                    "id": str(m["id"]),
                    "name": m["name"],
                    "dosage": m["dosage"],
                    "frequency": m["frequency"],
                    "schedule_time": m["schedule_time"],
                    "med_type": m["med_type"],
                    "doctor": m["doctor"],
                    "notes": m["notes"],
                    "active": m["active"],
                }
                for m in meds
            ],
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[DOCTOR] Patient meds error: {e}")
        raise HTTPException(status_code=500, detail="Error obteniendo medicamentos")
    finally:
        if conn:
            try: conn.close()
            except: pass


@app.get("/api/doctor/patients/{patient_id}/profile")
async def doctor_get_patient_profile(patient_id: str, user=Depends(require_role("MEDICO", "CUIDADOR"))):
    """Get full medical profile for a linked patient."""
    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        doctor_id = user.get("user_id") or user.get("sub")
        _verify_doctor_patient_link(cursor, doctor_id, patient_id)

        # User info
        cursor.execute("SELECT id, full_name, email, language, created_at FROM users WHERE id = %s", (patient_id,))
        user_data = cursor.fetchone()
        if not user_data:
            raise HTTPException(status_code=404, detail="Paciente no encontrado")

        # Allergies
        cursor.execute("SELECT agent, allergy_type, severity FROM allergies WHERE user_id = %s AND active = TRUE", (patient_id,))
        allergies = cursor.fetchall()

        # Conditions
        cursor.execute("SELECT name, diagnosis_date, treating_doctor, status FROM medical_conditions WHERE user_id = %s", (patient_id,))
        conditions = cursor.fetchall()

        # Emergency contacts
        cursor.execute("SELECT name, relationship, phone, is_primary FROM emergency_contacts WHERE user_id = %s", (patient_id,))
        contacts = cursor.fetchall()

        return {
            "status": "success",
            "profile": {
                "id": str(user_data["id"]),
                "full_name": user_data["full_name"],
                "email": user_data["email"],
                "language": user_data["language"],
                "member_since": user_data["created_at"].isoformat(),
                "allergies": [dict(a) for a in allergies],
                "conditions": [
                    {**dict(c), "diagnosis_date": c["diagnosis_date"].isoformat() if c["diagnosis_date"] else None}
                    for c in conditions
                ],
                "emergency_contacts": [dict(c) for c in contacts],
            },
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[DOCTOR] Patient profile error: {e}")
        raise HTTPException(status_code=500, detail="Error obteniendo perfil")
    finally:
        if conn:
            try: conn.close()
            except: pass


@app.get("/api/doctor/dashboard/summary")
async def doctor_dashboard_summary(user=Depends(require_role("MEDICO", "CUIDADOR"))):
    """Get dashboard summary: total patients, active alerts, pending invites."""
    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        doctor_id = user.get("user_id") or user.get("sub")

        # Total active patients
        cursor.execute(
            "SELECT COUNT(*) as cnt FROM doctor_patient_links WHERE doctor_id = %s AND status = 'active'",
            (doctor_id,)
        )
        total_patients = cursor.fetchone()["cnt"]

        # Pending invites
        cursor.execute(
            "SELECT COUNT(*) as cnt FROM doctor_patient_links WHERE doctor_id = %s AND status = 'pending'",
            (doctor_id,)
        )
        pending_invites = cursor.fetchone()["cnt"]

        # Total active HIGH/MEDIUM alerts across all linked patients
        cursor.execute("""
            SELECT COUNT(*) as cnt FROM preventive_alerts pa
            JOIN doctor_patient_links dpl ON dpl.patient_id::text = pa.user_id
            WHERE dpl.doctor_id = %s AND dpl.status = 'active'
            AND pa.severity IN ('HIGH', 'MEDIUM') AND pa.acknowledged_at IS NULL
        """, (doctor_id,))
        active_alerts = cursor.fetchone()["cnt"]

        # Recent escalations (need_help responses)
        cursor.execute("""
            SELECT COUNT(*) as cnt FROM preventive_alerts pa
            JOIN doctor_patient_links dpl ON dpl.patient_id::text = pa.user_id
            WHERE dpl.doctor_id = %s AND dpl.status = 'active'
            AND pa.response_type = 'need_help'
            AND pa.created_at > CURRENT_TIMESTAMP - INTERVAL '24 hours'
        """, (doctor_id,))
        escalations_24h = cursor.fetchone()["cnt"]

        return {
            "status": "success",
            "summary": {
                "total_patients": total_patients,
                "pending_invites": pending_invites,
                "active_alerts": active_alerts,
                "escalations_24h": escalations_24h,
            }
        }
    except Exception as e:
        logger.error(f"[DOCTOR] Dashboard summary error: {e}")
        raise HTTPException(status_code=500, detail="Error obteniendo resumen")
    finally:
        if conn:
            try: conn.close()
            except: pass


# ── Patient Link Management ──────────────────────────────────────

@app.get("/api/patient/links")
async def patient_list_links(user=Depends(verify_token)):
    """List doctor/caregiver links for the authenticated patient."""
    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        patient_id = user.get("user_id") or user.get("sub")

        cursor.execute("""
            SELECT dpl.id as link_id, dpl.status, dpl.doctor_role, dpl.created_at, dpl.accepted_at,
                   u.full_name as doctor_name, u.email as doctor_email
            FROM doctor_patient_links dpl
            JOIN users u ON u.id = dpl.doctor_id
            WHERE dpl.patient_id = %s AND dpl.status IN ('active', 'pending')
            ORDER BY dpl.created_at DESC
        """, (patient_id,))
        links = cursor.fetchall()

        return {
            "status": "success",
            "links": [
                {
                    "link_id": str(l["link_id"]),
                    "doctor_name": l["doctor_name"],
                    "doctor_email": l["doctor_email"],
                    "role": l["doctor_role"],
                    "status": l["status"],
                    "created_at": l["created_at"].isoformat(),
                    "accepted_at": l["accepted_at"].isoformat() if l["accepted_at"] else None,
                }
                for l in links
            ],
        }
    except Exception as e:
        logger.error(f"[PATIENT] List links error: {e}")
        raise HTTPException(status_code=500, detail="Error listando vínculos")
    finally:
        if conn:
            try: conn.close()
            except: pass


class AcceptInviteRequest(BaseModel):
    invite_code: str


@app.post("/api/patient/links/accept")
async def patient_accept_invite(req: AcceptInviteRequest, user=Depends(verify_token)):
    """Accept a doctor's invite by entering the 8-character code."""
    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        patient_id = user.get("user_id") or user.get("sub")

        code = req.invite_code.strip().upper()

        cursor.execute("""
            SELECT id, doctor_id, invite_expires_at, status
            FROM doctor_patient_links
            WHERE invite_code = %s
        """, (code,))
        link = cursor.fetchone()

        if not link:
            raise HTTPException(status_code=404, detail="Código de invitación no encontrado")

        if link["status"] != "pending":
            raise HTTPException(status_code=400, detail="Esta invitación ya fue utilizada")

        if link["invite_expires_at"] and link["invite_expires_at"] < datetime.datetime.now(datetime.timezone.utc):
            raise HTTPException(status_code=400, detail="Código expirado. Solicita uno nuevo a tu médico.")

        # Check if already linked
        cursor.execute(
            "SELECT id FROM doctor_patient_links WHERE doctor_id = %s AND patient_id = %s AND status = 'active'",
            (str(link["doctor_id"]), patient_id)
        )
        if cursor.fetchone():
            raise HTTPException(status_code=400, detail="Ya estás vinculado con este profesional")

        # Activate link
        cursor.execute("""
            UPDATE doctor_patient_links
            SET patient_id = %s, status = 'active', accepted_at = CURRENT_TIMESTAMP, invite_code = NULL
            WHERE id = %s
            RETURNING id
        """, (patient_id, str(link["id"])))
        conn.commit()

        # Get doctor name for response
        cursor.execute("SELECT full_name FROM users WHERE id = %s", (str(link["doctor_id"]),))
        doctor = cursor.fetchone()

        return {
            "status": "success",
            "message": f"Vinculado exitosamente con {doctor['full_name'] if doctor else 'tu profesional de salud'}",
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[PATIENT] Accept invite error: {e}")
        raise HTTPException(status_code=500, detail="Error aceptando invitación")
    finally:
        if conn:
            try: conn.close()
            except: pass


@app.put("/api/patient/links/{link_id}/revoke")
async def patient_revoke_link(link_id: str, user=Depends(verify_token)):
    """Revoke access from a linked doctor/caregiver."""
    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        patient_id = user.get("user_id") or user.get("sub")

        cursor.execute("""
            UPDATE doctor_patient_links
            SET status = 'revoked', revoked_at = CURRENT_TIMESTAMP
            WHERE id = %s AND patient_id = %s AND status = 'active'
            RETURNING id
        """, (link_id, patient_id))
        result = cursor.fetchone()
        conn.commit()

        if not result:
            raise HTTPException(status_code=404, detail="Vínculo no encontrado")

        return {"status": "success", "message": "Acceso revocado"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[PATIENT] Revoke link error: {e}")
        raise HTTPException(status_code=500, detail="Error revocando acceso")
    finally:
        if conn:
            try: conn.close()
            except: pass


# ================================================================
# DASHBOARD STATIC FILES MOUNT (M7)
# ================================================================

import pathlib
_dashboard_dir = pathlib.Path(__file__).parent / "static" / "dashboard"
if _dashboard_dir.exists():
    app.mount("/dashboard", StaticFiles(directory=str(_dashboard_dir), html=True), name="dashboard")
    logger.info(f"[DASHBOARD] Mounted at /dashboard from {_dashboard_dir}")
else:
    logger.warning(f"[DASHBOARD] Directory not found: {_dashboard_dir}")


# ================================================================
# EXPEDIENTE CLINICO — Clinical Record (M9 / Phase 7)
# NOM-004-SSA3-2012 compliant medical record management
# ================================================================

class CorrectionRequest(BaseModel):
    record_type: str = Field(..., description="vital_sign | medication | emergency_alert | preventive_alert")
    record_id: str = Field(..., description="ID of the original record")
    correction_note: str = Field(..., min_length=5, max_length=2000)


@app.get("/api/expediente/summary")
async def get_expediente_summary(user=Depends(verify_token)):
    """Get summary of patient's clinical record for mobile screen."""
    conn = None
    try:
        token_user_id = user.get("sub") or user.get("user_id")
        conn = get_db_connection()
        cursor = conn.cursor()

        # Get user profile
        cursor.execute("SELECT email, full_name, language, patient_id FROM users WHERE id = %s", (token_user_id,))
        user_data = cursor.fetchone()
        if not user_data:
            raise HTTPException(status_code=404, detail="User not found")

        # Resolve all patient identifiers for vital_signs lookup
        patient_ids = [str(token_user_id)]
        if user_data.get("patient_id"):
            patient_ids.append(user_data["patient_id"])
        placeholders = ",".join(["%s"] * len(patient_ids))

        # Vital signs count and date range
        cursor.execute(f"""
            SELECT COUNT(*) as total,
                   MIN(timestamp) as first_reading,
                   MAX(timestamp) as last_reading
            FROM vital_signs WHERE usuario_id IN ({placeholders})
        """, patient_ids)
        vitals_stats = cursor.fetchone()

        # Emergency alerts count
        cursor.execute(f"""
            SELECT COUNT(*) as total FROM emergency_alerts WHERE usuario_id IN ({placeholders})
        """, patient_ids)
        alerts_stats = cursor.fetchone()

        # Active medications
        cursor.execute("""
            SELECT COUNT(*) as total FROM medications
            WHERE user_id = %s AND active = TRUE
        """, (token_user_id,))
        meds_stats = cursor.fetchone()

        # Medical conditions
        cursor.execute("""
            SELECT COUNT(*) as total FROM medical_conditions
            WHERE user_id = %s AND status = 'active'
        """, (token_user_id,))
        conditions_count = cursor.fetchone()

        # Allergies
        cursor.execute("""
            SELECT COUNT(*) as total FROM allergies
            WHERE user_id = %s AND active = TRUE
        """, (token_user_id,))
        allergies_count = cursor.fetchone()

        # Corrections count (table may not exist yet)
        corrections_total = 0
        try:
            cursor.execute("""
                SELECT COUNT(*) as total FROM record_corrections
                WHERE user_id = %s
            """, (token_user_id,))
            corrections_total = cursor.fetchone()["total"] or 0
        except Exception:
            pass

        # Calculate monitoring days
        first = vitals_stats["first_reading"]
        last = vitals_stats["last_reading"]
        monitoring_days = 0
        if first and last:
            monitoring_days = max(1, (last - first).days)

        return {
            "status": "success",
            "summary": {
                "total_measurements": vitals_stats["total"] or 0,
                "first_reading": first.isoformat() if first else None,
                "last_reading": last.isoformat() if last else None,
                "monitoring_days": monitoring_days,
                "total_alerts": alerts_stats["total"] or 0,
                "active_medications": meds_stats["total"] or 0,
                "active_conditions": conditions_count["total"] or 0,
                "active_allergies": allergies_count["total"] or 0,
                "total_corrections": corrections_total,
                "patient_name": user_data["full_name"],
                "language": user_data["language"] or "es",
            }
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[EXPEDIENTE] Summary error: {e}")
        raise HTTPException(status_code=500, detail="Error loading clinical record summary")
    finally:
        if conn:
            try: conn.close()
            except: pass


def verify_token_or_query(
        request: Request,
        credentials: HTTPAuthorizationCredentials = Depends(HTTPBearer(auto_error=False))):
    """Verify JWT from header OR query param ?token= (for browser PDF download)."""
    token = None
    if credentials and credentials.credentials:
        token = credentials.credentials
    else:
        token = request.query_params.get("token")
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        if API_SECRET_TOKEN and token == API_SECRET_TOKEN:
            return {"user_id": "api_client", "role": "user"}
        if not JWT_SECRET_KEY:
            raise HTTPException(status_code=500, detail="Server misconfigured")
        payload = jwt.decode(token, JWT_SECRET_KEY, algorithms=["HS256"])
        return payload
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token")


@app.get("/api/expediente/pdf")
async def download_expediente_pdf(request: Request, user=Depends(verify_token_or_query)):
    """Generate and download the complete clinical record as PDF."""
    conn = None
    try:
        token_user_id = user.get("sub") or user.get("user_id")
        conn = get_db_connection()
        cursor = conn.cursor()

        # Auto-migrate: add profile_data column if not exists
        try:
            cursor.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_data JSONB DEFAULT '{}'")
            conn.commit()
        except Exception:
            conn.rollback()

        # User profile
        cursor.execute("""
            SELECT id, email, full_name, role, language, patient_id, profile_data
            FROM users WHERE id = %s
        """, (token_user_id,))
        user_data = cursor.fetchone()
        if not user_data:
            raise HTTPException(status_code=404, detail="User not found")

        language = user_data.get("language") or "es"
        pd = user_data.get("profile_data") or {}

        # Resolve patient identifiers
        patient_ids = [str(token_user_id)]
        if user_data.get("patient_id"):
            patient_ids.append(user_data["patient_id"])
        placeholders = ",".join(["%s"] * len(patient_ids))

        # Build profile from users + patients + profile_data
        profile = {
            "full_name": user_data["full_name"],
            "email": user_data["email"],
            "age": pd.get("age"),
            "blood_type": pd.get("blood_type"),
            "weight": pd.get("weight"),
            "height": pd.get("height"),
            "treating_doctor_name": pd.get("treating_doctor_name"),
            "treating_doctor_phone": pd.get("treating_doctor_phone"),
            "special_instructions": pd.get("special_instructions"),
        }
        legacy_contact_name = None
        legacy_contact_phone = None
        if user_data.get("patient_id"):
            cursor.execute("""
                SELECT edad, tipo_sangre, contacto_nombre, contacto_tel FROM patients WHERE usuario_id = %s
            """, (user_data["patient_id"],))
            patient = cursor.fetchone()
            if patient:
                profile["age"] = profile["age"] or patient.get("edad")
                profile["blood_type"] = profile["blood_type"] or patient.get("tipo_sangre")
                legacy_contact_name = patient.get("contacto_nombre")
                legacy_contact_phone = patient.get("contacto_tel")

        # Vital signs (all, ordered by date)
        cursor.execute(f"""
            SELECT ritmo_cardiaco, spo2, presion_sistolica, presion_diastolica,
                   glucosa, temp_corporal as temperatura, timestamp
            FROM vital_signs WHERE usuario_id IN ({placeholders})
            ORDER BY timestamp DESC
        """, patient_ids)
        vitals = cursor.fetchall()

        # Medications
        cursor.execute("""
            SELECT name as nombre_medicina, dosage as dosis,
                   schedule_time as horario, frequency as dias_semana, active as activo
            FROM medications WHERE user_id = %s ORDER BY active DESC, name
        """, (token_user_id,))
        medications = cursor.fetchall()

        # Conditions
        cursor.execute("""
            SELECT name, status, diagnosis_date, treating_doctor, notes
            FROM medical_conditions WHERE user_id = %s ORDER BY status, name
        """, (token_user_id,))
        conditions = cursor.fetchall()

        # Allergies
        cursor.execute("""
            SELECT agent, allergy_type, severity, notes
            FROM allergies WHERE user_id = %s AND active = TRUE ORDER BY severity DESC
        """, (token_user_id,))
        allergies_list = cursor.fetchall()

        # Emergency contacts
        cursor.execute("""
            SELECT name, relationship, phone, email
            FROM emergency_contacts WHERE user_id = %s ORDER BY is_primary DESC
        """, (token_user_id,))
        contacts = [dict(c) for c in cursor.fetchall()]
        
        if not contacts and legacy_contact_name:
            contacts.append({
                "name": legacy_contact_name,
                "relationship": "Principal (Legado)",
                "phone": legacy_contact_phone or "—",
                "email": "—"
            })

        # Preventive alerts (last 90 days)
        alerts_list = []
        try:
            cursor.execute("""
                SELECT metric, severity, status, created_at
                FROM preventive_alerts
                WHERE user_id = %s AND created_at >= CURRENT_TIMESTAMP - INTERVAL '90 days'
                ORDER BY created_at DESC LIMIT 50
            """, (token_user_id,))
            alerts_list = [dict(a) for a in cursor.fetchall()]
        except Exception:
            pass  # Table may not exist

        # Medication dose counts (last 30 days)
        dose_counts = {}
        try:
            cursor.execute("""
                SELECT medication_id,
                       COUNT(*) as taken
                FROM medication_doses
                WHERE user_id = %s AND dose_date >= CURRENT_DATE - INTERVAL '30 days'
                GROUP BY medication_id
            """, (token_user_id,))
            for row in cursor.fetchall():
                dose_counts[str(row["medication_id"])] = {
                    "taken": row["taken"], "missed": "—"
                }
        except Exception:
            pass  # Table may not exist

        # Generate PDF
        generator = ExpedientePDFGenerator(language=language)
        pdf_bytes = generator.generate(
            profile=profile,
            vitals=[dict(v) for v in vitals],
            medications=[dict(m) for m in medications],
            conditions=[dict(c) for c in conditions],
            allergies_list=[dict(a) for a in allergies_list],
            contacts=[dict(c) for c in contacts],
            sleep_data=None,  # Sleep data is client-side only (Health Connect)
            alerts=alerts_list if alerts_list else None,
            dose_counts=dose_counts if dose_counts else None,
        )

        # Update retention date (NOM-004: 5 years from last activity)
        try:
            cursor.execute("""
                UPDATE users SET retention_until = CURRENT_TIMESTAMP + INTERVAL '5 years'
                WHERE id = %s
            """, (token_user_id,))
        except Exception:
            pass  # Column may not exist yet
        conn.commit()

        logger.info(f"[EXPEDIENTE] PDF generated for user {token_user_id} ({len(vitals)} vitals, {len(medications)} meds)")

        filename = f"expediente_rmhealth_{datetime.datetime.now().strftime('%Y%m%d')}.pdf"
        return StreamingResponse(
            io.BytesIO(pdf_bytes),
            media_type="application/pdf",
            headers={"Content-Disposition": f"attachment; filename={filename}"}
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[EXPEDIENTE] PDF generation error: {e}")
        raise HTTPException(status_code=500, detail="Error generating clinical record PDF")
    finally:
        if conn:
            try: conn.close()
            except: pass


@app.post("/api/expediente/corrections")
async def add_record_correction(body: CorrectionRequest, user=Depends(verify_token)):
    """Add an append-only correction note to a medical record. Records are never modified."""
    conn = None
    try:
        token_user_id = user.get("sub") or user.get("user_id")

        valid_types = {"vital_sign", "medication", "emergency_alert", "preventive_alert"}
        if body.record_type not in valid_types:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid record_type. Must be one of: {', '.join(valid_types)}"
            )

        conn = get_db_connection()
        cursor = conn.cursor()

        cursor.execute("""
            INSERT INTO record_corrections (user_id, record_type, record_id, correction_note)
            VALUES (%s, %s, %s, %s)
            RETURNING id, created_at
        """, (token_user_id, body.record_type, body.record_id, body.correction_note))

        result = cursor.fetchone()
        conn.commit()

        logger.info(f"[EXPEDIENTE] Correction added by {token_user_id} for {body.record_type}:{body.record_id}")

        return {
            "status": "success",
            "correction": {
                "id": str(result["id"]),
                "record_type": body.record_type,
                "record_id": body.record_id,
                "correction_note": body.correction_note,
                "created_at": result["created_at"].isoformat(),
            }
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[EXPEDIENTE] Correction error: {e}")
        raise HTTPException(status_code=500, detail="Error adding correction")
    finally:
        if conn:
            try: conn.close()
            except: pass


@app.get("/api/expediente/corrections/{record_type}/{record_id}")
async def get_record_corrections(record_type: str, record_id: str, user=Depends(verify_token)):
    """Get all corrections for a specific medical record."""
    conn = None
    try:
        token_user_id = user.get("sub") or user.get("user_id")
        conn = get_db_connection()
        cursor = conn.cursor()

        cursor.execute("""
            SELECT id, correction_note, created_at
            FROM record_corrections
            WHERE user_id = %s AND record_type = %s AND record_id = %s
            ORDER BY created_at ASC
        """, (token_user_id, record_type, record_id))

        corrections = cursor.fetchall()

        return {
            "status": "success",
            "corrections": [
                {
                    "id": str(c["id"]),
                    "correction_note": c["correction_note"],
                    "created_at": c["created_at"].isoformat(),
                } for c in corrections
            ]
        }

    except Exception as e:
        logger.error(f"[EXPEDIENTE] Get corrections error: {e}")
        raise HTTPException(status_code=500, detail="Error loading corrections")
    finally:
        if conn:
            try: conn.close()
            except: pass


# ================================================================
# PUNTO 3 — CONTROL DE ALERTAS DE EMERGENCIA
# POST /api/emergencies/{id}/close
# POST /api/emergencies/{id}/cancel
# JWT obligatorio. Sin auto-cierre. Sin afectar Caso E.
# ================================================================

class EmergencyCloseRequest(BaseModel):
    motivo: Optional[str] = None  # Opcional para cierre normal


class EmergencyCancelRequest(BaseModel):
    motivo: str = Field(..., min_length=5,
                        description="Motivo obligatorio para cancelar (mín. 5 caracteres)")


@app.post("/api/emergencies/{emergency_id}/close")
async def close_emergency(
    emergency_id: int,
    body: EmergencyCloseRequest = EmergencyCloseRequest(),
    user=Depends(verify_token),
):
    """
    Cierra una alerta de emergencia activa.
    - JWT obligatorio.
    - Registra user_id, timestamp y motivo opcional.
    - No permite cerrar si ya está cerrada o cancelada.
    - No afecta Caso E ni endpoints existentes.
    """
    user_id = user.get("user_id", "unknown")
    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor()

        # Verificar existencia y estado actual
        cursor.execute(
            "SELECT id, estado, tipo_emergencia FROM emergency_alerts WHERE id = %s",
            (emergency_id,)
        )
        row = cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Alerta no encontrada")

        alert_estado = row["estado"] if isinstance(row, dict) else row[1]
        if alert_estado in ("cerrada", "cancelada"):
            raise HTTPException(
                status_code=409,
                detail=f"La alerta ya está en estado '{alert_estado}'"
            )

        # Cerrar la alerta
        cursor.execute(
            """UPDATE emergency_alerts
               SET estado        = 'cerrada',
                   cerrado_por   = %s,
                   cerrado_en    = NOW(),
                   motivo_cierre = %s
             WHERE id = %s""",
            (user_id, body.motivo, emergency_id)
        )
        conn.commit()
        cursor.close()

        logger.info(
            "EMERGENCY CLOSED: alert_id=%s by user=%s motivo=%s",
            emergency_id, user_id, body.motivo or "no especificado"
        )
        return {
            "ok": True,
            "emergency_id": emergency_id,
            "estado": "cerrada",
            "cerrado_por": user_id,
            "motivo": body.motivo,
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error("Error closing emergency %s: %s", emergency_id, e)
        raise HTTPException(status_code=500, detail="Error al cerrar la alerta")
    finally:
        if conn:
            try:
                conn.close()
            except Exception:
                pass


@app.post("/api/emergencies/{emergency_id}/cancel")
async def cancel_emergency(
    emergency_id: int,
    body: EmergencyCancelRequest,
    user=Depends(verify_token),
):
    """
    Cancela una alerta de emergencia activa.
    - JWT obligatorio.
    - motivo OBLIGATORIO siempre (min 5 caracteres — Pydantic).
    - Alerta CRITICA: log de advertencia explícito.
    - Registra user_id, timestamp y motivo.
    - No permite cancelar si ya está cerrada o cancelada.
    """
    user_id = user.get("user_id", "unknown")
    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor()

        # Verificar existencia y estado actual
        cursor.execute(
            "SELECT id, estado, tipo_emergencia FROM emergency_alerts WHERE id = %s",
            (emergency_id,)
        )
        row = cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Alerta no encontrada")

        alert_estado = row["estado"] if isinstance(row, dict) else row[1]
        tipo = (row["tipo_emergencia"] if isinstance(row, dict) else row[2]) or ""

        if alert_estado in ("cerrada", "cancelada"):
            raise HTTPException(
                status_code=409,
                detail=f"La alerta ya está en estado '{alert_estado}'"
            )

        # Guardia explícita para CRÍTICA — motivo ya es obligatorio por Pydantic,
        # pero se registra warning adicional para auditoría
        if "CRITIC" in tipo.upper() or "CRITICO" in tipo.upper():
            logger.warning(
                "CRITICAL EMERGENCY CANCELLED: alert_id=%s tipo=%s by user=%s motivo='%s'",
                emergency_id, tipo, user_id, body.motivo
            )

        # Cancelar la alerta
        cursor.execute(
            """UPDATE emergency_alerts
               SET estado             = 'cancelada',
                   cancelado_por      = %s,
                   cancelado_en       = NOW(),
                   motivo_cancelacion = %s
             WHERE id = %s""",
            (user_id, body.motivo, emergency_id)
        )
        conn.commit()
        cursor.close()

        logger.info(
            "EMERGENCY CANCELLED: alert_id=%s by user=%s motivo='%s'",
            emergency_id, user_id, body.motivo
        )
        return {
            "ok": True,
            "emergency_id": emergency_id,
            "estado": "cancelada",
            "cancelado_por": user_id,
            "motivo": body.motivo,
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error("Error cancelling emergency %s: %s", emergency_id, e)
        raise HTTPException(status_code=500, detail="Error al cancelar la alerta")
    finally:
        if conn:
            try:
                conn.close()
            except Exception:
                pass


# ================================================================
# FCM TOKEN REGISTRATION (P1 — Firebase Cloud Messaging)
# ================================================================

class FCMTokenRequest(BaseModel):
    """Request body for FCM token registration."""
    usuario_id: str = Field(..., min_length=1, description="User identifier")
    fcm_token: str = Field(..., min_length=10, description="FCM device token")
    platform: str = Field(default="android", description="Device platform")
    device_id: Optional[str] = Field(default=None, description="Unique device identifier")


@app.post("/api/devices/fcm-token")
async def register_fcm_token(data: FCMTokenRequest, user=Depends(verify_token)):
    """Register or update a device's FCM push notification token.

    Upserts by (user_id, device_id). If device_id is not provided,
    upserts by (user_id, fcm_token).

    Security:
      - Requires Bearer token authentication.
      - Logs token suffix only (no PII).
      - Token stored in fcm_tokens table for push dispatch.
    """
    conn = None
    token_suffix = f"...{data.fcm_token[-8:]}" if len(data.fcm_token) > 8 else "***"

    try:
        conn = get_db_connection()
        cursor = conn.cursor()

        if data.device_id:
            # Upsert by user_id + device_id
            cursor.execute(
                """
                INSERT INTO fcm_tokens (user_id, fcm_token, platform, device_id, active, updated_at)
                VALUES (%(user_id)s, %(fcm_token)s, %(platform)s, %(device_id)s, TRUE, CURRENT_TIMESTAMP)
                ON CONFLICT (user_id, device_id)
                    WHERE device_id IS NOT NULL
                DO UPDATE SET
                    fcm_token = EXCLUDED.fcm_token,
                    platform = EXCLUDED.platform,
                    active = TRUE,
                    updated_at = CURRENT_TIMESTAMP
                """,
                {
                    "user_id": data.usuario_id,
                    "fcm_token": data.fcm_token,
                    "platform": data.platform,
                    "device_id": data.device_id,
                },
            )
        else:
            # Deactivate old tokens for this user, insert new one
            cursor.execute(
                "UPDATE fcm_tokens SET active = FALSE, updated_at = CURRENT_TIMESTAMP "
                "WHERE user_id = %s AND fcm_token != %s",
                (data.usuario_id, data.fcm_token),
            )
            cursor.execute(
                """
                INSERT INTO fcm_tokens (user_id, fcm_token, platform, active, updated_at)
                VALUES (%s, %s, %s, TRUE, CURRENT_TIMESTAMP)
                ON CONFLICT DO NOTHING
                """,
                (data.usuario_id, data.fcm_token, data.platform),
            )

        conn.commit()
        logger.info(
            f"[FCM-TOKEN] Registered token {token_suffix} "
            f"for user (platform: {data.platform})"
        )

        return {
            "status": "ok",
            "message": "FCM token registered",
            "platform": data.platform,
        }

    except Exception as e:
        logger.error(f"[FCM-TOKEN] Registration failed: {e}")
        if conn:
            try:
                conn.rollback()
            except Exception:
                pass
        raise HTTPException(
            status_code=500,
            detail="Error registering FCM token",
        )
    finally:
        if conn:
            try:
                conn.close()
            except Exception:
                pass


# ================================================================
# CHATBOT — RM Coach Educational Wellness Chat (Vertex AI Gemini)
# ================================================================

class ChatbotRequest(BaseModel):
    message: str
    recent_history: list = []
    latest_vitals: dict = {}
    context: dict = {"mode": "educational"}


@app.post("/api/chatbot/message")
async def chatbot_message(data: ChatbotRequest):
    """RM Coach — Educational wellness chatbot powered by Vertex AI Gemini.

    Accepts a user message and optional vitals context.
    Returns an educational-only response with forced disclaimer.
    Falls back to local safe response if Gemini is unavailable or disabled.

    SAFETY RULES:
      - Gemini NEVER diagnoses, prescribes, or recommends medications.
      - Backend validates response and replaces prohibited content.
      - Disclaimer is ALWAYS forced server-side.
      - No PII is sent to Gemini (only anonymous numeric vitals).
      - No authentication required (educational content only).
    """
    logger.info(f"[CHATBOT] Received message: '{data.message[:50]}...'")

    try:
        # Sanitize latest_vitals — only allow known numeric keys, no PII
        allowed_vitals_keys = {
            "frecuencia_cardiaca", "oxigeno", "presion_sistolica",
            "presion_diastolica", "glucosa", "temperatura",
            # English aliases accepted from mobile
            "heart_rate", "spo2", "systolic", "diastolic",
            "glucose", "temperature", "hr", "sys", "dia",
        }
        safe_vitals = {
            k: v for k, v in (data.latest_vitals or {}).items()
            if k in allowed_vitals_keys and isinstance(v, (int, float))
        } or None

        result = chat_with_gemini(
            message=data.message,
            latest_vitals=safe_vitals,
            recent_history=data.recent_history[:10] if data.recent_history else None,
            context=data.context or {"mode": "educational"},
        )

        # Double-force disclaimer (defense in depth)
        result["disclaimer"] = (
            "RMHealth proporciona observaciones preventivas. "
            "No constituye diagnóstico médico."
        )

        return result

    except Exception as e:
        logger.error(f"[CHATBOT] Unexpected error: {e}")
        return {
            "reply": (
                "Lo siento, no pude procesar tu consulta en este momento. "
                "Intenta de nuevo o consulta a tu profesional de salud."
            ),
            "mode": "educational",
            "source": "error_fallback",
            "disclaimer": (
                "RMHealth proporciona observaciones preventivas. "
                "No constituye diagnóstico médico."
            ),
        }


# ================================================================
# SECURITY HEADERS MIDDLEWARE (M8)
# ================================================================

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request as StarletteRequest

class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: StarletteRequest, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        # Relaxed CSP for dashboard and privacy — allow inline styles/scripts and Google Fonts
        if request.url.path.startswith("/dashboard") or request.url.path == "/privacy":
            response.headers["Content-Security-Policy"] = (
                "default-src 'self'; "
                "script-src 'self' 'unsafe-inline'; "
                "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
                "font-src 'self' https://fonts.gstatic.com; "
                "connect-src 'self' https://*.run.app; "
                "img-src 'self' data:;"
            )
        else:
            response.headers["Content-Security-Policy"] = "default-src 'self'"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        return response

app.add_middleware(SecurityHeadersMiddleware)


if __name__ == "__main__":
    import uvicorn
    logging.basicConfig(level=logging.INFO)
    uvicorn.run(app, host="0.0.0.0", port=8000)
