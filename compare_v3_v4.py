"""
Lee y muestra metricas v3 vs v4 y corre el clinical gate con el modelo v4.
"""
import json, sys
from pathlib import Path
sys.path.insert(0, str(Path("h:/RMHEALTH/backend")))

# ── Metricas v3 (backup) vs v4 ──────────────────────────────────
v3_path = Path("h:/RMHEALTH/models/triage_metrics_v3.json")
v4_path = Path("h:/RMHEALTH/models/triage_metrics_v4.json")

v3 = json.loads(v3_path.read_text()) if v3_path.exists() else {}
v4 = json.loads(v4_path.read_text())

print("=" * 60)
print("  COMPARACION v3 vs v4")
print("=" * 60)
print(f"  {'Metrica':<25} {'v3':>8} {'v4':>8}")
print(f"  {'-'*45}")
print(f"  {'Accuracy global':<25} {v3.get('accuracy',0)*100:>7.2f}% {v4['accuracy']*100:>7.2f}%")
print(f"  {'Recall CRITICO':<25} {v3.get('recall_critico',0)*100:>7.2f}% {v4['recall_critico']*100:>7.2f}%")

cr3 = v3.get("classification_report", {})
cr4 = v4["classification_report"]
for cls in ["BAJO", "MEDIO", "ALTO", "CRITICO"]:
    r3 = cr3.get(cls, {}).get("recall", 0) * 100
    r4 = cr4[cls]["recall"] * 100
    p4 = cr4[cls]["precision"] * 100
    f4 = cr4[cls]["f1-score"] * 100
    print(f"  {'Recall ' + cls:<25} {r3:>7.1f}% {r4:>7.1f}%  (P={p4:.1f}% F1={f4:.1f}%)")

# ── Casos clinicos desde metricas v4 ────────────────────────────
print()
print("=" * 60)
print("  VALIDACION CLINICA v4 (9 casos A-I)")
print("=" * 60)
cases = v4.get("clinical_cases", [])
passed_count = 0
caso_i_result = None
for c in cases:
    st = "[PASS]" if c["passed"] else "[FAIL]"
    conf = c["confidence"] * 100
    print(f"  {c['case']:<22} {st}  {c['prediction']:<8} conf={conf:.1f}%  Esp={c['expected']}")
    if c["passed"]:
        passed_count += 1
    if "Triple Low" in c["case"] or c["case"] == "Caso I (Triple Low)":
        caso_i_result = c

total = len(cases)
print()
print(f"  Resultado: {passed_count}/{total} PASS")
print(f"  Deploy aprobado: {v4['deploy_approved']}")

if caso_i_result:
    print()
    print("  ── CASO I (Triple Low) ──────────────────────────────")
    print(f"  Prediccion: {caso_i_result['prediction']}")
    print(f"  Confianza:  {caso_i_result['confidence']*100:.1f}%")
    print(f"  Resultado:  {'PASS' if caso_i_result['passed'] else 'FAIL'}")
    probs = caso_i_result.get("probabilities", {})
    for lbl, p in probs.items():
        print(f"    {lbl}: {p*100:.1f}%")

sys.exit(0 if passed_count == total else 1)
