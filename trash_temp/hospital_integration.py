#!/usr/bin/env python3
"""
RmHealth Hospital Integration System
Hospital Integration System for RmHealth - Real-time Communication
Developed by: Raúl Morales (Creator of RmSpace)
Date: August 23, 2025

OBJECTIVES:
- Instant transmission of medical data to hospitals
- Full interoperability with existing hospital systems
- Real-time care confirmations
- FHIR and HL7 standards for maximum compatibility

KEY FEATURES: Hospital-patient communication using smartphones
"""

import asyncio
import json
import uuid
import datetime
from typing import Dict, List, Optional, Any
from dataclasses import dataclass, asdict
from enum import Enum
import websockets
import aiohttp
import asyncpg
from fastapi import FastAPI, WebSocket, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
import xml.etree.ElementTree as ET
from pydantic import BaseModel
import logging
import ssl
from cryptography.fernet import Fernet

# Advanced logging configuration
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger("RmHealthHospitalIntegration")


class EmergencyPriority(Enum):
    """Medical priority levels"""
    CRITICAL = "CRITICAL"
    HIGH = "HIGH"
    MEDIUM = "MEDIUM"
    LOW = "LOW"
    ROUTINE = "ROUTINE"


class HospitalProtocol(Enum):
    """Hospital communication protocols"""
    FHIR_R4 = "FHIR_R4"
    HL7_V2 = "HL7_V2"
    HL7_FHIR = "HL7_FHIR"
    DICOM = "DICOM"
    CUSTOM_API = "CUSTOM_API"


@dataclass
class MedicalRecord:
    """Structured medical record"""
    patient_id: str
    timestamp: datetime.datetime
    vital_signs: Dict[str, float]
    emergency_type: str
    location: Dict[str, float]
    priority: EmergencyPriority
    symptoms: List[str]
    medical_history: List[str]
    medications: List[str]
    allergies: List[str]
    emergency_contact: Dict[str, str]
    device_data: Dict[str, Any]


@dataclass
class HospitalEndpoint:
    """Hospital endpoint configuration"""
    hospital_id: str
    name: str
    address: str
    coordinates: Dict[str, float]
    protocol: HospitalProtocol
    endpoint_url: str
    api_key: str
    specialties: List[str]
    capacity: int
    response_time_avg: float


class RmHealthHospitalIntegrator:
    """
    RmHealth-Hospital Main Integrator

    FEATURES:
    - Instant medical emergency transmission
    - Complete FHIR/HL7 interoperability
    - Real-time confirmations
    - Intelligent routing by proximity and specialty
    """

    def __init__(self):
        self.app = FastAPI(title="RmHealth Hospital Integration API")
        self.setup_cors()
        self.connected_hospitals: Dict[str, HospitalEndpoint] = {}
        self.active_emergencies: Dict[str, MedicalRecord] = {}
        self.websocket_connections: Dict[str, WebSocket] = {}
        self.encryption_key = Fernet.generate_key()
        self.cipher_suite = Fernet(self.encryption_key)
        self.db_pool = None

        # Demo hospital configuration
        self.setup_demo_hospitals()

        logger.info("RmHealth Hospital Integration System initialized")

    def setup_cors(self):
        """CORS configuration for web communication"""
        self.app.add_middleware(
            CORSMiddleware,
            allow_origins=["*"],
            allow_credentials=True,
            allow_methods=["*"],
            allow_headers=["*"],
        )

    def setup_demo_hospitals(self):
        """Demo hospital configuration for testing"""
        demo_hospitals = [
            HospitalEndpoint(
                hospital_id="HOSP_001",
                name="Central Emergency Hospital",
                address="Av. Principal 123, Ciudad",
                coordinates={"lat": -12.0464, "lng": -77.0428},
                protocol=HospitalProtocol.FHIR_R4,
                endpoint_url="https://hospital-central.health/fhir/R4",
                api_key="hc_key_123456789",
                specialties=["Cardiology", "Emergency", "ICU"],
                capacity=500,
                response_time_avg=3.5
            ),
            HospitalEndpoint(
                hospital_id="HOSP_002",
                name="Specialized Cardiovascular Clinic",
                address="Jr. Salud 456, Centro Médico",
                coordinates={"lat": -12.0500, "lng": -77.0400},
                protocol=HospitalProtocol.HL7_FHIR,
                endpoint_url="https://cardio-clinic.health/hl7",
                api_key="cc_key_987654321",
                specialties=["Cardiology", "Cardiac Surgery", "Intensive Care"],
                capacity=200,
                response_time_avg=2.8
            ),
            HospitalEndpoint(
                hospital_id="HOSP_003",
                name="National Medical Center",
                address="Av. Tecnología 789, Zona Médica",
                coordinates={"lat": -12.0400, "lng": -77.0500},
                protocol=HospitalProtocol.HL7_V2,
                endpoint_url="https://centro-nacional.health/api/v2",
                api_key="cmn_key_456789123",
                specialties=["General Medicine", "Emergency", "Pediatrics"],
                capacity=800,
                response_time_avg=4.2
            )
        ]

        for hospital in demo_hospitals:
            self.connected_hospitals[hospital.hospital_id] = hospital

        logger.info(f"{len(demo_hospitals)} demo hospitals configured")

    async def setup_database(self):
        """PostgreSQL database configuration"""
        try:
            self.db_pool = await asyncpg.create_pool(
                host="localhost",
                port=5432,
                user="rmhealth_user",
                password="rmhealth_secure_2025",
                database="rmhealth_hospital_db",
                min_size=10,
                max_size=50
            )

            # Create tables if they don't exist
            await self.create_tables()
            logger.info("PostgreSQL database connected successfully")

        except Exception as e:
            logger.warning(f"DB not available, using demo mode: {e}")

    async def create_tables(self):
        """Create database tables"""
        async with self.db_pool.acquire() as conn:
            await conn.execute("""
                CREATE TABLE IF NOT EXISTS emergency_transmissions (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    patient_id VARCHAR(100) NOT NULL,
                    hospital_id VARCHAR(50) NOT NULL,
                    emergency_type VARCHAR(100) NOT NULL,
                    priority VARCHAR(20) NOT NULL,
                    vital_signs JSONB NOT NULL,
                    location JSONB NOT NULL,
                    transmission_timestamp TIMESTAMPTZ DEFAULT NOW(),
                    response_timestamp TIMESTAMPTZ,
                    status VARCHAR(50) DEFAULT 'pending',
                    hospital_response JSONB
                )
            """)

            await conn.execute("""
                CREATE INDEX IF NOT EXISTS idx_emergency_patient_id
                ON emergency_transmissions(patient_id)
            """)

            await conn.execute("""
                CREATE INDEX IF NOT EXISTS idx_emergency_hospital_id
                ON emergency_transmissions(hospital_id)
            """)

    async def find_best_hospital(
        self,
        location: Dict[str, float],
        emergency_type: str,
        priority: EmergencyPriority
    ) -> Optional[HospitalEndpoint]:
        """Find the best hospital based on location, specialty and availability"""

        patient_lat = location["lat"]
        patient_lng = location["lng"]

        best_hospital = None
        best_score = float('inf')

        for hospital in self.connected_hospitals.values():
            # Calculate distance
            hospital_lat = hospital.coordinates["lat"]
            hospital_lng = hospital.coordinates["lng"]

            # Simple distance calculation (Haversine formula for production)
            distance = ((patient_lat - hospital_lat)**2 +
                        (patient_lng - hospital_lng)**2)**0.5

            # Check if hospital has appropriate specialty
            specialty_match = False
            if emergency_type.lower() in [
                    "heart_attack", "cardiac_arrest", "arrhythmia"]:
                specialty_match = any("cardio" in spec.lower()
                                      for spec in hospital.specialties)
            else:
                specialty_match = any("emergency" in spec.lower()
                                      for spec in hospital.specialties)

            # Calculate composite score
            score = distance * 10  # Distance factor
            if not specialty_match:
                score += 50  # Penalty for no specialty match
            score += hospital.response_time_avg  # Response time factor

            if score < best_score:
                best_score = score
                best_hospital = hospital

        return best_hospital

    async def generate_fhir_message(
            self, medical_record: MedicalRecord) -> Dict[str, Any]:
        """Generate FHIR R4 compliant message"""

        fhir_message = {"resourceType": "Bundle",
                        "id": str(uuid.uuid4()),
                        "type": "message",
                        "timestamp": medical_record.timestamp.isoformat(),
                        "entry": [{"resource": {"resourceType": "Patient",
                                                "id": medical_record.patient_id,
                                                "identifier": [{"system": "https://rmhealth.com/patient-id",
                                                                "value": medical_record.patient_id}]}},
                                  {"resource": {"resourceType": "Observation",
                                                "id": str(uuid.uuid4()),
                                                "status": "final",
                                                "category": [{"coding": [{"system": "http://terminology.hl7.org/CodeSystem/observation-category",
                                                                          "code": "vital-signs"}]}],
                                                "subject": {"reference": f"Patient/{medical_record.patient_id}"},
                                                "effectiveDateTime": medical_record.timestamp.isoformat(),
                                                "component": []}}]}

        # Add vital signs components
        observation = fhir_message["entry"][1]["resource"]
        for sign_name, sign_value in medical_record.vital_signs.items():
            component = {
                "code": {
                    "coding": [
                        {
                            "system": "http://loinc.org",
                            "code": self._get_loinc_code(sign_name),
                            "display": sign_name.replace("_", " ").title()
                        }
                    ]
                },
                "valueQuantity": {
                    "value": sign_value,
                    "unit": self._get_unit(sign_name)
                }
            }
            observation["component"].append(component)

        return fhir_message

    def _get_loinc_code(self, sign_name: str) -> str:
        """Get LOINC code for vital sign"""
        loinc_mapping = {
            "heart_rate": "8867-4",
            "blood_pressure_systolic": "8480-6",
            "blood_pressure_diastolic": "8462-4",
            "body_temperature": "8310-5",
            "oxygen_saturation": "2708-6"
        }
        return loinc_mapping.get(sign_name, "9999-9")

    def _get_unit(self, sign_name: str) -> str:
        """Get unit for vital sign"""
        unit_mapping = {
            "heart_rate": "beats/min",
            "blood_pressure_systolic": "mm[Hg]",
            "blood_pressure_diastolic": "mm[Hg]",
            "body_temperature": "Cel",
            "oxygen_saturation": "%"
        }
        return unit_mapping.get(sign_name, "")

    async def send_emergency_to_hospital(
        self,
        medical_record: MedicalRecord,
        hospital: HospitalEndpoint
    ) -> Dict[str, Any]:
        """Send emergency alert to specific hospital"""

        try:
            # Generate appropriate message format
            if hospital.protocol == HospitalProtocol.FHIR_R4:
                message = await self.generate_fhir_message(medical_record)
                content_type = "application/fhir+json"
            elif hospital.protocol == HospitalProtocol.HL7_FHIR:
                message = await self.generate_fhir_message(medical_record)
                content_type = "application/fhir+json"
            else:
                # Custom format for other protocols
                message = asdict(medical_record)
                content_type = "application/json"

            # Encrypt sensitive data
            encrypted_message = self.cipher_suite.encrypt(
                json.dumps(message).encode())

            # Send to hospital
            async with aiohttp.ClientSession() as session:
                headers = {
                    "Authorization": f"Bearer {hospital.api_key}",
                    "Content-Type": content_type,
                    "X-RmHealth-Version": "2.0.0",
                    "X-Emergency-Priority": medical_record.priority.value
                }

                async with session.post(
                    hospital.endpoint_url,
                    data=encrypted_message,
                    headers=headers,
                    timeout=aiohttp.ClientTimeout(total=30)
                ) as response:

                    if response.status == 200:
                        hospital_response = await response.json()

                        # Log successful transmission
                        if self.db_pool:
                            await self.log_transmission(medical_record, hospital, "sent", hospital_response)

                        logger.info(
                            f"Emergency sent successfully to {
                                hospital.name}")
                        return {
                            "status": "success",
                            "hospital": hospital.name,
                            "transmission_id": hospital_response.get("id"),
                            "estimated_response_time": hospital.response_time_avg}
                    else:
                        error_msg = f"Hospital returned status {
                            response.status}"
                        logger.error(
                            f"Failed to send to {
                                hospital.name}: {error_msg}")
                        return {
                            "status": "failed",
                            "hospital": hospital.name,
                            "error": error_msg
                        }

        except Exception as e:
            error_msg = f"Exception sending to {hospital.name}: {str(e)}"
            logger.error(error_msg)
            return {
                "status": "error",
                "hospital": hospital.name,
                "error": error_msg
            }

    async def log_transmission(
        self,
        medical_record: MedicalRecord,
        hospital: HospitalEndpoint,
        status: str,
        response: Dict[str, Any] = None
    ):
        """Log emergency transmission to database"""

        if not self.db_pool:
            return

        async with self.db_pool.acquire() as conn:
            await conn.execute("""
                INSERT INTO emergency_transmissions
                (patient_id, hospital_id, emergency_type, priority, vital_signs, location, status, hospital_response)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            """,
                               medical_record.patient_id,
                               hospital.hospital_id,
                               medical_record.emergency_type,
                               medical_record.priority.value,
                               json.dumps(medical_record.vital_signs),
                               json.dumps(medical_record.location),
                               status,
                               json.dumps(response) if response else None
                               )

    async def process_emergency(
            self, medical_record: MedicalRecord) -> Dict[str, Any]:
        """Process emergency and send to best hospital"""

        # Find best hospital
        best_hospital = await self.find_best_hospital(
            medical_record.location,
            medical_record.emergency_type,
            medical_record.priority
        )

        if not best_hospital:
            return {
                "status": "error",
                "message": "No suitable hospital found"
            }

        # Send emergency
        result = await self.send_emergency_to_hospital(medical_record, best_hospital)

        # Store in active emergencies
        emergency_id = str(uuid.uuid4())
        self.active_emergencies[emergency_id] = medical_record

        result["emergency_id"] = emergency_id
        return result


# FastAPI endpoints
integrator = RmHealthHospitalIntegrator()


@integrator.app.post("/emergency/send")
async def send_emergency(medical_record: dict):
    """Send emergency to hospitals"""

    # Convert dict to MedicalRecord
    record = MedicalRecord(
        patient_id=medical_record["patient_id"],
        timestamp=datetime.datetime.fromisoformat(medical_record["timestamp"]),
        vital_signs=medical_record["vital_signs"],
        emergency_type=medical_record["emergency_type"],
        location=medical_record["location"],
        priority=EmergencyPriority(medical_record["priority"]),
        symptoms=medical_record.get("symptoms", []),
        medical_history=medical_record.get("medical_history", []),
        medications=medical_record.get("medications", []),
        allergies=medical_record.get("allergies", []),
        emergency_contact=medical_record.get("emergency_contact", {}),
        device_data=medical_record.get("device_data", {})
    )

    result = await integrator.process_emergency(record)
    return result


@integrator.app.get("/hospitals/available")
async def get_available_hospitals():
    """Get list of available hospitals"""
    return {
        "hospitals": [
            {
                "id": h.hospital_id,
                "name": h.name,
                "address": h.address,
                "specialties": h.specialties,
                "capacity": h.capacity,
                "avg_response_time": h.response_time_avg
            }
            for h in integrator.connected_hospitals.values()
        ]
    }


@integrator.app.get("/emergency/{emergency_id}/status")
async def get_emergency_status(emergency_id: str):
    """Get emergency status"""
    if emergency_id in integrator.active_emergencies:
        return {
            "status": "active",
            "emergency": asdict(integrator.active_emergencies[emergency_id])
        }
    return {"status": "not_found"}


if __name__ == "__main__":
    import uvicorn

    async def startup():
        await integrator.setup_database()

    integrator.app.add_event_handler("startup", startup)
    uvicorn.run(integrator.app, host="0.0.0.0", port=8001)
