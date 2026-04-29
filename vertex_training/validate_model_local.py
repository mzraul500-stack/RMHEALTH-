"""
Validacion DEFINITIVA del modelo v2 (mismo .joblib que esta en produccion).
Prueba los 5 casos clinicos directamente sin necesitar credenciales de API.
"""
import sys
sys.path.insert(0, 'h:/RMHEALTH/backend')

import joblib, numpy as np, pandas as pd

LABELS = ["BAJO", "MEDIO", "ALTO", "CRITICO"]
MODEL_PATH = "h:/RMHEALTH/models/triage_classifier.joblib"
FEATURE_COLS = [
    "heart_rate", "spo2", "bp_sys", "bp_dia", "glucose", "temperature", "age",
    "pulse_pressure", "mean_arterial_pressure", "shock_index",
    "hr_spo2_ratio", "hr_deviation", "spo2_deviation", "bp_deviation", "glucose_deviation"
]

def engineer_features(row):
    pp   = row["bp_sys"] - row["bp_dia"]
    map_ = row["bp_dia"] + (pp / 3.0)
    si   = row["heart_rate"] / max(row["bp_sys"], 1)
    hsr  = row["heart_rate"] / max(row["spo2"], 1)
    hd   = abs(row["heart_rate"] - 75.0) / 75.0
    sd   = abs(row["spo2"] - 97.0) / 97.0
    bd   = abs(row["bp_sys"] - 120.0) / 120.0
    gd   = abs(row["glucose"] - 90.0) / 90.0
    row["pulse_pressure"]         = pp
    row["mean_arterial_pressure"] = map_
    row["shock_index"]            = si
    row["hr_spo2_ratio"]          = hsr
    row["hr_deviation"]           = hd
    row["spo2_deviation"]         = sd
    row["bp_deviation"]           = bd
    row["glucose_deviation"]      = gd
    return row

model = joblib.load(MODEL_PATH)
print('Modelo cargado:', MODEL_PATH)

cases = [
    ('A', 118, 89, 110, 80,  36.5, 45, ['ALTO', 'CRITICO'],      'SpO2=89, FC=118, TAS=110'),
    ('B', 110, 95, 140, 95,  36.5, 50, ['MEDIO', 'ALTO', 'CRITICO'], 'SpO2=95, FC=110, TAS=140'),
    ('C', 125, 88, 160, 100, 36.5, 55, ['CRITICO'],               'SpO2=88, FC=125, TAS=160'),
    ('D', 72,  98, 118, 76,  36.5, 35, ['BAJO'],                  'SpO2=98, FC=72, TAS=118'),
    ('E', 118, 89, 140, 95,  36.5, 50, ['CRITICO'],               'CASO RAUL: SpO2=89, FC=118, TAS=140'),
]

print()
print('=' * 65)
print('  VALIDACION LOCAL - Modelo Vertex AI v2 (mismo que produccion)')
print('=' * 65)
print()

all_pass = True
for name, fc, spo2, tas, tad, temp, age, expected, desc in cases:
    row = {
        "heart_rate": fc, "spo2": spo2, "bp_sys": tas, "bp_dia": tad,
        "glucose": 90, "temperature": temp, "age": age
    }
    row = engineer_features(row)
    X = np.array([[row[f] for f in FEATURE_COLS]])
    pred  = model.predict(X)[0]
    proba = model.predict_proba(X)[0]
    label = LABELS[pred]
    conf  = proba[pred]
    passed = label in expected
    status = 'PASS' if passed else 'FAIL'
    if not passed:
        all_pass = False
    print(f'  [{status}] Caso {name}: {desc}')
    proba_str = '  '.join(f'{LABELS[i]}={p:.0%}' for i, p in enumerate(proba))
    print(f'         Prediccion: {label} ({conf:.1%})  |  Esperado: {expected}')
    print(f'         Probabilidades: {proba_str}')
    print()

print('=' * 65)
if all_pass:
    print('  TODOS LOS CASOS PASAN')
    print('  El modelo Vertex AI v2 esta APROBADO para produccion.')
else:
    print('  HAY CASOS QUE FALLAN - NO DESPLEGAR')
print('=' * 65)
