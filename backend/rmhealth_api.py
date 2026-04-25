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
    from backend.ai_engine import classify_triage
except ImportError:
    # When running from backend/ directory (Cloud Run)
    from services.medical_engine import MedicalEngine, VitalsInput, PatientContext
    from services.hospital_gateway import HospitalGateway
    from services.notification_service import NotificationService
    from ai_engine import classify_triage

# Setup Logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(name)s: %(message)s'
)
logger = logging.getLogger("RMHealth.API")


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

# Azure configuration
AZURE_KEY_VAULT_URL = os.getenv(
    "AZURE_KEY_VAULT_URL", "https://rmhealth-vault.vault.azure.net/"
)
AZURE_SERVICE_BUS_NAMESPACE = os.getenv(
    "AZURE_SERVICE_BUS_NAMESPACE", "rmhealth-servicebus"
)
AZURE_MAPS_KEY = os.getenv("AZURE_MAPS_KEY", "")


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
        connect_args = {
            "dbname": db_name,
            "user": db_user,
            "password": db_pass
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

        conn.commit()
        # Return DictCursor so it acts like sqlite3.Row mapping
        cursor.close()
        return psycopg2.connect(
            dbname=db_name, user=db_user, password=db_pass, host=db_host, cursor_factory=RealDictCursor
        )
    except Exception as e:
        logging.error(f"Error connecting to PostgreSQL: {e}")
        raise HTTPException(
            status_code=500,
            detail="Database connection error")


class VitalSigns(BaseModel):
    """Medical vital signs data model"""
    usuario_id: str = Field(..., description="Unique user ID")
    ecg: float = Field(..., ge=0.0, le=2.0,
                       description="Electrocardiogram (0.0-2.0)")
    ppg: float = Field(..., ge=0.0, le=2.0,
                       description="Photoplethysmography (0.0-2.0)")
    oxigeno: int = Field(..., ge=70, le=100,
                         description="Oxygen saturation (%)")
    presion_sistolica: int = Field(
        ..., ge=80, le=250, description="Systolic pressure (mmHg)"
    )
    presion_diastolica: int = Field(
        ..., ge=50, le=150, description="Diastolic pressure (mmHg)"
    )
    frecuencia_cardiaca: int = Field(
        ..., ge=40, le=200, description="Heart rate (bpm)"
    )
    temperatura: float = Field(
        ..., ge=35.0, le=42.0, description="Body temperature (°C)"
    )
    glucosa: float = Field(
        default=90.0, ge=30.0, le=500.0,
        description="Blood glucose (mg/dL). Default 90 if not measured."
    )
    timestamp: datetime.datetime = Field(default_factory=datetime.datetime.now)
    ubicacion_lat: float = Field(..., ge=-90, le=90, description="Latitude")
    ubicacion_lon: float = Field(..., ge=-180, le=180, description="Longitude")
    dispositivo_id: str = Field(..., description="Smartwatch device ID")
    emergencia_detectada: bool = Field(
        default=False, description="Automatic emergency detected"
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
    patient_age = 50
    patient_context_kwargs = {"edad": 50}

    # --- OPTIONAL: Try to load patient profile from DB ---
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
                    "nombre_completo": patient_row[4] or "Paciente Desconocido",
                    "tipo_sangre": patient_row[5] or "No especificado",
                    "contacto_emergencia_nombre": patient_row[6] or "",
                    "contacto_emergencia_tel": patient_row[7] or "",
                }
                logger.info(f"Patient profile loaded: {data.usuario_id} (age={patient_age})")
            else:
                logger.warning(f"Patient '{data.usuario_id}' not found in DB. Using defaults.")
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
                data.usuario_id, analysis.dict(), engine_input.dict()
            )

            logger.info(
                f"EMERGENCY DETECTED: {analysis.nivel_criticidad} for user "
                f"{data.usuario_id} (ML={ml_result['level']}, "
                f"confidence={ml_result['confidence']:.2f})"
            )

            # 6. DISPATCH EMERGENCY NOTIFICATIONS (SMS + Hospital)
            try:
                notification_result = NotificationService.dispatch_emergency_protocol(
                    patient_data={
                        "nombre_completo": patient_context_kwargs.get("nombre_completo", "Paciente RMHealth"),
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
                    cursor.execute(
                        """INSERT INTO emergency_alerts
                           (usuario_id, tipo_emergencia, descripcion, ubicacion_lat, ubicacion_lon, estado)
                           VALUES (%s, %s, %s, %s, %s, %s)""",
                        (data.usuario_id,
                         analysis.nivel_criticidad,
                         f"ML={ml_result['level']}({ml_result['confidence']:.0%}) | "
                         f"Score: {analysis.score_riesgo:.1f} | {', '.join(analysis.factores_riesgo)}",
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

        return {
            "status": "success",
            "db_persisted": db_available,
            "ml_triage": ml_result,
            "analysis": analysis.dict(),
            "hospital_routing": hospital.dict() if hospital else None
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

if __name__ == "__main__":
    import uvicorn
    logging.basicConfig(level=logging.INFO)
    uvicorn.run(app, host="0.0.0.0", port=8000)
