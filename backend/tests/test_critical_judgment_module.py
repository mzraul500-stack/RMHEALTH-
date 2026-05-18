import unittest
from datetime import datetime, timezone, timedelta
from backend.services.critical_judgment_module import (
    CriticalJudgmentModule,
    Severity,
    EscalationAction,
)

class TestCriticalJudgmentModule(unittest.TestCase):
    def setUp(self):
        self.cjm = CriticalJudgmentModule()

    def test_normal_case(self):
        current = {
            "heart_rate_bpm": 72,
            "spo2_percent": 98,
            "systolic_bp": 120,
            "diastolic_bp": 80
        }
        result = self.cjm.evaluate(current=current)
        self.assertEqual(result.severity, Severity.NORMAL)
        self.assertTrue(result.risk_score < self.cjm.config.low_threshold)

    def test_tachycardia_and_low_spo2(self):
        current = {
            "heart_rate_bpm": 135,
            "spo2_percent": 88,
            "systolic_bp": 165,
            "diastolic_bp": 105
        }
        result = self.cjm.evaluate(current=current)
        self.assertIn(result.severity, [Severity.HIGH, Severity.CRITICAL])
        self.assertTrue(result.risk_score >= self.cjm.config.high_threshold)

    def test_triple_low(self):
        current = {
            "heart_rate_bpm": 48,
            "spo2_percent": 90,
            "systolic_bp": 85,
            "diastolic_bp": 55
        }
        result = self.cjm.evaluate(current=current)
        self.assertTrue(result.risk_score > 0)
        
        # Verify PATTERN_TRIPLE_LOW is among factors
        rule_ids = [f.rule_id for f in result.risk_factors]
        self.assertIn("PATTERN_TRIPLE_LOW", rule_ids)
        self.assertIn(result.severity, [Severity.HIGH, Severity.CRITICAL])

    def test_fall_without_movement(self):
        current = {
            "fall_detected": True,
            "movement_after_fall": False,
        }
        result = self.cjm.evaluate(current=current)
        self.assertEqual(result.severity, Severity.CRITICAL)
        self.assertEqual(result.escalation_action, EscalationAction.AUTO_ESCALATION_CANDIDATE)

    def test_spo2_falling_trend(self):
        now = datetime.now(timezone.utc)
        current = {"spo2_percent": 90}
        recent_readings = [
            {"spo2_percent": 98, "measured_at": now - timedelta(minutes=60)},
            {"spo2_percent": 96, "measured_at": now - timedelta(minutes=50)},
            {"spo2_percent": 94, "measured_at": now - timedelta(minutes=40)},
            {"spo2_percent": 92, "measured_at": now - timedelta(minutes=30)},
            {"spo2_percent": 91, "measured_at": now - timedelta(minutes=20)},
        ]
        result = self.cjm.evaluate(current=current, recent_readings=recent_readings, evaluated_at=now)
        rule_ids = [f.rule_id for f in result.risk_factors]
        self.assertIn("TREND_SPO2_FALLING", rule_ids)

    def test_medical_profile_multiplier(self):
        current = {
            "heart_rate_bpm": 110,
            "spo2_percent": 94,
        }
        
        result_without_profile = self.cjm.evaluate(current=current)
        
        profile = {
            "has_hypertension": True,
            "has_cardiac_history": True
        }
        result_with_profile = self.cjm.evaluate(current=current, profile=profile)
        
        self.assertTrue(result_with_profile.risk_score > result_without_profile.risk_score)

if __name__ == '__main__':
    unittest.main()
