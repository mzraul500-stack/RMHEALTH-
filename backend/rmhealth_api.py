#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
RMHEALTH Medical API Server - Azure Integration
Medical server with PostgreSQL, geolocation and emergency alerts
Optimized for Azure Container Apps

© 2025 MORALES ZEPEDA RAUL | Registro INDAUTOR: 03-2025-070109072500-01
"""

import datetime
import json
import logging
import os
import random
import psycopg2
from psycopg2.extras import RealDictCursor
from typing import Optional

import jwt
import requests

from fastapi import Depends, FastAPI, HTTPException, Security, status
from fastapi.middleware.cors import CORSMiddleware
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
    from backend.ai_engine import classify_triage
except ImportError:
    # When running from backend/ directory (Cloud Run)
    from services.medical_engine import MedicalEngine, VitalsInput, PatientContext
    from services.hospital_gateway import HospitalGateway
    from services.notification_service import NotificationService
    from services.preventive_alerts import PreventiveAlertService, VitalReading, PreventiveAlert
    from ai_engine import classify_triage

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

app = FastAPI(
    title="RMHEALTH Medical API - Zero Trust Security",
    description="Medical system with geolocation, emergency alerts and Zero Trust security",
    version="2.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

# CORS middleware — origins loaded from environment
_cors_origins = os.environ.get("CORS_ORIGINS", "*").split(",")
if _cors_origins == ["*"]:
    logger.warning("CORS_ORIGINS not set — allowing all origins. Set CORS_ORIGINS in .env for production.")

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

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
                ecg REAL NOT NULL,
                ppg REAL NOT NULL,
                temp_corporal REAL NOT NULL,
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                ubicacion_lat REAL,
                ubicacion_lon REAL
            )
        """
        )

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
    """Find nearest hospital using Azure Maps"""
    if not AZURE_MAPS_KEY:
        # Fallback to local database
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
        conn.close()

        if hospital:
            return {
                "nombre": hospital[0],
                "telefono": hospital[1],
                "direccion": hospital[2],
                "distancia_metros": hospital[3],
            }
    else:
        # Use Azure Maps API for production
        pass

    return None


# API Endpoints
@app.post("/api/vital-signs")
async def receive_vital_signs(data: VitalSigns, user=Depends(verify_token)):
    """Receive and process vital signs data using the RMHealth Medical Engine.
    
    ML classification runs FIRST (no DB required).
    DB persistence is attempted but non-blocking — if DB is unavailable,
    the API still returns the ML + heuristic results.
    """
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
        db_available = False # Skip DB lookup if phone provides the truth
    else:
        # --- PRIORITY 2: Try to load patient profile from DB ---
        db_available = False
        conn = None
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
        ml_rank = severity_rank.get(ml_result["level"], 0)
        heuristic_rank = severity_rank.get(analysis.nivel_criticidad, 0)

        # Take the higher severity between ML and heuristic
        if ml_rank > heuristic_rank and ml_result["model_available"]:
            analysis.nivel_criticidad = ml_result["level"]
            if ml_rank >= 2:
                analysis.emergencia_detectada = True
            analysis.factores_riesgo.append(
                f"ML Model: {ml_result['level']} (confidence={ml_result['confidence']:.2f})"
            )

        hospital = None
        if analysis.emergencia_detectada:
            # 5. Handle Hospital Routing & FHIR Generation
            hospital = HospitalGateway.get_routing_decission(
                priority=analysis.nivel_criticidad,
                lat=data.ubicacion_lat,
                lon=data.ubicacion_lon,
            )
            fhir_bundle = HospitalGateway.generate_fhir_r4_bundle(
                data.usuario_id, analysis.dict(), engine_input.dict(), real_context.dict()
            )

            logger.info(
                f"EMERGENCY DETECTED: {analysis.nivel_criticidad} for user "
                f"{data.usuario_id} (ML={ml_result['level']}, "
                f"confidence={ml_result['confidence']:.2f})"
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
                    hospital_info=hospital.dict(),
                )
                logger.info(f"Notification dispatch result: {notification_result}")
            except Exception as notif_err:
                logger.error(f"Notification dispatch failed (non-blocking): {notif_err}")

        # 6. OPTIONAL: Persist to database (non-blocking)
        if db_available and conn:
            try:
                cursor = conn.cursor()
                if analysis.emergencia_detectada:
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
                       (usuario_id, ecg, ppg, temp_corporal, ubicacion_lat, ubicacion_lon)
                       VALUES (%s, %s, %s, %s, %s, %s)""",
                    (data.usuario_id, data.ecg, data.ppg, data.temperatura,
                     data.ubicacion_lat, data.ubicacion_lon)
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
                timestamp=datetime.datetime.utcnow(),
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
                            timestamp=row.get("timestamp", datetime.datetime.utcnow()),
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

        return {
            "status": "success",
            "db_persisted": db_available,
            "ml_triage": ml_result,
            "analysis": analysis.dict(),
            "hospital_routing": hospital.dict() if hospital else None,
            "preventive_alerts_generated": preventive_count
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


@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "healthy", "service": "RMHEALTH API", "version": "2.0.0"}


@app.get("/api/emergencies/latest")
async def get_latest_emergency(user=Depends(verify_token)):
    """Fetch the latest emergency alert for the hospital dashboard demo"""
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        # Get the latest emergency based on timestamp
        cursor.execute(
            """SELECT id, usuario_id, tipo_emergencia, descripcion, ubicacion_lat, ubicacion_lon, timestamp, estado 
               FROM emergency_alerts 
               ORDER BY timestamp DESC LIMIT 1"""
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
    """Fetch all emergency alerts for the historical B2B dashboard"""
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute(
            """SELECT id, usuario_id, tipo_emergencia, descripcion, ubicacion_lat, ubicacion_lon, timestamp, estado 
               FROM emergency_alerts 
               ORDER BY timestamp DESC LIMIT 50"""
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
    """Retrieve preventive alerts for a specific user."""
    conn = None
    try:
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
    """Mark a preventive alert as acknowledged/seen by the user."""
    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute(
            """UPDATE preventive_alerts
               SET acknowledged_at = CURRENT_TIMESTAMP
               WHERE id = %s::uuid AND acknowledged_at IS NULL
               RETURNING id""",
            (alert_id,)
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


if __name__ == "__main__":
    import uvicorn
    logging.basicConfig(level=logging.INFO)
    uvicorn.run(app, host="0.0.0.0", port=8000)
