import logging
import uuid
import math
import random
from datetime import datetime
from typing import Dict, Any, List, Optional
from pydantic import BaseModel

logger = logging.getLogger("RMHealth.HospitalGateway")

# Demo patient names for FHIR bundle fallback
DEMO_NAMES = [
    "María González", "Carlos Mendoza", "Rosa Hernández",
    "José Martínez", "Ana Ramírez", "Luis Pérez",
]

class HospitalRoutingInfo(BaseModel):
    hospital_id: str
    name: str
    protocol: str  # FHIR_R4, HL7_V2
    endpoint: str
    eta_minutes: int
    distance_km: float

class HospitalEndpoint(BaseModel):
    hospital_id: str
    name: str
    coordinates: Dict[str, float]
    protocol: str
    endpoint_url: str
    specialties: List[str]
    capacity: int
    response_time_avg: float

# Real hospitals in Acapulco, Guerrero, Mexico
# Coordinates verified via mapcarta.com, redtox.org, and government sources
# NOTE: endpoint_url values are placeholders — real FHIR endpoints require
# signed agreements with each hospital's IT department.
DEMO_HOSPITALS = [
    HospitalEndpoint(
        hospital_id="HOSP_ACA_001",
        name="Hospital General de Acapulco (El Quemado) — IMSS-Bienestar",
        coordinates={"lat": 16.9307, "lng": -99.8205},
        protocol="FHIR_R4",
        endpoint_url="",
        specialties=["Emergencias", "Medicina Interna", "Cirugía General", "UCI"],
        capacity=200,
        response_time_avg=5.0  # Estimated, not verified
    ),
    HospitalEndpoint(
        hospital_id="HOSP_ACA_002",
        name="Hospital General Regional No. 1 Vicente Guerrero — IMSS",
        coordinates={"lat": 16.87355, "lng": -99.89017},
        protocol="FHIR_R4",
        endpoint_url="",
        specialties=["Cardiología", "Emergencias", "Medicina Interna", "UCI"],
        capacity=300,
        response_time_avg=4.5  # Estimated, not verified
    ),
    HospitalEndpoint(
        hospital_id="HOSP_ACA_003",
        name="Hospital Papagayo (Privado)",
        coordinates={"lat": 16.8587, "lng": -99.8824},
        protocol="HL7_FHIR",
        endpoint_url="",
        specialties=["Emergencias 24h", "Cardiología", "Cirugía General", "Pediatría"],
        capacity=80,
        response_time_avg=3.0  # Private hospitals typically faster
    ),
    HospitalEndpoint(
        hospital_id="HOSP_ACA_004",
        name="Hospital Santa Lucía (Privado)",
        coordinates={"lat": 16.8578, "lng": -99.8933},
        protocol="HL7_FHIR",
        endpoint_url="",
        specialties=["Emergencias 24h", "Medicina General", "Cirugía"],
        capacity=60,
        response_time_avg=2.8  # Private, smaller, faster response
    ),
    HospitalEndpoint(
        hospital_id="HOSP_ACA_005",
        name="Hospital General ISSSTE Acapulco",
        coordinates={"lat": 16.8690, "lng": -99.8870},
        protocol="FHIR_R4",
        endpoint_url="",
        specialties=["Emergencias", "Medicina Interna", "Ginecología"],
        capacity=150,
        response_time_avg=5.5  # Estimated, not verified
    ),
]

class HospitalGateway:
    """
    🏥 Pasarela de Integración Hospitalaria
    Maneja el enrutamiento inteligente por GPS y la interoperabilidad FHIR/HL7.
    """

    @staticmethod
    def calculate_distance(coord1: Dict[str, float], coord2: Dict[str, float]) -> float:
        """Calcula distancia entre coordenadas usando fórmula de Haversine (km)"""
        R = 6371  # Radio de la Tierra en km
        lat1, lon1 = coord1.get("lat", 0), coord1.get("lng", 0)
        lat2, lon2 = coord2.get("lat", 0), coord2.get("lng", 0)

        dlat = math.radians(lat2 - lat1)
        dlon = math.radians(lon2 - lon1)

        a = (math.sin(dlat / 2) * math.sin(dlat / 2) +
             math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) *
             math.sin(dlon / 2) * math.sin(dlon / 2))

        c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
        return R * c

    @classmethod
    def get_routing_decission(cls, priority: str, lat: float, lon: float, emergency_type: str = "Emergencias") -> HospitalRoutingInfo:
        """
        🎯 Algoritmo de Enrutamiento Inteligente
        Encuentra el hospital óptimo basado en GPS, especialidad, capacidad y tiempo de respuesta.
        """
        patient_location = {"lat": lat, "lng": lon}
        best_hospital = None
        best_score = -1
        best_distance = 0.0

        for hospital in DEMO_HOSPITALS:
            # Factor 1: Distancia
            distance = cls.calculate_distance(patient_location, hospital.coordinates)
            distance_score = max(0, 100 - (distance * 10))  # Penaliza distancia

            # Factor 2: Especialidad
            specialty_score = 0
            if emergency_type.lower() in [s.lower() for s in hospital.specialties]:
                specialty_score = 50
            elif "emergencias" in [s.lower() for s in hospital.specialties]:
                specialty_score = 30

            # Factor 3: Capacidad y Tiempo
            capacity_score = min(30, hospital.capacity / 10)
            response_score = max(0, 20 - hospital.response_time_avg)

            # Score total
            total_score = distance_score + specialty_score + capacity_score + response_score

            if total_score > best_score:
                best_score = total_score
                best_hospital = hospital
                best_distance = distance

        if not best_hospital:
            # Fallback de emergencia
            return HospitalRoutingInfo(
                hospital_id="HOSP_DEFAULT", name="Hospital de Emergencia Base",
                protocol="FHIR_R4", endpoint="https://default-hospital.health/fhir",
                eta_minutes=15, distance_km=0.0
            )

        logger.info(f"🎯 Enrutamiento Óptimo: {best_hospital.name} (Distancia: {best_distance:.2f}km, Score: {best_score:.1f})")
        
        # Calcular ETA aproximado (asumiendo velocidad promedio de ambulancia 40km/h en ciudad + tiempo de respuesta)
        eta = int((best_distance / 40.0) * 60) + int(best_hospital.response_time_avg)

        return HospitalRoutingInfo(
            hospital_id=best_hospital.hospital_id,
            name=best_hospital.name,
            protocol=best_hospital.protocol,
            endpoint=best_hospital.endpoint_url,
            eta_minutes=eta,
            distance_km=round(best_distance, 2)
        )

    @staticmethod
    def generate_fhir_r4_bundle(patient_id: str, analysis: Dict[str, Any], vitals: Dict[str, Any], patient_profile: Dict[str, Any]) -> Dict[str, Any]:
        """Generates a compliant FHIR R4 Bundle with FULL clinical profile."""
        bundle_id = str(uuid.uuid4())
        timestamp = datetime.now().isoformat()
        
        # Derived clinical data
        age = patient_profile.get("edad", 0)
        birth_year = datetime.now().year - age
        
        bundle = {
            "resourceType": "Bundle",
            "id": bundle_id,
            "type": "message",
            "timestamp": timestamp,
            "entry": [
                {
                    "fullUrl": f"urn:uuid:{str(uuid.uuid4())}",
                    "resource": {
                        "resourceType": "MessageHeader",
                        "eventCoding": {
                            "system": "http://terminology.hl7.org/CodeSystem/v2-0003",
                            "code": "ADT^A01",
                            "display": "Emergency Patient Admission"
                        },
                        "source": {"name": "RMHealth Vital Guardian", "endpoint": "https://api.rmhealth.ai/fhir"}
                    }
                },
                {
                    "fullUrl": f"Patient/{patient_id}",
                    "resource": {
                        "resourceType": "Patient",
                        "id": patient_id,
                        "active": True,
                        "name": [{"text": patient_profile.get("nombre_completo", "Unknown")}],
                        "birthDate": f"{birth_year}-01-01",
                        "extension": [
                            {
                                "url": "http://hl7.org/fhir/StructureDefinition/patient-bloodType",
                                "valueString": patient_profile.get("tipo_sangre", "Unknown")
                            }
                        ]
                    }
                },
                {
                    "fullUrl": "urn:uuid:allergies",
                    "resource": {
                        "resourceType": "List",
                        "status": "current",
                        "mode": "working",
                        "title": "Clinical Alerts & Allergies",
                        "subject": {"reference": f"Patient/{patient_id}"},
                        "note": [{"text": f"Allergies: {', '.join(patient_profile.get('alergias', [])) or 'None reported'}"}]
                    }
                },
                {
                    "fullUrl": f"urn:uuid:{str(uuid.uuid4())}",
                    "resource": {
                        "resourceType": "Observation",
                        "status": "final",
                        "code": {"coding": [{"system": "http://loinc.org", "code": "8867-4", "display": "Heart rate"}]},
                        "subject": {"reference": f"Patient/{patient_id}"},
                        "valueQuantity": {"value": vitals.get("ritmo_cardiaco"), "unit": "bpm"}
                    }
                }
            ]
        }
        return bundle

    @staticmethod
    def generate_hl7_v2_message(patient_id: str, vitals: Dict[str, Any]) -> str:
        """
        📨 Generar mensaje HL7 v2.x estándar.
        Formato vital para sistemas hospitalarios legacy (antiguos).
        """
        timestamp = datetime.now().strftime("%Y%m%d%H%M%S")
        msg_id = str(uuid.uuid4().hex[:10])

        # MSH - Message Header
        msh = f"MSH|^~\\&|RMHealth|VitalGuardian||Hospital|{timestamp}||ADT^A01|{msg_id}|P|2.5"

        # PID - Patient Identification
        pid = f"PID|1||{patient_id}^^^RMHealth||||||M|||||||||||||||||||{timestamp}"

        # PV1 - Patient Visit
        pv1 = f"PV1|1|E|ER^001^01||||||||||||||||{patient_id}|||||||||||||||||||||||||{timestamp}"

        # OBX - Observation/Result segments
        obx_segments = []
        if "ritmo_cardiaco" in vitals:
            obx1 = f"OBX|1|NM|8867-4^Heart Rate^LN||{vitals['ritmo_cardiaco']}|beats/min|60-100|N|||F"
            obx_segments.append(obx1)

        if "presion_sistolica" in vitals:
            obx2 = f"OBX|2|NM|8480-6^Systolic BP^LN||{vitals['presion_sistolica']}|mmHg|90-140|N|||F"
            obx_segments.append(obx2)

        hl7_message = "\r".join([msh, pid, pv1] + obx_segments)
        logger.info(f"HL7 V2 Message generated successfully for patient {patient_id}")
        
        return hl7_message
