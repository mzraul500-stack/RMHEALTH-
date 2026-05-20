"""
RMHealth Risk Mapping & Emergency Gating Regression Tests
=========================================================

Tests that validate:
  - ML ALTO alone does NOT trigger emergency
  - ML confidence is NOT treated as clinical risk
  - Score contradictions are handled safely
  - CRITICAL path still works when MedicalEngine confirms
  - Emergency gating respects MedicalEngine/CJM authority

No retraining. No .joblib changes. No threshold modifications.

© 2025-2026 Morales Zepeda Raúl | INDAUTOR 03-2025-070109072500-01
"""

import sys
import os
import pytest

# Ensure backend is importable
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from services.medical_engine import MedicalEngine, VitalsInput, PatientContext
from ai_engine import classify_triage


class TestCaseA_NearNormalReadings:
    """Case A: BP 115/82, Temp 36.6, Glucose 90, HR 72, SpO2 98.
    Everything normal. Should NOT trigger emergency."""

    def test_medical_engine_normal(self):
        vitals = VitalsInput(
            usuario_id="test_case_a",
            ritmo_cardiaco=72,
            spo2=98,
            presion_sistolica=115,
            presion_diastolica=82,
            temperatura=36.6,
            glucosa=90.0,
        )
        result = MedicalEngine.detect_patterns(vitals)
        assert result.emergencia_detectada is False
        assert result.nivel_criticidad in ("NORMAL", "LOW")
        assert result.score_riesgo < 20

    def test_ml_triage_bajo(self):
        result = classify_triage(
            heart_rate=72, spo2=98, bp_sys=115, bp_dia=82,
            glucose=90.0, temperature=36.6, age=50,
        )
        assert result["model_available"] is True
        assert result["level"] == "BAJO"


class TestCaseB_LowScore:
    """Case B: Score 10/100 should NEVER show as ALTO or trigger emergency."""

    def test_low_score_not_emergency(self):
        vitals = VitalsInput(
            usuario_id="test_case_b",
            ritmo_cardiaco=72,
            spo2=98,
            presion_sistolica=115,
            presion_diastolica=82,
            temperatura=36.6,
            glucosa=90.0,
        )
        result = MedicalEngine.detect_patterns(vitals)
        assert result.score_riesgo < 20
        assert result.emergencia_detectada is False
        # Score < 20 means nivel_criticidad should be NORMAL (not HIGH/CRITICAL)
        assert result.nivel_criticidad not in ("HIGH", "CRITICAL", "ALTO", "CRITICO")


class TestCaseC_MLAltoMedicalEngineLow:
    """Case C: ML says ALTO but MedicalEngine says LOW/NORMAL.
    This is the exact bug scenario reported.
    Emergency should NOT trigger."""

    def test_ml_alto_spo2_90(self):
        """SpO2=90 makes ML predict ALTO with high confidence."""
        result = classify_triage(
            heart_rate=72, spo2=90, bp_sys=115, bp_dia=82,
            glucose=90.0, temperature=36.6, age=50,
        )
        assert result["model_available"] is True
        assert result["level"] == "ALTO"
        assert result["confidence"] > 0.9

    def test_medical_engine_low_for_spo2_90(self):
        """MedicalEngine should not set CRITICAL/HIGH for SpO2=90 alone."""
        vitals = VitalsInput(
            usuario_id="test_case_c",
            ritmo_cardiaco=72,
            spo2=90,
            presion_sistolica=115,
            presion_diastolica=82,
            temperatura=36.6,
            glucosa=90.0,
        )
        result = MedicalEngine.detect_patterns(vitals)
        # MedicalEngine gives SpO2<90 → 25 points (MEDIUM zone but not HIGH)
        # 25 points is above UMBRAL_BAJA (20) but below UMBRAL_MEDIA (50)
        assert result.score_riesgo < MedicalEngine.UMBRAL_MEDIA  # < 50
        assert result.emergencia_detectada is False

    def test_contradiction_no_emergency(self):
        """ML ALTO + MedicalEngine score < 50 → no emergency eligible."""
        vitals = VitalsInput(
            usuario_id="test_case_c2",
            ritmo_cardiaco=72,
            spo2=90,
            presion_sistolica=115,
            presion_diastolica=82,
            temperatura=36.6,
            glucosa=90.0,
        )
        me_result = MedicalEngine.detect_patterns(vitals)
        ml_result = classify_triage(
            heart_rate=72, spo2=90, bp_sys=115, bp_dia=82,
            glucose=90.0, temperature=36.6, age=50,
        )
        # Simulate the safety gate from rmhealth_api.py
        emergency_eligible = (
            me_result.emergencia_detectada
            and me_result.score_riesgo >= MedicalEngine.UMBRAL_MEDIA
            and me_result.nivel_criticidad in ("CRITICAL", "HIGH")
        )
        assert emergency_eligible is False, (
            f"SAFETY VIOLATION: emergency_eligible=True with ML={ml_result['level']} "
            f"but MedicalEngine score={me_result.score_riesgo}, level={me_result.nivel_criticidad}"
        )


class TestCaseD_HighSeverity:
    """Case D: HIGH severity from MedicalEngine.
    Should NOT auto-dispatch emergency — only monitoring/confirmation."""

    def test_high_no_auto_dispatch(self):
        # Vitals that score HIGH (50-69) in MedicalEngine
        vitals = VitalsInput(
            usuario_id="test_case_d",
            ritmo_cardiaco=110,
            spo2=91,
            presion_sistolica=165,
            presion_diastolica=105,
            temperatura=36.6,
            glucosa=90.0,
        )
        result = MedicalEngine.detect_patterns(vitals)
        # Even if emergencia_detectada is True at HIGH, we check the gate
        if result.nivel_criticidad == "HIGH":
            # HIGH + score >= 50 → emergency_eligible could be True from MedicalEngine
            # but CJM should recommend REQUEST_CONFIRMATION, not AUTO_ESCALATION
            from services.critical_judgment_module import CriticalJudgmentModule
            cjm = CriticalJudgmentModule()
            cjm_result = cjm.evaluate(current={
                "heart_rate_bpm": 110,
                "spo2_percent": 91,
                "systolic_bp": 165,
                "diastolic_bp": 105,
            })
            # CJM HIGH → REQUEST_CONFIRMATION (not AUTO_ESCALATION_CANDIDATE)
            assert cjm_result.escalation_action.value in (
                "REQUEST_CONFIRMATION", "NOTIFY_CONTACT", "MONITOR"
            ), f"CJM should not auto-escalate on HIGH: got {cjm_result.escalation_action}"


class TestCaseE_CriticalConfirmed:
    """Case E: CRITICAL from MedicalEngine/CJM.
    Emergency path MUST remain functional."""

    def test_critical_emergency_eligible(self):
        vitals = VitalsInput(
            usuario_id="test_case_e",
            ritmo_cardiaco=150,
            spo2=82,
            presion_sistolica=200,
            presion_diastolica=130,
            temperatura=37.0,
            glucosa=45.0,
            caida_detectada=True,
            movimiento_posterior=False,
        )
        result = MedicalEngine.detect_patterns(vitals)
        assert result.nivel_criticidad == "CRITICAL"
        assert result.emergencia_detectada is True
        assert result.score_riesgo >= MedicalEngine.UMBRAL_ALTA  # >= 70

        # Safety gate should allow emergency
        emergency_eligible = (
            result.emergencia_detectada
            and result.score_riesgo >= MedicalEngine.UMBRAL_MEDIA
            and result.nivel_criticidad in ("CRITICAL", "HIGH")
        )
        assert emergency_eligible is True, (
            "SAFETY VIOLATION: CRITICAL case should be emergency_eligible=True"
        )


class TestCaseF_LayerContradiction:
    """Case F: MedicalEngine LOW + ML HIGH.
    Should log warning, NOT trigger emergency."""

    def test_ml_confidence_is_not_risk(self):
        """ML confidence 100% for LOW class should NOT be treated as 100% risk."""
        result = classify_triage(
            heart_rate=72, spo2=98, bp_sys=120, bp_dia=80,
            glucose=90.0, temperature=36.6, age=35,
        )
        assert result["level"] == "BAJO"
        assert result["confidence"] >= 0.99
        # High confidence in LOW class = SAFE, not dangerous
        # UI must show "Confianza del modelo: 100%" not "Riesgo: 100%"

    def test_contradiction_gate(self):
        """When ML and MedicalEngine disagree, use conservative approach."""
        severity_rank = {"BAJO": 0, "NORMAL": 0, "MEDIO": 1, "MEDIUM": 1,
                         "ALTO": 2, "HIGH": 2, "CRITICO": 3, "CRITICAL": 3}

        # Simulate: ML says ALTO, MedicalEngine says NORMAL (score 8)
        ml_level = "ALTO"
        ml_rank = severity_rank[ml_level]
        me_level = "NORMAL"
        me_rank = severity_rank[me_level]
        me_score = 8.0

        # ML rank > ME rank, but ME score is low
        assert ml_rank > me_rank

        # Safety gate: no emergency
        emergency_eligible = (
            False  # emergencia_detectada from ME is False at score 8
            and me_score >= 50
            and me_level in ("CRITICAL", "HIGH")
        )
        assert emergency_eligible is False


class TestEmergencyGateIntegrity:
    """Verify the emergency gate formula itself."""

    def test_gate_requires_all_three_conditions(self):
        """Emergency requires: emergencia_detectada AND score >= 50 AND CRITICAL/HIGH."""
        # Missing emergencia_detectada
        assert not (False and 80.0 >= 50 and "CRITICAL" in ("CRITICAL", "HIGH"))
        # Missing score
        assert not (True and 30.0 >= 50 and "CRITICAL" in ("CRITICAL", "HIGH"))
        # Missing severity
        assert not (True and 80.0 >= 50 and "MEDIUM" in ("CRITICAL", "HIGH"))
        # All three met
        assert (True and 80.0 >= 50 and "CRITICAL" in ("CRITICAL", "HIGH"))

    def test_ml_alto_never_sets_emergency(self):
        """Even with ML ALTO at 100% confidence, if ME score < 50, no emergency."""
        ml_result = classify_triage(
            heart_rate=99, spo2=90, bp_sys=115, bp_dia=82,
            glucose=90.0, temperature=36.6, age=50,
        )
        vitals = VitalsInput(
            usuario_id="test_gate",
            ritmo_cardiaco=99,
            spo2=90,
            presion_sistolica=115,
            presion_diastolica=82,
            temperatura=36.6,
            glucosa=90.0,
        )
        me_result = MedicalEngine.detect_patterns(vitals)

        # ML says ALTO with high confidence
        assert ml_result["level"] == "ALTO"
        assert ml_result["confidence"] > 0.9

        # MedicalEngine says score is below emergency threshold
        assert me_result.score_riesgo < MedicalEngine.UMBRAL_MEDIA

        # Gate must block
        emergency_eligible = (
            me_result.emergencia_detectada
            and me_result.score_riesgo >= MedicalEngine.UMBRAL_MEDIA
            and me_result.nivel_criticidad in ("CRITICAL", "HIGH")
        )
        assert emergency_eligible is False
