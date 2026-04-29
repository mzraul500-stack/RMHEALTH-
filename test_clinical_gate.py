"""
Clinical Gate — 9 casos A-I (Raúl + nuevos F,G,H,I)
Ejecutar contra el modelo local en backend/models/
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent / "backend"))

import ai_engine

# Apuntar al modelo v3 local
ai_engine._TRIAGE_MODEL_PATH = Path(__file__).parent / "backend" / "models" / "triage_classifier.joblib"
ai_engine._model_load_attempted = False
ai_engine._triage_model = None

from ai_engine import classify_triage

CASES = [
    ("A", dict(spo2=89, heart_rate=118, bp_sys=110, bp_dia=80),  ["ALTO", "CRITICO"]),
    ("B", dict(spo2=95, heart_rate=110, bp_sys=140, bp_dia=95),  ["MEDIO", "ALTO", "CRITICO"]),
    ("C", dict(spo2=88, heart_rate=125, bp_sys=160, bp_dia=100), ["CRITICO"]),
    ("D", dict(spo2=98, heart_rate=72,  bp_sys=118, bp_dia=76),  ["BAJO"]),
    ("E (RAÚL)", dict(spo2=89, heart_rate=118, bp_sys=140, bp_dia=95), ["CRITICO"]),
    # Nuevos F-I
    ("F", dict(spo2=92, heart_rate=105, bp_sys=135, bp_dia=88),  ["MEDIO"]),
    ("G", dict(spo2=85, heart_rate=130, bp_sys=190, bp_dia=115), ["CRITICO"]),
    ("H", dict(spo2=96, heart_rate=65,  bp_sys=125, bp_dia=78),  ["BAJO"]),
    ("I", dict(spo2=91, heart_rate=58,  bp_sys=88,  bp_dia=55),  ["ALTO", "CRITICO"]),
]

print("=" * 65)
print("  CLINICAL GATE — RMHealth Triage Model v3 (sklearn 1.6.1)")
print("=" * 65)

passed = 0
failed_cases = []

for name, vitals, expected in CASES:
    r = classify_triage(glucose=90, temperature=36.6, age=50, **vitals)
    ok = r["level"] in expected
    status = "[PASS]" if ok else "[FAIL]"
    if ok:
        passed += 1
    else:
        failed_cases.append(name)
    conf_str = f"{r['confidence']*100:.1f}%" if r.get("confidence") else "N/A"
    print(f"  Caso {name:<12} {status}  Pred={r['level']:<8}  conf={conf_str:<6}  Esp={expected}")

total = len(CASES)
print("=" * 65)
print(f"  Resultado: {passed}/{total} PASS")
print(f"  Model available: {r['model_available']}")

if failed_cases:
    print(f"\n  ATENCION CASOS FALLIDOS: {failed_cases}")
    print("  NO DESPLEGAR -- revisar y reentrenar")
    sys.exit(1)
else:
    print("\n  [OK] TODOS LOS CRITERIOS CUMPLIDOS -- LISTO PARA DEPLOY")
    sys.exit(0)
