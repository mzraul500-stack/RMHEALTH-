"""
RMHealth AI Triage Engine — GradientBoosting Classifier.

Loads the trained model from models/triage_classifier.joblib and exposes
a prediction function for the API. The model was trained on 8,000 synthetic
samples with 15 engineered features and achieves 91.8% accuracy.

Feature order (must match training):
    heart_rate, spo2, bp_sys, bp_dia, glucose, temperature, age,
    pulse_pressure, mean_arterial_pressure, shock_index, hr_spo2_ratio,
    hr_deviation, spo2_deviation, bp_deviation, glucose_deviation

Labels: BAJO, MEDIO, ALTO, CRITICO

© 2025 MORALES ZEPEDA RAUL | INDAUTOR: 03-2025-070109072500-01
"""

import logging
import os
from pathlib import Path
from typing import Any, Dict, List, Optional

import numpy as np

logger = logging.getLogger("RMHealth.AIEngine")

# Resolve model path — check local models/ first, then parent models/
_THIS_DIR = Path(__file__).resolve().parent
_MODEL_CANDIDATES = [
    _THIS_DIR / "models",          # backend/models/ (Cloud Run)
    _THIS_DIR.parent / "models",   # ../models/ (local dev from project root)
]
_MODEL_DIR = next((d for d in _MODEL_CANDIDATES if d.exists()), _MODEL_CANDIDATES[0])
_TRIAGE_MODEL_PATH = _MODEL_DIR / "triage_classifier.joblib"
_HOSPITAL_MODEL_PATH = _MODEL_DIR / "hospital_scorer.joblib"

# Lazy-loaded model singletons
_triage_model = None
_hospital_model = None
_model_load_attempted = False

# Normal physiological baselines (used for deviation features)
_BASELINES = {
    "heart_rate": 75.0,
    "spo2": 97.0,
    "bp_sys": 120.0,
    "glucose": 90.0,
}

# Label mapping: model outputs 0-3, we map to clinical labels
_LABEL_MAP = {0: "BAJO", 1: "MEDIO", 2: "ALTO", 3: "CRITICO",
              "0": "BAJO", "1": "MEDIO", "2": "ALTO", "3": "CRITICO",
              "BAJO": "BAJO", "MEDIO": "MEDIO", "ALTO": "ALTO", "CRITICO": "CRITICO"}
TRIAGE_LABELS = ["BAJO", "MEDIO", "ALTO", "CRITICO"]


def _load_model():
    """Load the triage model from disk. Called once on first prediction."""
    global _triage_model, _model_load_attempted

    if _model_load_attempted:
        return _triage_model

    _model_load_attempted = True

    if not _TRIAGE_MODEL_PATH.exists():
        logger.critical(
            "FATAL: triage_classifier.joblib NOT FOUND at %s. "
            "ML predictions will be unavailable. The system will fall back "
            "to heuristic rules only.",
            _TRIAGE_MODEL_PATH,
        )
        return None

    try:
        import joblib

        _triage_model = joblib.load(_TRIAGE_MODEL_PATH)
        logger.info(
            "Triage model loaded successfully from %s (%.1f MB)",
            _TRIAGE_MODEL_PATH,
            _TRIAGE_MODEL_PATH.stat().st_size / (1024 * 1024),
        )
        return _triage_model
    except Exception as e:
        logger.critical("Failed to load triage model: %s", e)
        return None


def _compute_features(
    heart_rate: int,
    spo2: int,
    bp_sys: int,
    bp_dia: int,
    glucose: float = 90.0,
    temperature: float = 36.6,
    age: int = 50,
) -> np.ndarray:
    """Compute the 15 engineered features expected by the model.

    Feature engineering matches the original training pipeline:
      - 6 raw vitals
      - pulse_pressure = bp_sys - bp_dia
      - mean_arterial_pressure = bp_dia + (pulse_pressure / 3)
      - shock_index = heart_rate / bp_sys
      - hr_spo2_ratio = heart_rate / spo2
      - 4 deviation features = abs(value - baseline) / baseline

    Args:
        heart_rate: BPM (40-200).
        spo2: Oxygen saturation % (70-100).
        bp_sys: Systolic blood pressure mmHg (80-250).
        bp_dia: Diastolic blood pressure mmHg (50-150).
        glucose: Blood glucose mg/dL (default 90).
        temperature: Body temperature °C (default 36.6).
        age: Patient age in years (default 50).

    Returns:
        numpy array of shape (1, 15) ready for model.predict().
    """
    pulse_pressure = float(bp_sys - bp_dia)
    map_val = bp_dia + (pulse_pressure / 3.0)
    shock_index = heart_rate / max(bp_sys, 1)
    hr_spo2_ratio = heart_rate / max(spo2, 1)

    hr_deviation = abs(heart_rate - _BASELINES["heart_rate"]) / _BASELINES["heart_rate"]
    spo2_deviation = abs(spo2 - _BASELINES["spo2"]) / _BASELINES["spo2"]
    bp_deviation = abs(bp_sys - _BASELINES["bp_sys"]) / _BASELINES["bp_sys"]
    glucose_deviation = abs(glucose - _BASELINES["glucose"]) / max(_BASELINES["glucose"], 1)

    features = np.array([[
        float(heart_rate),
        float(spo2),
        float(bp_sys),
        float(bp_dia),
        glucose,
        temperature,
        float(age),
        pulse_pressure,
        map_val,
        shock_index,
        hr_spo2_ratio,
        hr_deviation,
        spo2_deviation,
        bp_deviation,
        glucose_deviation,
    ]])

    return features


def classify_triage(
    heart_rate: int,
    spo2: int,
    bp_sys: int,
    bp_dia: int,
    glucose: float = 90.0,
    temperature: float = 36.6,
    age: int = 50,
) -> Dict[str, Any]:
    """Classify patient triage level using the trained GradientBoosting model.

    Args:
        heart_rate: Heart rate in BPM.
        spo2: Oxygen saturation percentage.
        bp_sys: Systolic blood pressure in mmHg.
        bp_dia: Diastolic blood pressure in mmHg.
        glucose: Blood glucose in mg/dL.
        temperature: Body temperature in °C.
        age: Patient age in years.

    Returns:
        Dict with keys:
            - level: str ("BAJO", "MEDIO", "ALTO", "CRITICO")
            - confidence: float (0.0-1.0)
            - probabilities: dict mapping each label to its probability
            - model_available: bool
    """
    model = _load_model()

    if model is None:
        return {
            "level": "UNKNOWN",
            "confidence": 0.0,
            "probabilities": {},
            "model_available": False,
        }

    try:
        features = _compute_features(
            heart_rate, spo2, bp_sys, bp_dia, glucose, temperature, age
        )

        prediction_raw = model.predict(features)[0]
        probabilities_raw = model.predict_proba(features)[0]

        # Map numeric labels (0,1,2,3) to clinical names (BAJO,MEDIO,ALTO,CRITICO)
        prediction = _LABEL_MAP.get(prediction_raw, str(prediction_raw))
        classes = list(model.classes_)
        probabilities = {
            _LABEL_MAP.get(cls, str(cls)): round(float(prob), 4)
            for cls, prob in zip(classes, probabilities_raw)
        }

        confidence = float(max(probabilities_raw))

        logger.info(
            "ML Triage: %s (confidence=%.2f) | HR=%d SpO2=%d BP=%d/%d",
            prediction, confidence, heart_rate, spo2, bp_sys, bp_dia,
        )

        return {
            "level": prediction,
            "confidence": round(confidence, 4),
            "probabilities": probabilities,
            "model_available": True,
        }

    except Exception as e:
        logger.error("ML prediction failed: %s", e)
        return {
            "level": "UNKNOWN",
            "confidence": 0.0,
            "probabilities": {},
            "model_available": False,
        }


# --- Self-test: run directly to verify model loads ---
if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    print("=" * 60)
    print("RMHealth AI Engine — Model Load Test")
    print("=" * 60)

    print(f"\nModel path: {_TRIAGE_MODEL_PATH}")
    print(f"File exists: {_TRIAGE_MODEL_PATH.exists()}")

    if _TRIAGE_MODEL_PATH.exists():
        size_mb = _TRIAGE_MODEL_PATH.stat().st_size / (1024 * 1024)
        print(f"File size: {size_mb:.1f} MB")

    print("\n--- Test 1: Healthy patient ---")
    result = classify_triage(
        heart_rate=72, spo2=98, bp_sys=120, bp_dia=80,
        glucose=90, temperature=36.6, age=35,
    )
    print(f"  Level: {result['level']}")
    print(f"  Confidence: {result['confidence']}")
    print(f"  Probabilities: {result['probabilities']}")
    print(f"  Model available: {result['model_available']}")

    print("\n--- Test 2: Hypertensive crisis ---")
    result = classify_triage(
        heart_rate=110, spo2=94, bp_sys=200, bp_dia=125,
        glucose=180, temperature=37.2, age=65,
    )
    print(f"  Level: {result['level']}")
    print(f"  Confidence: {result['confidence']}")
    print(f"  Probabilities: {result['probabilities']}")

    print("\n--- Test 3: Critical hypoxemia ---")
    result = classify_triage(
        heart_rate=150, spo2=82, bp_sys=85, bp_dia=55,
        glucose=60, temperature=35.2, age=78,
    )
    print(f"  Level: {result['level']}")
    print(f"  Confidence: {result['confidence']}")
    print(f"  Probabilities: {result['probabilities']}")

    print("\n" + "=" * 60)
    if result["model_available"]:
        print("[OK] MODEL LOADED AND OPERATIONAL")
    else:
        print("[FAIL] MODEL FAILED TO LOAD")
    print("=" * 60)
