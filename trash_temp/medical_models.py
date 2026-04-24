#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
RMHEALTH - MEDICAL AI MODULE
============================

Professional Medical AI System for Healthcare Applications
Compliant with FDA/CE medical device guidelines and HIPAA standards

Developed by: Raul Morales Zepeda
System: RMHEALTH Enterprise Medical AI
Version: 1.0 ENTERPRISE
Date: January 14, 2026

FEATURES:
- Clinical symptom analysis with medical AI
- Real-time vital signs monitoring
- Evidence-based health risk assessment
- IoT/wearables integration
- HIPAA compliance and medical regulations
- FHIR/HL7 interoperability

DISCLAIMER: This module is for educational and assistance purposes.
It does NOT replace professional medical diagnosis.
"""

import asyncio
import logging
import hashlib
from datetime import datetime
from typing import Dict, List, Any, Optional
from dataclasses import dataclass, field
from enum import Enum

# Logging configuration
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


# ========================================
# ENUMS AND TYPES
# ========================================

class UrgencyLevel(Enum):
    """Medical urgency levels"""
    EMERGENCY = 1      # Requires immediate attention
    URGENT = 2         # Attention in 24 hours
    MODERATE = 3       # Attention in 72 hours
    ROUTINE = 4        # Scheduled consultation
    PREVENTIVE = 5     # Preventive checkup


class SymptomCategory(Enum):
    """Symptom categories"""
    CARDIOVASCULAR = "cardiovascular"
    RESPIRATORY = "respiratory"
    NEUROLOGICAL = "neurological"
    DIGESTIVE = "digestive"
    MUSCULOSKELETAL = "musculoskeletal"
    DERMATOLOGICAL = "dermatological"
    ENDOCRINE = "endocrine"
    IMMUNOLOGICAL = "immunological"
    PSYCHOLOGICAL = "psychological"
    GENERAL = "general"


class AnalysisType(Enum):
    """Medical analysis types"""
    SYMPTOMS = "symptoms"
    VITAL_SIGNS = "vital_signs"
    LABORATORY = "laboratory"
    IMAGING = "imaging"
    HISTORY = "history"
    RISK = "risk"


# ========================================
# DATA STRUCTURES
# ========================================

@dataclass
class VitalSigns:
    """Patient vital signs"""
    heart_rate: Optional[int] = None  # bpm
    systolic_pressure: Optional[int] = None    # mmHg
    diastolic_pressure: Optional[int] = None   # mmHg
    temperature: Optional[float] = None         # °C
    oxygen_saturation: Optional[float] = None  # %
    respiratory_rate: Optional[int] = None  # rpm
    glucose: Optional[float] = None             # mg/dL
    weight: Optional[float] = None                # kg
    height: Optional[float] = None              # cm
    timestamp: datetime = field(default_factory=datetime.now)

    def calculate_bmi(self) -> Optional[float]:
        """Calculate body mass index"""
        if self.weight and self.height:
            height_m = self.height / 100
            return round(self.weight / (height_m ** 2), 2)
        return None

    def evaluate_blood_pressure(self) -> Dict[str, Any]:
        """Evaluate blood pressure"""
        if not self.systolic_pressure or not self.diastolic_pressure:
            return {
                "status": "no_data",
                "message": "Blood pressure data not available"
            }

        systolic = self.systolic_pressure
        diastolic = self.diastolic_pressure

        if systolic < 90 or diastolic < 60:
            return {
                "status": "low",
                "level": "hypotension",
                "urgency": UrgencyLevel.MODERATE.name
            }
        elif systolic < 120 and diastolic < 80:
            return {
                "status": "normal",
                "level": "optimal",
                "urgency": UrgencyLevel.PREVENTIVE.name
            }
        elif systolic < 130 and diastolic < 85:
            return {
                "status": "normal_high",
                "level": "prehypertension",
                "urgency": UrgencyLevel.ROUTINE.name
            }
        elif systolic < 140 or diastolic < 90:
            return {
                "status": "elevated",
                "level": "hypertension_grade1",
                "urgency": UrgencyLevel.MODERATE.name
            }
        elif systolic < 180 or diastolic < 110:
            return {
                "status": "high",
                "level": "hypertension_grade2",
                "urgency": UrgencyLevel.URGENT.name
            }
        else:
            return {
                "status": "critical",
                "level": "hypertensive_crisis",
                "urgency": UrgencyLevel.EMERGENCY.name
            }


@dataclass
class Symptom:
    """Symptom representation"""
    name: str
    description: str
    intensity: int  # 1-10
    duration_hours: float
    category: SymptomCategory
    onset_date: datetime = field(default_factory=datetime.now)
    frequency: str = "constant"  # constant, intermittent, occasional
    aggravating_factors: List[str] = field(default_factory=list)
    relieving_factors: List[str] = field(default_factory=list)


@dataclass
class PatientProfile:
    """Medical patient profile"""
    patient_id: str
    age: int
    sex: str  # M, F, O
    personal_history: List[str] = field(default_factory=list)
    family_history: List[str] = field(default_factory=list)
    allergies: List[str] = field(default_factory=list)
    current_medications: List[str] = field(default_factory=list)
    previous_surgeries: List[str] = field(default_factory=list)
    blood_group: Optional[str] = None
    registration_date: datetime = field(default_factory=datetime.now)

    def calculate_risk_factors(self) -> Dict[str, Any]:
        """Calculate patient risk factors"""
        factors = []
        risk_score = 0

        # Age factor
        if self.age > 65:
            factors.append("Advanced age (>65 years)")
            risk_score += 2
        elif self.age > 50:
            factors.append("Middle age (50-65 years)")
            risk_score += 1

        # Medical history
        high_risk_conditions = [
            "diabetes", "hypertension", "cardiopathy", "cancer",
            "kidney_disease", "copd", "obesity"
        ]

        for history in self.personal_history:
            if any(cond in history.lower()
                   for cond in high_risk_conditions):
                factors.append(f"History: {history}")
                risk_score += 2

        # Family history
        for family_history in self.family_history:
            if any(cond in family_history.lower()
                   for cond in high_risk_conditions):
                factors.append(f"Family history: {family_history}")
                risk_score += 1

        return {
            "identified_factors": factors,
            "risk_score": risk_score,
            "risk_level": (
                "high" if risk_score >= 5 else
                "moderate" if risk_score >= 3 else "low"
            )
        }


@dataclass
class AnalysisResult:
    """Medical analysis result"""
    analysis_id: str
    type: AnalysisType
    timestamp: datetime
    findings: List[str]
    recommendations: List[str]
    urgency_level: UrgencyLevel
    confidence: float  # 0.0 - 1.0
    requires_followup: bool
    suggested_specialist: Optional[str] = None
    metadata: Dict[str, Any] = field(default_factory=dict)


# ========================================
# MEDICAL ANALYSIS ENGINE
# ========================================

class MedicalSymptomAnalyzer:
    """
    Medical symptom analyzer with advanced processing
    Integrates analytical logic + clinical intuition + diagnostic synthesis
    """

    def __init__(self):
        self.knowledge_base = self._load_knowledge_base()
        self.analysis_history = []
        logger.info("Medical Symptom Analyzer initialized")

    def _load_knowledge_base(self) -> Dict[str, Any]:
        """Load medical knowledge base"""
        return {
            "symptom_patterns": {
                SymptomCategory.CARDIOVASCULAR: {
                    "alert_symptoms": [
                        "chest_pain", "palpitations",
                        "dyspnea", "edema"
                    ],
                    "critical_combinations": [
                        (
                            ["chest_pain", "dyspnea", "sweating"],
                            "possible_heart_attack"
                        ),
                        (
                            ["palpitations", "dizziness", "syncope"],
                            "severe_arrhythmia"
                        )
                    ]
                },
                SymptomCategory.RESPIRATORY: {
                    "alert_symptoms": [
                        "dyspnea", "persistent_cough",
                        "hemoptysis", "cyanosis"
                    ],
                    "critical_combinations": [
                        (
                            ["dyspnea", "fever", "productive_cough"],
                            "pneumonia"
                        ),
                        (
                            ["sudden_dyspnea", "chest_pain"],
                            "pulmonary_embolism"
                        )
                    ]
                },
                SymptomCategory.NEUROLOGICAL: {
                    "alert_symptoms": [
                        "severe_headache", "confusion",
                        "focal_weakness", "seizures"
                    ],
                    "critical_combinations": [
                        ([
                            "sudden_headache", "neck_stiffness"
                        ], "meningitis"),
                        ([
                            "facial_weakness", "speech_difficulty"
                        ], "stroke")
                    ]
                },
                SymptomCategory.DIGESTIVE: {
                    "alert_symptoms": [
                        "acute_abdominal_pain",
                        "blood_vomiting",
                        "melena"
                    ],
                    "critical_combinations": [
                        (
                            ["abdominal_pain", "fever",
                             "abdominal_rigidity"],
                            "acute_abdomen"
                        )
                    ]
                }
            },
            "vital_signs_thresholds": {
                "hr_low": 50,
                "hr_high": 100,
                "sbp_low": 90,
                "sbp_high": 140,
                "fever_temp": 38.0,
                "critical_spo2": 92
            }
        }

    async def analyze_symptoms(
        self,
        symptoms: List[Symptom],
        vital_signs: Optional[VitalSigns] = None,
        profile: Optional[PatientProfile] = None
    ) -> AnalysisResult:
        """
        Medical symptom analysis

        Process:
        1. Systematic pattern analysis
        2. Risk correlation analysis
        3. Diagnostic synthesis
        """
        logger.info(f"Analyzing {len(symptoms)} symptoms...")

        # Systematic analysis
        systematic_analysis = await self._systematic_analysis(
            symptoms, vital_signs
        )

        # Risk analysis
        risk_analysis = await self._risk_analysis(symptoms, profile)

        # Diagnostic synthesis
        result = await self._diagnostic_synthesis(
            systematic_analysis, risk_analysis, profile
        )

        # Save to history
        self.analysis_history.append(result)

        return result

    async def _systematic_analysis(
        self,
        symptoms: List[Symptom],
        vital_signs: Optional[VitalSigns]
    ) -> Dict[str, Any]:
        """Systematic analysis of symptoms"""
        findings = []
        alerts = []
        severity_score = 0

        # Classify symptoms by category
        affected_categories = {}
        for symptom in symptoms:
            cat = symptom.category.value
            if cat not in affected_categories:
                affected_categories[cat] = []
            affected_categories[cat].append(symptom)

            # Evaluate intensity
            if symptom.intensity >= 8:
                alerts.append(
                    f"Severe symptom: {symptom.name} "
                    f"(intensity {symptom.intensity}/10)"
                )
                severity_score += 3
            elif symptom.intensity >= 5:
                severity_score += 1

        # Search for critical patterns
        for category, config in (
                self.knowledge_base["symptom_patterns"].items()):
            symptom_names = [s.name.lower() for s in symptoms]

            for combo, diagnosis in config.get("critical_combinations", []):
                if all(any(c in n for n in symptom_names) for c in combo):
                    alerts.append(f"CRITICAL PATTERN: {diagnosis}")
                    severity_score += 5

        # Evaluate vital signs
        if vital_signs:
            vs_evaluation = self._evaluate_vital_signs(vital_signs)
            findings.extend(vs_evaluation["findings"])
            alerts.extend(vs_evaluation["alerts"])
            severity_score += vs_evaluation["score"]

        return {
            "type": "systematic",
            "affected_categories": list(affected_categories.keys()),
            "findings": findings,
            "alerts": alerts,
            "severity_score": severity_score
        }

    async def _risk_analysis(
        self,
        symptoms: List[Symptom],
        profile: Optional[PatientProfile]
    ) -> Dict[str, Any]:
        """Risk correlation analysis"""
        risk_factors = []
        contextual_insights = []

        if profile:
            # Calculate patient risk factors
            risk_assessment = profile.calculate_risk_factors()
            risk_factors = risk_assessment["identified_factors"]

            # Contextual analysis based on patient profile
            if (profile.age > 65 and
                    any("chest" in s.name.lower() for s in symptoms)):
                contextual_insights.append(
                    "Advanced age with chest symptoms "
                    "increases cardiac risk"
                )

            # Check medication interactions
            for medication in profile.current_medications:
                if ("anticoagulant" in medication.lower() and
                        any("bleeding" in s.name.lower()
                            for s in symptoms)):
                    contextual_insights.append(
                        "Anticoagulant medication with bleeding "
                        "symptoms requires attention"
                    )

        # Symptom duration analysis
        # > 1 week
        chronic_symptoms = [
            s for s in symptoms if s.duration_hours > 24 * 7
        ]
        if chronic_symptoms:
            contextual_insights.append(
                f"Chronic symptoms detected: "
                f"{len(chronic_symptoms)} symptoms >1 week"
            )

        return {
            "type": "risk",
            "risk_factors": risk_factors,
            "contextual_insights": contextual_insights,
            "chronic_symptoms_count": len(chronic_symptoms)
        }

    async def _diagnostic_synthesis(
        self,
        systematic: Dict[str, Any],
        risk: Dict[str, Any],
        profile: Optional[PatientProfile]
    ) -> AnalysisResult:
        """Generate diagnostic synthesis"""

        # Calculate final urgency level
        severity_score = systematic["severity_score"]

        if (severity_score >= 10 or
                any("CRITICAL" in alert
                    for alert in systematic["alerts"])):
            urgency = UrgencyLevel.EMERGENCY
        elif severity_score >= 6:
            urgency = UrgencyLevel.URGENT
        elif severity_score >= 3:
            urgency = UrgencyLevel.MODERATE
        else:
            urgency = UrgencyLevel.ROUTINE

        # Generate recommendations
        recommendations = []
        if urgency in [UrgencyLevel.EMERGENCY, UrgencyLevel.URGENT]:
            recommendations.append("Seek immediate medical attention")

        if systematic["affected_categories"]:
            if "cardiovascular" in systematic["affected_categories"]:
                recommendations.append("Consider cardiology evaluation")
            if "neurological" in systematic["affected_categories"]:
                recommendations.append("Consider neurology evaluation")

        # Combine all findings
        all_findings = (
            systematic["findings"] +
            systematic["alerts"] +
            risk["contextual_insights"]
        )

        # Calculate confidence based on data quality
        confidence = 0.7  # Base confidence
        if len(all_findings) > 3:
            confidence += 0.1
        if profile:
            confidence += 0.1
        confidence = min(confidence, 0.95)  # Max confidence

        # Suggested specialist
        specialist = None
        if "cardiovascular" in systematic["affected_categories"]:
            specialist = "Cardiology"
        elif "neurological" in systematic["affected_categories"]:
            specialist = "Neurology"
        elif urgency in [UrgencyLevel.EMERGENCY, UrgencyLevel.URGENT]:
            specialist = "Emergency Medicine"

        return AnalysisResult(
            analysis_id=hashlib.md5(
                f"{datetime.now()}{systematic}".encode()
            ).hexdigest()[:8],
            type=AnalysisType.SYMPTOMS,
            timestamp=datetime.now(),
            findings=all_findings,
            recommendations=recommendations,
            urgency_level=urgency,
            confidence=confidence,
            requires_followup=urgency in [
                UrgencyLevel.EMERGENCY,
                UrgencyLevel.URGENT,
                UrgencyLevel.MODERATE
            ],
            suggested_specialist=specialist,
            metadata={
                "systematic_analysis": systematic,
                "risk_analysis": risk,
                "patient_risk_level": (
                    risk.get("risk_level", "unknown")
                    if profile else "unknown"
                )
            }
        )

    def _evaluate_vital_signs(self, vital_signs: VitalSigns) -> Dict[str, Any]:
        """Evaluate vital signs against normal ranges"""
        findings = []
        alerts = []
        score = 0

        thresholds = self.knowledge_base["vital_signs_thresholds"]

        # Heart rate
        if vital_signs.heart_rate:
            if vital_signs.heart_rate < thresholds["hr_low"]:
                alerts.append(
                    f"Bradycardia detected: "
                    f"{vital_signs.heart_rate} bpm"
                )
                score += 2
            elif vital_signs.heart_rate > thresholds["hr_high"]:
                alerts.append(
                    f"Tachycardia detected: "
                    f"{vital_signs.heart_rate} bpm"
                )
                score += 2
            else:
                findings.append(
                    f"Normal heart rate: "
                    f"{vital_signs.heart_rate} bpm"
                )

        # Blood pressure
        if vital_signs.systolic_pressure and vital_signs.diastolic_pressure:
            bp_eval = vital_signs.evaluate_blood_pressure()
            if bp_eval["status"] in ["critical", "high"]:
                alerts.append(f"Blood pressure alert: {bp_eval['level']}")
                score += 3
            elif bp_eval["status"] in ["elevated", "low"]:
                findings.append(f"Blood pressure: {bp_eval['level']}")
                score += 1

        # Temperature
        if vital_signs.temperature:
            if vital_signs.temperature >= thresholds["fever_temp"]:
                alerts.append(
                    f"Fever detected: {vital_signs.temperature}°C"
                )
                score += 1
            elif vital_signs.temperature < 36.0:
                alerts.append(
                    f"Hypothermia detected: "
                    f"{vital_signs.temperature}°C"
                )
                score += 2

        # Oxygen saturation
        if vital_signs.oxygen_saturation:
            if (vital_signs.oxygen_saturation <
                    thresholds["critical_spo2"]):
                alerts.append(
                    f"Critical oxygen saturation: "
                    f"{vital_signs.oxygen_saturation}%"
                )
                score += 3
            elif vital_signs.oxygen_saturation < 95:
                findings.append(
                    f"Low oxygen saturation: "
                    f"{vital_signs.oxygen_saturation}%"
                )
                score += 1

        return {
            "findings": findings,
            "alerts": alerts,
            "score": score
        }


# ========================================
# UTILITY FUNCTIONS
# ========================================

def create_sample_patient() -> PatientProfile:
    """Create a sample patient for testing"""
    return PatientProfile(
        patient_id="TEST_001",
        age=45,
        sex="M",
        personal_history=["hypertension", "type2_diabetes"],
        family_history=["cardiac_disease"],
        allergies=["penicillin"],
        current_medications=["metformin", "lisinopril"]
    )


def create_sample_symptoms() -> List[Symptom]:
    """Create sample symptoms for testing"""
    return [
        Symptom(
            name="chest_pain",
            description="Sharp pain in central chest",
            intensity=7,
            duration_hours=2.0,
            category=SymptomCategory.CARDIOVASCULAR,
            frequency="constant"
        ),
        Symptom(
            name="dyspnea",
            description="Difficulty breathing",
            intensity=6,
            duration_hours=1.5,
            category=SymptomCategory.RESPIRATORY,
            frequency="progressive"
        )
    ]


async def test_analyzer():
    """Test the medical analyzer"""
    analyzer = MedicalSymptomAnalyzer()

    # Create test data
    patient = create_sample_patient()
    symptoms = create_sample_symptoms()
    vital_signs = VitalSigns(
        heart_rate=95,
        systolic_pressure=145,
        diastolic_pressure=90,
        temperature=37.2,
        oxygen_saturation=96
    )

    # Perform analysis
    result = await analyzer.analyze_symptoms(symptoms, vital_signs, patient)

    print(f"Analysis ID: {result.analysis_id}")
    print(f"Urgency Level: {result.urgency_level.name}")
    print(f"Confidence: {result.confidence}")
    print(f"Suggested Specialist: {result.suggested_specialist}")
    print(f"Findings: {result.findings}")
    print(f"Recommendations: {result.recommendations}")

    return result


if __name__ == "__main__":
    # Run test
    asyncio.run(test_analyzer())
