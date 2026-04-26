"""
Tests for PreventiveAlertService
Validates trend detection, deduplication, and edge cases.
"""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from datetime import datetime, timedelta
from backend.services.preventive_alerts import (
    PreventiveAlertService,
    VitalReading,
)


def _make_readings(user_id, count, minutes_span, **overrides):
    """Generate a list of VitalReading spread evenly over a time span."""
    now = datetime.utcnow()
    readings = []
    for i in range(count):
        ts = now - timedelta(minutes=minutes_span - (i * minutes_span / max(count - 1, 1)))
        kwargs = {
            "user_id": user_id,
            "heart_rate": overrides.get("heart_rate", 75),
            "spo2": overrides.get("spo2", 97),
            "systolic": overrides.get("systolic", 120),
            "diastolic": overrides.get("diastolic", 78),
            "glucose": overrides.get("glucose", 95.0),
            "source": overrides.get("source", "unknown"),
            "timestamp": ts,
        }
        # Allow per-reading override via callable
        if "heart_rate_fn" in overrides:
            kwargs["heart_rate"] = overrides["heart_rate_fn"](i)
        if "spo2_fn" in overrides:
            kwargs["spo2"] = overrides["spo2_fn"](i)
        if "systolic_fn" in overrides:
            kwargs["systolic"] = overrides["systolic_fn"](i)
        if "glucose_fn" in overrides:
            kwargs["glucose"] = overrides["glucose_fn"](i)
        readings.append(VitalReading(**kwargs))
    return readings


def test_insufficient_data():
    """User with not enough readings should not generate any alerts."""
    print("TEST 1: Insufficient data...")
    readings = _make_readings("user_001", count=2, minutes_span=10)
    result = PreventiveAlertService.analyze_user_trends("user_001", readings)
    assert result.insufficient_data is True, f"Expected insufficient_data=True, got {result.insufficient_data}"
    assert len(result.alerts) == 0, f"Expected 0 alerts, got {len(result.alerts)}"
    print("  PASS: No alerts, insufficient_data=True\n")


def test_all_normal():
    """User with completely normal readings should not generate alerts."""
    print("TEST 2: All normal readings...")
    readings = _make_readings("user_002", count=5, minutes_span=14,
                              heart_rate=72, spo2=97, systolic=118, diastolic=76, glucose=95.0)
    result = PreventiveAlertService.analyze_user_trends("user_002", readings)
    assert result.insufficient_data is False
    assert len(result.alerts) == 0, f"Expected 0 alerts, got {len(result.alerts)}: {[a.title for a in result.alerts]}"
    print("  PASS: No alerts for normal vitals\n")


def test_sustained_elevated_heart_rate():
    """Sustained HR above threshold should generate a preventive alert."""
    print("TEST 3: Sustained elevated heart rate...")
    readings = _make_readings("user_003", count=5, minutes_span=14,
                              heart_rate=110, spo2=96, systolic=125, diastolic=80)
    result = PreventiveAlertService.analyze_user_trends("user_003", readings)
    hr_alerts = [a for a in result.alerts if a.metric == "heart_rate"]
    assert len(hr_alerts) >= 1, f"Expected at least 1 HR alert, got {len(hr_alerts)}"
    for a in hr_alerts:
        assert "diagnóstico" not in a.message.lower(), "Alert should not use diagnostic language"
        assert a.alert_type == "preventive"
    print(f"  PASS: {len(hr_alerts)} HR alert(s) generated")
    for a in hr_alerts:
        print(f"    [{a.severity}] {a.title}")
    print()


def test_systolic_rising_trend():
    """Rising systolic pressure over 2h window should generate alert."""
    print("TEST 4: Systolic rising trend (2h window)...")
    readings = _make_readings("user_004", count=6, minutes_span=110,
                              systolic_fn=lambda i: 120 + (i * 5),  # 120, 125, 130, 135, 140, 145
                              heart_rate=75, spo2=97, diastolic=80)
    result = PreventiveAlertService.analyze_user_trends("user_004", readings)
    sys_alerts = [a for a in result.alerts if a.metric == "systolic"]
    assert len(sys_alerts) >= 1, f"Expected at least 1 systolic alert, got {len(sys_alerts)}"
    print(f"  PASS: {len(sys_alerts)} systolic alert(s) generated")
    for a in sys_alerts:
        print(f"    [{a.severity}] {a.title} (delta: {a.delta})")
    print()


def test_spo2_progressive_decline():
    """SpO2 declining progressively should generate alert."""
    print("TEST 5: SpO2 progressive decline...")
    readings = _make_readings("user_005", count=5, minutes_span=14,
                              spo2_fn=lambda i: 98 - (i * 2),  # 98, 96, 94, 92, 90
                              heart_rate=75, systolic=120, diastolic=78)
    result = PreventiveAlertService.analyze_user_trends("user_005", readings)
    spo2_alerts = [a for a in result.alerts if a.metric == "spo2"]
    assert len(spo2_alerts) >= 1, f"Expected at least 1 SpO2 alert, got {len(spo2_alerts)}"
    print(f"  PASS: {len(spo2_alerts)} SpO2 alert(s) generated")
    for a in spo2_alerts:
        print(f"    [{a.severity}] {a.title}")
    print()


def test_glucose_normal():
    """Normal glucose readings should not generate alerts."""
    print("TEST 6: Glucose normal (manual)...")
    readings = _make_readings("user_006", count=5, minutes_span=14,
                              glucose=95.0, source="manual")
    result = PreventiveAlertService.analyze_user_trends("user_006", readings)
    glucose_alerts = [a for a in result.alerts if a.metric == "glucose"]
    assert len(glucose_alerts) == 0, f"Expected 0 glucose alerts, got {len(glucose_alerts)}"
    print("  PASS: No glucose alerts for normal values\n")


def test_glucose_low_repeated():
    """Repeated low glucose readings should generate preventive alert."""
    print("TEST 7: Glucose low repeated (manual)...")
    readings = _make_readings("user_007", count=5, minutes_span=14,
                              glucose=65.0, source="manual")
    result = PreventiveAlertService.analyze_user_trends("user_007", readings)
    glucose_alerts = [a for a in result.alerts if a.metric == "glucose"]
    assert len(glucose_alerts) >= 1, f"Expected at least 1 glucose alert, got {len(glucose_alerts)}"
    for a in glucose_alerts:
        assert "hipoglucemia confirmada" not in a.message.lower(), "Should NOT use diagnostic language"
        assert "diabetes" not in a.message.lower(), "Should NOT mention diabetes"
    print(f"  PASS: {len(glucose_alerts)} glucose alert(s) generated (non-diagnostic)")
    for a in glucose_alerts:
        print(f"    [{a.severity}] {a.title} (source: {a.source})")
    print()


def test_glucose_high_repeated():
    """Repeated high glucose readings should generate preventive alert."""
    print("TEST 8: Glucose high repeated (manual)...")
    readings = _make_readings("user_008", count=5, minutes_span=14,
                              glucose=200.0, source="manual")
    result = PreventiveAlertService.analyze_user_trends("user_008", readings)
    glucose_alerts = [a for a in result.alerts if a.metric == "glucose"]
    assert len(glucose_alerts) >= 1, f"Expected at least 1 glucose alert, got {len(glucose_alerts)}"
    for a in glucose_alerts:
        assert "emergencia diabética" not in a.message.lower(), "Should NOT use diagnostic language"
    print(f"  PASS: {len(glucose_alerts)} glucose alert(s) generated (non-diagnostic)")
    for a in glucose_alerts:
        print(f"    [{a.severity}] {a.title}")
    print()


def test_glucose_insufficient_data():
    """Not enough glucose readings should mark insufficient."""
    print("TEST 9: Glucose insufficient data...")
    readings = _make_readings("user_009", count=2, minutes_span=10, glucose=180.0)
    result = PreventiveAlertService.analyze_user_trends("user_009", readings)
    assert result.insufficient_data is True
    glucose_alerts = [a for a in result.alerts if a.metric == "glucose"]
    assert len(glucose_alerts) == 0
    print("  PASS: No glucose alerts with insufficient data\n")


def test_deduplication():
    """Same alert within 30 minutes should not be duplicated."""
    print("TEST 10: Anti-spam deduplication...")
    readings = _make_readings("user_010", count=5, minutes_span=14, heart_rate=115)

    # Simulate a recent alert that already exists
    recent_alerts = [{
        "user_id": "user_010",
        "metric": "heart_rate",
        "severity": "MEDIUM",
        "data_window": "15m",
        "created_at": datetime.utcnow() - timedelta(minutes=10),  # 10 min ago
    }]

    result = PreventiveAlertService.analyze_user_trends("user_010", readings, recent_alerts=recent_alerts)
    hr_medium_15m = [a for a in result.alerts if a.metric == "heart_rate" and a.severity == "MEDIUM" and a.data_window == "15m"]
    assert len(hr_medium_15m) == 0, f"Expected 0 duplicate alerts, got {len(hr_medium_15m)}"
    print("  PASS: Duplicate alert was correctly suppressed\n")


if __name__ == "__main__":
    print("=" * 60)
    print("RMHEALTH — PREVENTIVE ALERT SERVICE TESTS")
    print("=" * 60 + "\n")

    test_insufficient_data()
    test_all_normal()
    test_sustained_elevated_heart_rate()
    test_systolic_rising_trend()
    test_spo2_progressive_decline()
    test_glucose_normal()
    test_glucose_low_repeated()
    test_glucose_high_repeated()
    test_glucose_insufficient_data()
    test_deduplication()

    print("=" * 60)
    print("ALL 10 TESTS PASSED")
    print("=" * 60)
