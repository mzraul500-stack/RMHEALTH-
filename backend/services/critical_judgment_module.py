# -*- coding: utf-8 -*-
"""
RMHealth Critical Judgment Module (CJM)
======================================

Production-oriented risk analysis layer for RMHealth.

Purpose:
    This module evaluates vital-sign patterns, short-term trends, user context,
    and fall/inactivity signals to generate preventive observations and an
    escalation recommendation.

Regulatory/Safety stance:
    - This module does not diagnose, treat, cure, or replace professional care.
    - Outputs are preventive observations and escalation support signals.
    - Final medical judgment belongs to qualified healthcare professionals.

Integration role:
    MedicalEngine -> baseline severity
    CriticalJudgmentModule -> contextual/trend risk adjustment
    Explainer/Jidoka -> user-facing explanation without changing severity

Author: Raul Morales Zepeda / RMHealth
Production refactor: critical_judgment_module.py
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from enum import Enum
from typing import Any, Dict, Iterable, List, Optional, Tuple
import logging
import math

logger = logging.getLogger(__name__)


class Severity(str, Enum):
    """Canonical RMHealth severity scale."""

    NORMAL = "NORMAL"
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"
    CRITICAL = "CRITICAL"


class EscalationAction(str, Enum):
    """Recommended downstream action. This is not a medical diagnosis."""

    NONE = "NONE"
    MONITOR = "MONITOR"
    NOTIFY_CONTACT = "NOTIFY_CONTACT"
    REQUEST_CONFIRMATION = "REQUEST_CONFIRMATION"
    ESCALATE_IF_CONFIRMED = "ESCALATE_IF_CONFIRMED"
    AUTO_ESCALATION_CANDIDATE = "AUTO_ESCALATION_CANDIDATE"


@dataclass(frozen=True)
class VitalReading:
    """Normalized vital-sign reading."""

    heart_rate_bpm: Optional[int] = None
    spo2_percent: Optional[int] = None
    systolic_bp: Optional[int] = None
    diastolic_bp: Optional[int] = None
    glucose_mg_dl: Optional[float] = None
    fall_detected: bool = False
    movement_after_fall: Optional[bool] = None
    source: Optional[str] = None
    measured_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))


@dataclass(frozen=True)
class MedicalProfile:
    """User context used as a risk modifier, not as a diagnosis engine."""

    age: Optional[int] = None
    has_diabetes: bool = False
    has_hypertension: bool = False
    has_cardiac_history: bool = False
    has_arrhythmia_history: bool = False
    medications: Tuple[str, ...] = ()
    allergies: Tuple[str, ...] = ()


@dataclass(frozen=True)
class RiskFactor:
    """Auditable explanation for each risk contribution."""

    rule_id: str
    label: str
    points: float
    severity_hint: Severity
    evidence: Dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class CriticalJudgmentResult:
    """Stable result contract for backend/API integration."""

    severity: Severity
    risk_score: float
    escalation_action: EscalationAction
    preventive_observation: str
    risk_factors: Tuple[RiskFactor, ...]
    missing_fields: Tuple[str, ...]
    confidence: float
    evaluated_at: datetime
    is_non_diagnostic: bool = True

    def to_dict(self) -> Dict[str, Any]:
        """Serialize result for API responses, logs, or persistence."""
        return {
            "severity": self.severity.value,
            "risk_score": round(self.risk_score, 2),
            "escalation_action": self.escalation_action.value,
            "preventive_observation": self.preventive_observation,
            "risk_factors": [
                {
                    "rule_id": factor.rule_id,
                    "label": factor.label,
                    "points": round(factor.points, 2),
                    "severity_hint": factor.severity_hint.value,
                    "evidence": factor.evidence,
                }
                for factor in self.risk_factors
            ],
            "missing_fields": list(self.missing_fields),
            "confidence": round(self.confidence, 2),
            "evaluated_at": self.evaluated_at.isoformat(),
            "is_non_diagnostic": self.is_non_diagnostic,
        }


@dataclass(frozen=True)
class CJMConfig:
    """Centralized thresholds for easier clinical review and versioning."""

    low_threshold: float = 20.0
    medium_threshold: float = 50.0
    high_threshold: float = 70.0
    critical_threshold: float = 90.0
    trend_window_minutes: int = 120
    min_trend_samples: int = 5
    max_score: float = 100.0


class CriticalJudgmentModule:
    """
    Production-oriented contextual risk layer for RMHealth.

    This class is deliberately stateless:
        - No local SQLite dependency.
        - No direct hospital notification.
        - No printing.
        - No hidden side effects.

    The backend should provide current readings, recent readings, and profile
    context from its own persistence layer.
    """

    VERSION = "CJM-1.0.0-pro"

    def __init__(self, config: Optional[CJMConfig] = None) -> None:
        self.config = config or CJMConfig()

    def evaluate(
        self,
        current: Dict[str, Any] | VitalReading,
        profile: Optional[MedicalProfile | Dict[str, Any]] = None,
        recent_readings: Optional[Iterable[Dict[str, Any] | VitalReading]] = None,
        evaluated_at: Optional[datetime] = None,
    ) -> CriticalJudgmentResult:
        """
        Evaluate current vital signs with context and short-term trends.

        Args:
            current: Current reading as VitalReading or dict. Spanish and English
                keys are accepted for easier migration from earlier prototypes.
            profile: Optional user medical context.
            recent_readings: Optional historical readings. The caller should pass
                readings from the last 2 hours, or a wider set that this module
                can filter by timestamp.
            evaluated_at: Optional deterministic timestamp for tests.

        Returns:
            CriticalJudgmentResult with severity, score, escalation action,
            preventive observation, risk factors, missing fields and confidence.
        """
        now = self._ensure_aware_datetime(evaluated_at or datetime.now(timezone.utc))
        reading = self._normalize_reading(current, fallback_time=now)
        user_profile = self._normalize_profile(profile)
        history = self._normalize_history(recent_readings or (), now=now)

        missing_fields = self._detect_missing_fields(reading)
        factors: List[RiskFactor] = []

        factors.extend(self._evaluate_point_in_time_vitals(reading))
        factors.extend(self._evaluate_compound_patterns(reading))
        factors.extend(self._evaluate_fall_context(reading))
        factors.extend(self._evaluate_trends(history, now=now))

        raw_score = sum(factor.points for factor in factors)
        contextual_multiplier, context_factors = self._evaluate_profile_context(user_profile)
        factors.extend(context_factors)

        adjusted_score = raw_score * contextual_multiplier
        risk_score = min(max(adjusted_score, 0.0), self.config.max_score)

        severity = self._score_to_severity(risk_score, factors)
        escalation_action = self._severity_to_action(severity, risk_score, factors)
        confidence = self._estimate_confidence(reading, history, missing_fields)
        preventive_observation = self._build_preventive_observation(
            severity=severity,
            risk_score=risk_score,
            factors=factors,
            missing_fields=missing_fields,
        )

        return CriticalJudgmentResult(
            severity=severity,
            risk_score=risk_score,
            escalation_action=escalation_action,
            preventive_observation=preventive_observation,
            risk_factors=tuple(factors),
            missing_fields=tuple(missing_fields),
            confidence=confidence,
            evaluated_at=now,
        )

    def _evaluate_point_in_time_vitals(self, reading: VitalReading) -> List[RiskFactor]:
        factors: List[RiskFactor] = []

        hr = reading.heart_rate_bpm
        if hr is not None:
            if hr >= 130:
                factors.append(
                    RiskFactor(
                        "HR_TACHYCARDIA_SEVERE",
                        "Markedly elevated heart rate pattern",
                        35,
                        Severity.HIGH,
                        {"heart_rate_bpm": hr},
                    )
                )
            elif hr > 120:
                factors.append(
                    RiskFactor(
                        "HR_TACHYCARDIA_HIGH",
                        "Elevated heart rate pattern",
                        30,
                        Severity.HIGH,
                        {"heart_rate_bpm": hr},
                    )
                )
            elif hr > 100:
                factors.append(
                    RiskFactor(
                        "HR_TACHYCARDIA_MODERATE",
                        "Moderately elevated heart rate pattern",
                        15,
                        Severity.MEDIUM,
                        {"heart_rate_bpm": hr},
                    )
                )
            elif hr < 45:
                factors.append(
                    RiskFactor(
                        "HR_BRADYCARDIA_MARKED",
                        "Markedly low heart rate pattern",
                        40,
                        Severity.HIGH,
                        {"heart_rate_bpm": hr},
                    )
                )
            elif hr < 50:
                factors.append(
                    RiskFactor(
                        "HR_BRADYCARDIA_HIGH",
                        "Low heart rate pattern",
                        35,
                        Severity.HIGH,
                        {"heart_rate_bpm": hr},
                    )
                )
            elif hr < 60:
                factors.append(
                    RiskFactor(
                        "HR_BRADYCARDIA_MILD",
                        "Mildly low heart rate pattern",
                        10,
                        Severity.LOW,
                        {"heart_rate_bpm": hr},
                    )
                )

        spo2 = reading.spo2_percent
        if spo2 is not None:
            if spo2 < 85:
                factors.append(
                    RiskFactor(
                        "SPO2_CRITICAL_LOW",
                        "Very low oxygen saturation pattern",
                        45,
                        Severity.CRITICAL,
                        {"spo2_percent": spo2},
                    )
                )
            elif spo2 < 90:
                factors.append(
                    RiskFactor(
                        "SPO2_HIGH_LOW",
                        "Low oxygen saturation pattern",
                        30,
                        Severity.HIGH,
                        {"spo2_percent": spo2},
                    )
                )
            elif spo2 < 94:
                factors.append(
                    RiskFactor(
                        "SPO2_MILD_LOW",
                        "Mildly reduced oxygen saturation pattern",
                        10,
                        Severity.LOW,
                        {"spo2_percent": spo2},
                    )
                )

        systolic = reading.systolic_bp
        diastolic = reading.diastolic_bp
        if systolic is not None or diastolic is not None:
            if self._gte(systolic, 180) or self._gte(diastolic, 120):
                factors.append(
                    RiskFactor(
                        "BP_HYPERTENSIVE_CRISIS_PATTERN",
                        "Very elevated blood pressure pattern",
                        40,
                        Severity.HIGH,
                        {"systolic_bp": systolic, "diastolic_bp": diastolic},
                    )
                )
            elif self._gte(systolic, 160) or self._gte(diastolic, 100):
                factors.append(
                    RiskFactor(
                        "BP_SEVERE_HYPERTENSION_PATTERN",
                        "Elevated blood pressure pattern",
                        25,
                        Severity.MEDIUM,
                        {"systolic_bp": systolic, "diastolic_bp": diastolic},
                    )
                )
            elif self._lt(systolic, 90) or self._lt(diastolic, 60):
                factors.append(
                    RiskFactor(
                        "BP_HYPOTENSION_PATTERN",
                        "Low blood pressure pattern",
                        25,
                        Severity.MEDIUM,
                        {"systolic_bp": systolic, "diastolic_bp": diastolic},
                    )
                )

        return factors

    def _evaluate_compound_patterns(self, reading: VitalReading) -> List[RiskFactor]:
        """Detect multi-signal patterns that single-threshold rules may underweight."""
        factors: List[RiskFactor] = []

        hr = reading.heart_rate_bpm
        spo2 = reading.spo2_percent
        systolic = reading.systolic_bp
        diastolic = reading.diastolic_bp

        triple_low = (
            hr is not None
            and hr < 60
            and spo2 is not None
            and spo2 < 94
            and (self._lt(systolic, 90) or self._lt(diastolic, 60))
        )
        if triple_low:
            factors.append(
                RiskFactor(
                    "PATTERN_TRIPLE_LOW",
                    "Combined low heart rate, low oxygen saturation and low blood pressure pattern",
                    35,
                    Severity.HIGH,
                    {
                        "heart_rate_bpm": hr,
                        "spo2_percent": spo2,
                        "systolic_bp": systolic,
                        "diastolic_bp": diastolic,
                    },
                )
            )

        respiratory_stress_pattern = (
            hr is not None
            and hr > 110
            and spo2 is not None
            and spo2 < 92
        )
        if respiratory_stress_pattern:
            factors.append(
                RiskFactor(
                    "PATTERN_TACHYCARDIA_WITH_LOW_SPO2",
                    "Elevated heart rate with reduced oxygen saturation pattern",
                    25,
                    Severity.HIGH,
                    {"heart_rate_bpm": hr, "spo2_percent": spo2},
                )
            )

        return factors

    def _evaluate_fall_context(self, reading: VitalReading) -> List[RiskFactor]:
        if reading.fall_detected and reading.movement_after_fall is False:
            return [
                RiskFactor(
                    "FALL_NO_MOVEMENT_AFTER_EVENT",
                    "Fall signal with no movement reported afterward",
                    90,
                    Severity.CRITICAL,
                    {
                        "fall_detected": reading.fall_detected,
                        "movement_after_fall": reading.movement_after_fall,
                    },
                )
            ]

        if reading.fall_detected and reading.movement_after_fall is None:
            return [
                RiskFactor(
                    "FALL_WITH_UNKNOWN_RECOVERY_MOVEMENT",
                    "Fall signal with unknown movement status afterward",
                    25,
                    Severity.MEDIUM,
                    {
                        "fall_detected": reading.fall_detected,
                        "movement_after_fall": reading.movement_after_fall,
                    },
                )
            ]

        return []

    def _evaluate_trends(self, history: List[VitalReading], now: datetime) -> List[RiskFactor]:
        window_start = now - timedelta(minutes=self.config.trend_window_minutes)
        readings = [r for r in history if r.measured_at >= window_start]
        readings.sort(key=lambda r: r.measured_at)

        if len(readings) < self.config.min_trend_samples:
            return []

        factors: List[RiskFactor] = []

        hr_delta = self._delta(readings, "heart_rate_bpm")
        if hr_delta is not None:
            if hr_delta > 30:
                factors.append(
                    RiskFactor(
                        "TREND_HEART_RATE_RISING",
                        "Rising heart rate trend over the monitoring window",
                        15,
                        Severity.MEDIUM,
                        {"delta_bpm": hr_delta, "window_minutes": self.config.trend_window_minutes},
                    )
                )
            elif hr_delta < -20:
                factors.append(
                    RiskFactor(
                        "TREND_HEART_RATE_FALLING",
                        "Falling heart rate trend over the monitoring window",
                        10,
                        Severity.LOW,
                        {"delta_bpm": hr_delta, "window_minutes": self.config.trend_window_minutes},
                    )
                )

        spo2_delta = self._delta(readings, "spo2_percent")
        if spo2_delta is not None and spo2_delta < -5:
            factors.append(
                RiskFactor(
                    "TREND_SPO2_FALLING",
                    "Falling oxygen saturation trend over the monitoring window",
                    20,
                    Severity.MEDIUM,
                    {"delta_percent": spo2_delta, "window_minutes": self.config.trend_window_minutes},
                )
            )

        systolic_delta = self._delta(readings, "systolic_bp")
        if systolic_delta is not None and systolic_delta > 40:
            factors.append(
                RiskFactor(
                    "TREND_SYSTOLIC_BP_RISING",
                    "Rising systolic blood pressure trend over the monitoring window",
                    15,
                    Severity.MEDIUM,
                    {"delta_mmhg": systolic_delta, "window_minutes": self.config.trend_window_minutes},
                )
            )

        return factors

    def _evaluate_profile_context(self, profile: Optional[MedicalProfile]) -> Tuple[float, List[RiskFactor]]:
        if profile is None:
            return 1.0, []

        multiplier_percent = 0.0
        context_factors: List[RiskFactor] = []

        if profile.age is not None:
            if profile.age >= 70:
                multiplier_percent += 20
                context_factors.append(
                    RiskFactor(
                        "CTX_AGE_70_PLUS",
                        "Age context increases monitoring priority",
                        0,
                        Severity.LOW,
                        {"age": profile.age, "multiplier_percent": 20},
                    )
                )
            elif profile.age >= 60:
                multiplier_percent += 10
                context_factors.append(
                    RiskFactor(
                        "CTX_AGE_60_PLUS",
                        "Age context mildly increases monitoring priority",
                        0,
                        Severity.LOW,
                        {"age": profile.age, "multiplier_percent": 10},
                    )
                )

        if profile.has_diabetes:
            multiplier_percent += 15
            context_factors.append(
                RiskFactor(
                    "CTX_DIABETES",
                    "Diabetes context increases monitoring priority",
                    0,
                    Severity.LOW,
                    {"multiplier_percent": 15},
                )
            )

        if profile.has_hypertension:
            multiplier_percent += 15
            context_factors.append(
                RiskFactor(
                    "CTX_HYPERTENSION",
                    "Hypertension context increases monitoring priority",
                    0,
                    Severity.LOW,
                    {"multiplier_percent": 15},
                )
            )

        if profile.has_cardiac_history or profile.has_arrhythmia_history:
            multiplier_percent += 25
            context_factors.append(
                RiskFactor(
                    "CTX_CARDIAC_HISTORY",
                    "Cardiac history context increases monitoring priority",
                    0,
                    Severity.MEDIUM,
                    {
                        "has_cardiac_history": profile.has_cardiac_history,
                        "has_arrhythmia_history": profile.has_arrhythmia_history,
                        "multiplier_percent": 25,
                    },
                )
            )

        chronic_count = sum(
            [
                profile.has_diabetes,
                profile.has_hypertension,
                profile.has_cardiac_history,
                profile.has_arrhythmia_history,
            ]
        )
        if chronic_count >= 2:
            multiplier_percent += 10
            context_factors.append(
                RiskFactor(
                    "CTX_MULTIPLE_RISK_CONTEXTS",
                    "Multiple health contexts increase monitoring priority",
                    0,
                    Severity.MEDIUM,
                    {"context_count": chronic_count, "multiplier_percent": 10},
                )
            )

        multiplier = 1.0 + (multiplier_percent / 100.0)
        return multiplier, context_factors

    def _score_to_severity(self, score: float, factors: List[RiskFactor]) -> Severity:
        has_critical_factor = any(f.severity_hint == Severity.CRITICAL for f in factors)
        has_high_compound_pattern = any(
            f.rule_id.startswith("PATTERN_") and f.severity_hint in {Severity.HIGH, Severity.CRITICAL}
            for f in factors
        )

        if score >= self.config.critical_threshold or (has_critical_factor and score >= self.config.high_threshold):
            return Severity.CRITICAL
        if score >= self.config.high_threshold or has_high_compound_pattern:
            return Severity.HIGH
        if score >= self.config.medium_threshold:
            return Severity.MEDIUM
        if score >= self.config.low_threshold:
            return Severity.LOW
        return Severity.NORMAL

    def _severity_to_action(
        self,
        severity: Severity,
        score: float,
        factors: List[RiskFactor],
    ) -> EscalationAction:
        rule_ids = {factor.rule_id for factor in factors}

        if severity == Severity.CRITICAL:
            if "FALL_NO_MOVEMENT_AFTER_EVENT" in rule_ids or score >= self.config.critical_threshold:
                return EscalationAction.AUTO_ESCALATION_CANDIDATE
            return EscalationAction.ESCALATE_IF_CONFIRMED

        if severity == Severity.HIGH:
            return EscalationAction.REQUEST_CONFIRMATION

        if severity == Severity.MEDIUM:
            return EscalationAction.NOTIFY_CONTACT

        if severity == Severity.LOW:
            return EscalationAction.MONITOR

        return EscalationAction.NONE

    def _build_preventive_observation(
        self,
        severity: Severity,
        risk_score: float,
        factors: List[RiskFactor],
        missing_fields: List[str],
    ) -> str:
        if severity == Severity.CRITICAL:
            base = "Critical preventive observation: a high-priority risk pattern was detected. Immediate confirmation and escalation workflow should be considered according to user consent and local protocol."
        elif severity == Severity.HIGH:
            base = "High preventive observation: relevant risk patterns were detected. The system should request user confirmation and prepare escalation if the situation persists or is confirmed."
        elif severity == Severity.MEDIUM:
            base = "Medium preventive observation: abnormal or contextual risk patterns were detected. Increased monitoring and contact notification may be appropriate."
        elif severity == Severity.LOW:
            base = "Low preventive observation: mild deviations were detected. Continue monitoring and compare with the user baseline."
        else:
            base = "No relevant risk pattern detected with the available data. Continue routine monitoring."

        primary_rules = [factor.rule_id for factor in factors if factor.points > 0][:3]
        details = f" Score: {risk_score:.1f}/100."
        if primary_rules:
            details += f" Primary rules: {', '.join(primary_rules)}."
        if missing_fields:
            details += f" Missing fields: {', '.join(missing_fields)}."
        details += " This is not a diagnosis."
        return base + details

    def _estimate_confidence(
        self,
        reading: VitalReading,
        history: List[VitalReading],
        missing_fields: List[str],
    ) -> float:
        available_core_fields = 3 - sum(
            [
                reading.heart_rate_bpm is None,
                reading.spo2_percent is None,
                reading.systolic_bp is None and reading.diastolic_bp is None,
            ]
        )
        field_component = available_core_fields / 3.0
        history_component = min(len(history) / max(self.config.min_trend_samples, 1), 1.0)
        missing_penalty = min(len(missing_fields) * 0.08, 0.35)

        confidence = (field_component * 0.75) + (history_component * 0.25) - missing_penalty
        return min(max(confidence, 0.0), 1.0)

    def _normalize_reading(self, raw: Dict[str, Any] | VitalReading, fallback_time: datetime) -> VitalReading:
        if isinstance(raw, VitalReading):
            return raw

        measured_at = self._parse_datetime(
            self._first(raw, "measured_at", "timestamp", "created_at"),
            fallback=fallback_time,
        )

        return VitalReading(
            heart_rate_bpm=self._to_int(self._first(raw, "heart_rate_bpm", "ritmo_cardiaco", "heartRate", "hr")),
            spo2_percent=self._to_int(self._first(raw, "spo2_percent", "spo2", "oxygen_saturation")),
            systolic_bp=self._to_int(self._first(raw, "systolic_bp", "presion_sistolica", "systolic", "bp_systolic")),
            diastolic_bp=self._to_int(self._first(raw, "diastolic_bp", "presion_diastolica", "diastolic", "bp_diastolic")),
            glucose_mg_dl=self._to_float(self._first(raw, "glucose_mg_dl", "glucosa_estimada", "glucose")),
            fall_detected=self._to_bool(self._first(raw, "fall_detected", "caida_detectada"), default=False),
            movement_after_fall=self._to_optional_bool(
                self._first(raw, "movement_after_fall", "movimiento_posterior", "movementAfterFall")
            ),
            source=self._first(raw, "source", "device_source", "data_source"),
            measured_at=measured_at,
        )

    def _normalize_profile(self, raw: Optional[MedicalProfile | Dict[str, Any]]) -> Optional[MedicalProfile]:
        if raw is None:
            return None
        if isinstance(raw, MedicalProfile):
            return raw

        conditions = [str(item).lower() for item in raw.get("conditions", []) or raw.get("historial_medico", []) or []]

        return MedicalProfile(
            age=self._to_int(self._first(raw, "age", "edad")),
            has_diabetes=self._to_bool(self._first(raw, "has_diabetes", "diabetico"), default=False)
            or any("diabetes" in c or "diabet" in c for c in conditions),
            has_hypertension=self._to_bool(self._first(raw, "has_hypertension", "hipertenso"), default=False)
            or any("hipertension" in c or "hypertension" in c for c in conditions),
            has_cardiac_history=self._to_bool(self._first(raw, "has_cardiac_history", "cardiopata"), default=False)
            or any("cardiac" in c or "cardiaco" in c or "cardiopat" in c for c in conditions),
            has_arrhythmia_history=self._to_bool(self._first(raw, "has_arrhythmia_history", "arritmia"), default=False)
            or any("arrhythmia" in c or "arritmia" in c for c in conditions),
            medications=tuple(raw.get("medications", ()) or raw.get("medicamentos", ()) or ()),
            allergies=tuple(raw.get("allergies", ()) or raw.get("alergias", ()) or ()),
        )

    def _normalize_history(self, raw_items: Iterable[Dict[str, Any] | VitalReading], now: datetime) -> List[VitalReading]:
        normalized: List[VitalReading] = []
        for item in raw_items:
            try:
                normalized.append(self._normalize_reading(item, fallback_time=now))
            except Exception as exc:  # Defensive: one malformed reading should not break evaluation.
                logger.warning("Skipping malformed historical reading: %s", exc)
        return normalized

    @staticmethod
    def _detect_missing_fields(reading: VitalReading) -> List[str]:
        missing = []
        if reading.heart_rate_bpm is None:
            missing.append("heart_rate_bpm")
        if reading.spo2_percent is None:
            missing.append("spo2_percent")
        if reading.systolic_bp is None:
            missing.append("systolic_bp")
        if reading.diastolic_bp is None:
            missing.append("diastolic_bp")
        return missing

    @staticmethod
    def _delta(readings: List[VitalReading], attr_name: str) -> Optional[float]:
        values = [getattr(reading, attr_name) for reading in readings]
        clean_values = [float(value) for value in values if value is not None and not math.isnan(float(value))]
        if len(clean_values) < 2:
            return None
        return clean_values[-1] - clean_values[0]

    @staticmethod
    def _first(source: Dict[str, Any], *keys: str) -> Any:
        for key in keys:
            if key in source and source[key] is not None:
                return source[key]
        return None

    @staticmethod
    def _to_int(value: Any) -> Optional[int]:
        if value is None or value == "":
            return None
        try:
            return int(float(value))
        except (TypeError, ValueError):
            return None

    @staticmethod
    def _to_float(value: Any) -> Optional[float]:
        if value is None or value == "":
            return None
        try:
            return float(value)
        except (TypeError, ValueError):
            return None

    @staticmethod
    def _to_bool(value: Any, default: bool = False) -> bool:
        parsed = CriticalJudgmentModule._to_optional_bool(value)
        return default if parsed is None else parsed

    @staticmethod
    def _to_optional_bool(value: Any) -> Optional[bool]:
        if value is None or value == "":
            return None
        if isinstance(value, bool):
            return value
        if isinstance(value, (int, float)):
            return bool(value)
        if isinstance(value, str):
            normalized = value.strip().lower()
            if normalized in {"true", "1", "yes", "y", "si", "sí"}:
                return True
            if normalized in {"false", "0", "no", "n"}:
                return False
        return None

    @staticmethod
    def _parse_datetime(value: Any, fallback: datetime) -> datetime:
        if isinstance(value, datetime):
            return CriticalJudgmentModule._ensure_aware_datetime(value)
        if isinstance(value, str) and value.strip():
            try:
                parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
                return CriticalJudgmentModule._ensure_aware_datetime(parsed)
            except ValueError:
                return fallback
        return fallback

    @staticmethod
    def _ensure_aware_datetime(value: datetime) -> datetime:
        if value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc)
        return value

    @staticmethod
    def _gte(value: Optional[int], threshold: int) -> bool:
        return value is not None and value >= threshold

    @staticmethod
    def _lt(value: Optional[int], threshold: int) -> bool:
        return value is not None and value < threshold


# Example for tests or manual local validation only. Do not run in production paths.
def _example_usage() -> Dict[str, Any]:
    module = CriticalJudgmentModule()

    current = {
        "heart_rate_bpm": 135,
        "spo2_percent": 88,
        "systolic_bp": 165,
        "diastolic_bp": 105,
        "fall_detected": False,
        "movement_after_fall": True,
        "source": "health_connect",
    }

    profile = {
        "age": 64,
        "conditions": ["hypertension"],
    }

    result = module.evaluate(current=current, profile=profile, recent_readings=[])
    return result.to_dict()
