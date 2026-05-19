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

    # ── Timezone mismatch tests (fix for production bug) ──────────────────

    def test_naive_measured_at_does_not_crash(self):
        """Reproduce the production bug: naive measured_at + aware evaluated_at."""
        now = datetime.now(timezone.utc)
        current = {"spo2_percent": 90, "heart_rate_bpm": 100}

        # All measured_at are NAIVE (no tzinfo) — this is what PostgreSQL
        # can return depending on psycopg2 cursor configuration.
        recent_readings = [
            {"spo2_percent": 98, "measured_at": datetime(2026, 5, 18, 12, 0, 0)},
            {"spo2_percent": 96, "measured_at": datetime(2026, 5, 18, 12, 10, 0)},
            {"spo2_percent": 94, "measured_at": datetime(2026, 5, 18, 12, 20, 0)},
            {"spo2_percent": 92, "measured_at": datetime(2026, 5, 18, 12, 30, 0)},
            {"spo2_percent": 91, "measured_at": datetime(2026, 5, 18, 12, 40, 0)},
        ]
        # Must NOT raise TypeError: can't subtract offset-naive and offset-aware datetimes
        result = self.cjm.evaluate(current=current, recent_readings=recent_readings, evaluated_at=now)
        self.assertIsNotNone(result.severity)

    def test_iso_string_with_z_suffix(self):
        """measured_at as ISO string ending with Z (common from JS frontends)."""
        now = datetime.now(timezone.utc)
        current = {"heart_rate_bpm": 72, "spo2_percent": 98}
        recent_readings = [
            {"heart_rate_bpm": 70, "measured_at": "2026-05-18T12:00:00Z"},
            {"heart_rate_bpm": 72, "measured_at": "2026-05-18T12:10:00Z"},
            {"heart_rate_bpm": 74, "measured_at": "2026-05-18T12:20:00Z"},
            {"heart_rate_bpm": 76, "measured_at": "2026-05-18T12:30:00Z"},
            {"heart_rate_bpm": 78, "measured_at": "2026-05-18T12:40:00Z"},
        ]
        result = self.cjm.evaluate(current=current, recent_readings=recent_readings, evaluated_at=now)
        self.assertIsNotNone(result.severity)

    def test_iso_string_without_timezone(self):
        """measured_at as ISO string without timezone info (naive serialization)."""
        now = datetime.now(timezone.utc)
        current = {"heart_rate_bpm": 72, "spo2_percent": 98}
        recent_readings = [
            {"heart_rate_bpm": 70, "measured_at": "2026-05-18T12:00:00"},
            {"heart_rate_bpm": 72, "measured_at": "2026-05-18T12:10:00"},
            {"heart_rate_bpm": 74, "measured_at": "2026-05-18T12:20:00"},
            {"heart_rate_bpm": 76, "measured_at": "2026-05-18T12:30:00"},
            {"heart_rate_bpm": 78, "measured_at": "2026-05-18T12:40:00"},
        ]
        result = self.cjm.evaluate(current=current, recent_readings=recent_readings, evaluated_at=now)
        self.assertIsNotNone(result.severity)

    def test_mixed_naive_and_aware_readings(self):
        """Mix of naive and aware datetimes in the same batch — must not crash."""
        now = datetime.now(timezone.utc)
        current = {"heart_rate_bpm": 100, "spo2_percent": 95}
        recent_readings = [
            {"heart_rate_bpm": 70, "measured_at": datetime(2026, 5, 18, 12, 0, 0)},                     # naive
            {"heart_rate_bpm": 75, "measured_at": datetime(2026, 5, 18, 12, 10, 0, tzinfo=timezone.utc)}, # aware
            {"heart_rate_bpm": 80, "measured_at": "2026-05-18T12:20:00"},                                 # naive string
            {"heart_rate_bpm": 85, "measured_at": "2026-05-18T12:30:00Z"},                                # aware string
            {"heart_rate_bpm": 90, "measured_at": datetime(2026, 5, 18, 12, 40, 0)},                     # naive
        ]
        result = self.cjm.evaluate(current=current, recent_readings=recent_readings, evaluated_at=now)
        self.assertIsNotNone(result.severity)

    def test_trend_detection_with_naive_timestamps(self):
        """Verify that _evaluate_trends actually detects trends even when readings arrive naive."""
        # Use a fixed 'now' so readings fall within the 2h trend window
        now = datetime(2026, 5, 18, 13, 0, 0, tzinfo=timezone.utc)
        current = {"spo2_percent": 88}
        recent_readings = [
            {"spo2_percent": 98, "measured_at": datetime(2026, 5, 18, 12, 0, 0)},   # naive, 60 min ago
            {"spo2_percent": 96, "measured_at": datetime(2026, 5, 18, 12, 10, 0)},
            {"spo2_percent": 94, "measured_at": datetime(2026, 5, 18, 12, 20, 0)},
            {"spo2_percent": 92, "measured_at": datetime(2026, 5, 18, 12, 30, 0)},
            {"spo2_percent": 90, "measured_at": datetime(2026, 5, 18, 12, 40, 0)},
        ]
        result = self.cjm.evaluate(current=current, recent_readings=recent_readings, evaluated_at=now)
        rule_ids = [f.rule_id for f in result.risk_factors]
        self.assertIn("TREND_SPO2_FALLING", rule_ids)


class TestPreventiveAlertsTimezone(unittest.TestCase):
    """Reproduce the exact production bug in PreventiveAlertService."""

    def test_naive_timestamp_does_not_crash_window_partitioning(self):
        """The production error: now(UTC) - naive_timestamp → TypeError."""
        from backend.services.preventive_alerts import VitalReading as PrevVitalReading

        # Create a reading with a NAIVE datetime — this is what PostgreSQL returns
        reading = PrevVitalReading(
            user_id="test-user",
            heart_rate=80,
            spo2=98,
            systolic=120,
            diastolic=80,
            timestamp=datetime(2026, 5, 18, 12, 0, 0),  # naive!
        )
        # After the fix, the validator should have made it aware
        self.assertIsNotNone(reading.timestamp.tzinfo)

        # Verify subtraction works (this is the exact operation that crashed)
        now = datetime.now(timezone.utc)
        delta = now - reading.timestamp  # Must NOT raise TypeError
        self.assertIsInstance(delta, timedelta)

if __name__ == '__main__':
    unittest.main()
