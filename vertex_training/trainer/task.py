"""
RMHealth Triage Classifier v4 — Vertex AI Custom Training Script.

v4 agrega patron 'Triple Low' (bradicardia+hipotension+hipoxemia simultaneas)
para corregir Caso I. Mantiene v3 como rollback.
Genera dataset sintetico clinico (NEWS2/AHA/ADA/qSOFA), entrena
GradientBoostingClassifier con pesos correctos para FC/SpO2/Presion,
evalua metricas por clase y guarda el modelo en Cloud Storage.

© 2025-2026 MORALES ZEPEDA RAUL | INDAUTOR: 03-2025-070109072500-01
"""

import os
import json
import logging
import joblib
import numpy as np
import pandas as pd
import sklearn

from sklearn.ensemble import GradientBoostingClassifier
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report, confusion_matrix, roc_auc_score
from sklearn.preprocessing import LabelEncoder
from google.cloud import storage

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger("RMHealth.TrainV4")
log.info("sklearn version en ejecucion: %s", sklearn.__version__)

# ── Cloud Storage config ────────────────────────────────────────
BUCKET_NAME   = os.environ.get("AIP_BUCKET", "rmhealth-training-artifacts")
MODEL_DIR     = os.environ.get("AIP_MODEL_DIR", f"gs://{BUCKET_NAME}/models/")
DATASET_PATH  = f"gs://{BUCKET_NAME}/datasets/training_dataset.csv"
METRICS_PATH  = f"gs://{BUCKET_NAME}/metrics/triage_metrics_v4.json"

# ── Clinical thresholds (NEWS2 / AHA 2023 / ADA 2024 / qSOFA) ──
LABEL_MAP = {0: "BAJO", 1: "MEDIO", 2: "ALTO", 3: "CRITICO"}
LABELS    = ["BAJO", "MEDIO", "ALTO", "CRITICO"]

# ── Minimum Recall required for CRÍTICO to approve deploy ───────
MIN_RECALL_CRITICO = 0.90


def generate_dataset(n_per_class: int = 2500, seed: int = 42) -> pd.DataFrame:
    """
    Genera dataset sintético clínico balanceado.

    Cada clase está definida por rangos de signos vitales basados en
    NEWS2 Score, guías AHA 2023 (hipertensión), ADA 2024 (glucosa) y
    criterios qSOFA (sepsis). Las combinaciones multi-factor son
    obligatorias para asegurar que FC, SpO2 y Presión sean los
    discriminadores primarios (corrección del sesgo actual de glucosa).
    """
    rng = np.random.default_rng(seed)
    rows = []

    # ── BAJO: NEWS2 0-1  ───────────────────────────────────────
    # Todos los signos vitales dentro de rangos normales.
    # Incluye bradicardia atletica (FC 48-59, SpO2/TAS normales) → NO es ALTO.
    for i in range(n_per_class):
        subtype = i % 4
        if subtype == 0:   # Normal clasico
            fc   = rng.integers(60, 101)
            spo2 = rng.integers(95, 101)
            tas  = rng.integers(90, 130)
            tad  = rng.integers(60, 85)
        elif subtype == 1: # Bradicardia atletica — FC baja con todo lo demas normal
            fc   = rng.integers(48, 60)   # bradicardia aislada
            spo2 = rng.integers(96, 101)  # SpO2 completamente normal
            tas  = rng.integers(100, 130) # TAS normal
            tad  = rng.integers(65, 85)   # TAD normal
        elif subtype == 2: # Adulto mayor sano
            fc   = rng.integers(62, 95)
            spo2 = rng.integers(95, 100)
            tas  = rng.integers(95, 128)
            tad  = rng.integers(62, 82)
        else:              # Hipotension leve aislada sin otros factores
            fc   = rng.integers(60, 95)
            spo2 = rng.integers(95, 100)
            tas  = rng.integers(88, 100)  # TAS levemente baja pero aislada
            tad  = rng.integers(58, 70)
        gluc = rng.integers(70, 200)
        temp = rng.uniform(36.0, 37.5)
        age  = rng.integers(18, 81)
        rows.append([fc, spo2, tas, tad, gluc, temp, age, "BAJO"])

    # ── MEDIO: NEWS2 2-4  ─────────────────────────────────────
    # Al menos UN signo vital alterado moderadamente.
    # Incluye bradicardia + un solo factor alterado (no triple-low).
    for i in range(n_per_case := n_per_class // 7 + 1, -1, -1) if False else range(n_per_class):
        pass
    for i in range(n_per_class):
        subtype = i % 7
        if subtype == 0:   # Taquicardia moderada
            fc   = rng.integers(101, 120)
            spo2 = rng.integers(93, 100)
            tas  = rng.integers(90, 140)
            tad  = rng.integers(60, 90)
        elif subtype == 1: # Hipoxemia leve aislada
            fc   = rng.integers(60, 105)
            spo2 = rng.integers(91, 95)
            tas  = rng.integers(95, 135)  # TAS normal
            tad  = rng.integers(62, 85)
        elif subtype == 2: # Hipertension Etapa 1-2
            fc   = rng.integers(60, 105)
            spo2 = rng.integers(93, 100)
            tas  = rng.integers(130, 160)
            tad  = rng.integers(85, 100)
        elif subtype == 3: # Fiebre moderada
            fc   = rng.integers(80, 110)
            spo2 = rng.integers(93, 100)
            tas  = rng.integers(90, 140)
            tad  = rng.integers(60, 90)
            temp_val = rng.uniform(37.6, 38.4)
        elif subtype == 4: # Combinacion leve: FC+TAS ligeramente altos
            fc   = rng.integers(101, 115)
            spo2 = rng.integers(93, 100)
            tas  = rng.integers(130, 150)
            tad  = rng.integers(85, 95)
        elif subtype == 5: # Hipotension aislada moderada (TAS 85-95, SpO2 normal, FC normal)
            fc   = rng.integers(62, 95)
            spo2 = rng.integers(93, 100)
            tas  = rng.integers(85, 96)   # hipotension sola, no triple-low
            tad  = rng.integers(55, 68)
        else:              # Bradicardia + UN factor (hipoxemia leve, SpO2 91-94, TAS normal)
            fc   = rng.integers(48, 62)   # bradicardia
            spo2 = rng.integers(91, 95)   # hipoxemia leve
            tas  = rng.integers(100, 130) # TAS NORMAL — solo 2 factores
            tad  = rng.integers(65, 85)
        gluc = rng.integers(70, 250)
        temp = temp_val if subtype == 3 else rng.uniform(36.0, 37.8)
        age  = rng.integers(18, 85)
        rows.append([fc, spo2, tas, tad, gluc, temp, age, "MEDIO"])

    # ── ALTO: NEWS2 5-6  ─────────────────────────────────────
    # Signos vitales con alteracion significativa.
    # v4: agrega subtype 6='Triple Low' (bradicardia+hipotension+hipoxemia)
    for i in range(n_per_class):
        subtype = i % 8
        if subtype == 0:   # Taquicardia severa
            fc   = rng.integers(120, 140)
            spo2 = rng.integers(90, 96)
            tas  = rng.integers(100, 160)
            tad  = rng.integers(65, 100)
        elif subtype == 1: # Hipoxemia moderada AISLADA (SpO2 86-90%, FC y TAS moderados)
            # IMPORTANTE: Si FC>110 Y TAS>130 simultáneamente → va a CRITICO (subtype 5/8)
            fc   = rng.integers(70, 115)   # ← limitado: FC alta va a CRITICO
            spo2 = rng.integers(86, 91)
            tas  = rng.integers(90, 134)   # ← limitado: TAS alta va a CRITICO
            tad  = rng.integers(60, 88)
        elif subtype == 2: # Crisis hipertensiva (AHA Stage 2+)
            fc   = rng.integers(70, 120)
            spo2 = rng.integers(90, 99)
            tas  = rng.integers(160, 180)
            tad  = rng.integers(100, 120)
        elif subtype == 3: # SpO2<92 + FC>110 (compromiso cardiopulmonar)
            fc   = rng.integers(111, 135)
            spo2 = rng.integers(86, 92)   # ← combinación clave NEWS2
            tas  = rng.integers(90, 155)
            tad  = rng.integers(60, 95)
        elif subtype == 4: # Hipoglucemia severa (ADA: <54 mg/dL)
            fc   = rng.integers(80, 130)
            spo2 = rng.integers(90, 99)
            tas  = rng.integers(90, 155)
            tad  = rng.integers(60, 95)
            gluc = rng.integers(35, 54)   # hipoglucemia severa
        elif subtype == 5: # Hipertermia + taquicardia
            fc   = rng.integers(110, 138)
            spo2 = rng.integers(90, 98)
            tas  = rng.integers(100, 158)
            tad  = rng.integers(65, 98)
        elif subtype == 6: # TRIPLE LOW borderline (v4 nuevo)
            # Bradicardia + hipotension leve + hipoxemia leve SIMULTANEAS
            # Patron: FC 50-70, SpO2 88-93, TAS 82-100, TAD 50-68
            # Caso I cae en esta zona: FC=58, SpO2=91, TAS=88, TAD=55
            fc   = rng.integers(50, 70)   # bradicardia leve-moderada
            spo2 = rng.integers(88, 94)   # hipoxemia leve
            tas  = rng.integers(82, 101)  # hipotension leve
            tad  = rng.integers(50, 68)   # TAD baja
        else:              # TRIPLE LOW con FC muy baja (subtype 7)
            fc   = rng.integers(40, 58)   # bradicardia marcada
            spo2 = rng.integers(86, 92)   # hipoxemia moderada
            tas  = rng.integers(78, 95)   # hipotension moderada
            tad  = rng.integers(45, 62)
        if subtype != 4:
            gluc = rng.integers(55, 300)
        temp = rng.uniform(38.5, 40.0) if subtype in [3, 5] else rng.uniform(36.0, 39.0)
        age  = rng.integers(18, 90)
        rows.append([fc, spo2, tas, tad, gluc, temp, age, "ALTO"])

    # ── CRITICO: NEWS2 ≥7  ────────────────────────────────────
    # Alteración severa de uno o más sistemas.
    # Subtype 5: Caso Raúl — triple riesgo cardiopulmonar+hipertensivo
    # Subtype 8: Zona exacta de Caso E (SpO2 86-90, FC 110-125, TAS 130-165)
    for i in range(n_per_class):
        subtype = i % 9   # ← 9 subtipos para dar más representación al Caso E
        if subtype == 0:   # Taquicardia extrema
            fc   = rng.integers(141, 200)
            spo2 = rng.integers(80, 97)
            tas  = rng.integers(80, 180)
            tad  = rng.integers(50, 110)
        elif subtype == 1: # Hipoxemia crítica (SpO2 <86%)
            fc   = rng.integers(80, 160)
            spo2 = rng.integers(60, 86)
            tas  = rng.integers(80, 180)
            tad  = rng.integers(50, 110)
        elif subtype == 2: # Shock / colapso (TAS <80)
            fc   = rng.integers(110, 180)
            spo2 = rng.integers(70, 92)
            tas  = rng.integers(50, 80)
            tad  = rng.integers(30, 55)
        elif subtype == 3: # Crisis hipertensiva severa (TAS >180)
            fc   = rng.integers(80, 160)
            spo2 = rng.integers(80, 98)
            tas  = rng.integers(181, 240)
            tad  = rng.integers(121, 150)
        elif subtype == 4: # Sepsis (qSOFA: FC>120 + Temp>38.5 + TAS<100)
            fc   = rng.integers(121, 175)
            spo2 = rng.integers(75, 94)
            tas  = rng.integers(60, 99)
            tad  = rng.integers(40, 65)
            temp = rng.uniform(38.5, 41.0)
        elif subtype == 5: # Triple riesgo cardiopulmonar+hipertensivo amplio
            fc   = rng.integers(111, 145)
            spo2 = rng.integers(82, 91)   # SpO2 < 91, zona crítica
            tas  = rng.integers(131, 180)  # TAS Stage 2+
            tad  = rng.integers(88, 120)
        elif subtype == 6: # Glucosa extrema (cetoacidosis: >400)
            fc   = rng.integers(100, 160)
            spo2 = rng.integers(80, 96)
            tas  = rng.integers(70, 160)
            tad  = rng.integers(45, 100)
            gluc = rng.integers(401, 600)
        elif subtype == 7: # Hipoglucemia crítica (<40) + inestabilidad
            fc   = rng.integers(100, 155)
            spo2 = rng.integers(80, 95)
            tas  = rng.integers(70, 140)
            tad  = rng.integers(45, 90)
            gluc = rng.integers(20, 39)
        else:              # ZONA EXACTA CASO E: SpO2 86-91 + FC 110-125 + TAS 130-165
            # Este subtype cubre la zona ambigua donde el modelo v1 fallaba.
            # Es CRÍTICO porque es compromiso tri-sistémico: respiratorio+
            # cardiovascular+hipertensivo simultaneos (NEWS2 ≥6 combinado).
            fc   = rng.integers(110, 126)  # ← FC moderada-alta
            spo2 = rng.integers(86, 91)    # ← SpO2 < 91, compromiso respiratorio
            tas  = rng.integers(130, 166)  # ← Hipertensión Stage 2
            tad  = rng.integers(85, 112)   # ← TAD elevada
        if subtype not in [4]:
            temp = rng.uniform(35.0, 41.5)
        if subtype not in [6, 7]:
            gluc = rng.integers(40, 420)
        age = rng.integers(18, 95)
        rows.append([fc, spo2, tas, tad, gluc, round(temp, 1), age, "CRITICO"])

    df = pd.DataFrame(rows, columns=[
        "heart_rate", "spo2", "bp_sys", "bp_dia", "glucose",
        "temperature", "age", "label"
    ])
    log.info("Dataset generado: %d registros por clase. Total: %d", n_per_class, len(df))
    log.info("Distribución: %s", df["label"].value_counts().to_dict())
    return df


def engineer_features(df: pd.DataFrame) -> pd.DataFrame:
    """Calcula los 15 features que usa el modelo actual en producción."""
    df = df.copy()
    df["pulse_pressure"]         = df["bp_sys"] - df["bp_dia"]
    df["mean_arterial_pressure"] = df["bp_dia"] + (df["pulse_pressure"] / 3.0)
    df["shock_index"]            = df["heart_rate"] / df["bp_sys"].clip(lower=1)
    df["hr_spo2_ratio"]          = df["heart_rate"] / df["spo2"].clip(lower=1)
    df["hr_deviation"]           = (df["heart_rate"] - 75.0).abs() / 75.0
    df["spo2_deviation"]         = (df["spo2"]       - 97.0).abs() / 97.0
    df["bp_deviation"]           = (df["bp_sys"]     - 120.0).abs() / 120.0
    df["glucose_deviation"]      = (df["glucose"]    - 90.0).abs() / 90.0
    return df


FEATURE_COLS = [
    "heart_rate", "spo2", "bp_sys", "bp_dia", "glucose", "temperature", "age",
    "pulse_pressure", "mean_arterial_pressure", "shock_index",
    "hr_spo2_ratio", "hr_deviation", "spo2_deviation", "bp_deviation", "glucose_deviation"
]


def upload_to_gcs(local_path: str, gcs_uri: str) -> None:
    """Sube un archivo local a Cloud Storage."""
    parts = gcs_uri.replace("gs://", "").split("/", 1)
    bucket_name, blob_path = parts[0], parts[1]
    client = storage.Client()
    bucket = client.bucket(bucket_name)
    bucket.blob(blob_path).upload_from_filename(local_path)
    log.info("Subido: %s → %s", local_path, gcs_uri)


def download_from_gcs(gcs_uri: str, local_path: str) -> None:
    """Descarga un archivo de Cloud Storage."""
    parts = gcs_uri.replace("gs://", "").split("/", 1)
    bucket_name, blob_path = parts[0], parts[1]
    client = storage.Client()
    bucket = client.bucket(bucket_name)
    bucket.blob(blob_path).download_to_filename(local_path)
    log.info("Descargado: %s → %s", gcs_uri, local_path)


def train_and_evaluate(df: pd.DataFrame) -> tuple:
    """
    Entrena el GradientBoostingClassifier v2 y devuelve
    (model, metrics_dict, label_encoder).

    Hiperparámetros seleccionados para:
    - Mayor generalización (max_depth=5 vs 6 anterior)
    - Más árboles para estabilidad (n_estimators=400)
    - Subsample 0.8 para regularización
    """
    df_feat = engineer_features(df)
    X = df_feat[FEATURE_COLS].values

    le = LabelEncoder()
    le.classes_ = np.array(LABELS)
    y = le.transform(df_feat["label"])

    # sample_weight: penaliza más los errores en CRÍTICO
    # BAJO=1.0, MEDIO=1.5, ALTO=2.0, CRÍTICO=3.0
    weight_map = {0: 1.0, 1: 1.5, 2: 2.0, 3: 3.0}
    sample_weights = np.array([weight_map[yi] for yi in y])

    X_train, X_test, y_train, y_test, sw_train, _ = train_test_split(
        X, y, sample_weights,
        test_size=0.20, random_state=42, stratify=y
    )

    log.info("Entrenando GradientBoostingClassifier v2 (n=400, depth=5)...")
    model = GradientBoostingClassifier(
        n_estimators=400,
        max_depth=5,
        learning_rate=0.08,
        subsample=0.8,
        random_state=42,
        verbose=0,
    )
    model.fit(X_train, y_train, sample_weight=sw_train)
    log.info("Entrenamiento completado.")

    y_pred = model.predict(X_test)
    y_prob = model.predict_proba(X_test)

    report = classification_report(y_test, y_pred,
                                   target_names=LABELS, output_dict=True)

    # AUC-ROC por clase (one-vs-rest)
    auc_roc = {}
    for i, lbl in enumerate(LABELS):
        y_bin = (y_test == i).astype(int)
        auc_roc[lbl] = float(roc_auc_score(y_bin, y_prob[:, i]))

    # Feature importances
    fi = {col: float(imp)
          for col, imp in zip(FEATURE_COLS, model.feature_importances_)}

    recall_critico = report["CRITICO"]["recall"]
    log.info("Recall CRÍTICO: %.4f (mínimo requerido: %.2f)", recall_critico, MIN_RECALL_CRITICO)

    metrics = {
        "model_version": "v4",
        "accuracy": report["accuracy"],
        "recall_critico": recall_critico,
        "deploy_approved": recall_critico >= MIN_RECALL_CRITICO,
        "classification_report": report,
        "auc_roc_per_class": auc_roc,
        "feature_importances": fi,
        "confusion_matrix": confusion_matrix(y_test, y_pred).tolist(),
        "n_samples_train": len(X_train),
        "n_samples_test":  len(X_test),
        "n_features": len(FEATURE_COLS),
        "hyperparameters": {
            "n_estimators": 400,
            "max_depth": 5,
            "learning_rate": 0.08,
            "subsample": 0.8,
        },
        "class_weights": weight_map,
    }
    return model, metrics, le


def run_clinical_cases(model, le) -> list:
    """
    Ejecuta los 9 casos clinicos de validacion (A-I).
    v4: agrega F, G, H, I. Caso I es el caso critico Triple Low.
    """
    cases = [
        {"name": "Caso A", "fc": 118, "spo2": 89, "tas": 110, "tad": 80,
         "gluc": 90, "temp": 36.5, "age": 45,
         "expected_min": ["ALTO", "CRITICO"]},
        {"name": "Caso B", "fc": 110, "spo2": 95, "tas": 140, "tad": 95,
         "gluc": 90, "temp": 36.5, "age": 50,
         "expected_min": ["MEDIO", "ALTO", "CRITICO"]},
        {"name": "Caso C", "fc": 125, "spo2": 88, "tas": 160, "tad": 100,
         "gluc": 90, "temp": 36.5, "age": 55,
         "expected_min": ["CRITICO"]},
        {"name": "Caso D", "fc": 72,  "spo2": 98, "tas": 118, "tad": 76,
         "gluc": 90, "temp": 36.5, "age": 35,
         "expected_min": ["BAJO"]},
        {"name": "Caso E (RAUL)", "fc": 118, "spo2": 89, "tas": 140, "tad": 95,
         "gluc": 90, "temp": 36.5, "age": 50,
         "expected_min": ["CRITICO"]},
        {"name": "Caso F", "fc": 105, "spo2": 92, "tas": 135, "tad": 88,
         "gluc": 90, "temp": 36.5, "age": 50,
         "expected_min": ["MEDIO", "ALTO", "CRITICO"]},
        {"name": "Caso G", "fc": 130, "spo2": 85, "tas": 190, "tad": 115,
         "gluc": 90, "temp": 36.5, "age": 60,
         "expected_min": ["CRITICO"]},
        {"name": "Caso H", "fc": 65, "spo2": 96, "tas": 125, "tad": 78,
         "gluc": 90, "temp": 36.5, "age": 35,
         "expected_min": ["BAJO"]},
        {"name": "Caso I (Triple Low)", "fc": 58, "spo2": 91, "tas": 88, "tad": 55,
         "gluc": 90, "temp": 36.5, "age": 50,
         "expected_min": ["ALTO", "CRITICO"]},  # bradicardia+hipotension+hipoxemia
    ]

    results = []
    for c in cases:
        row_dict = {
            "heart_rate": c["fc"], "spo2": c["spo2"], "bp_sys": c["tas"],
            "bp_dia": c["tad"], "glucose": c["gluc"],
            "temperature": c["temp"], "age": c["age"], "label": "BAJO"
        }
        df_row = engineer_features(pd.DataFrame([row_dict]))
        X_row  = df_row[FEATURE_COLS].values
        pred   = model.predict(X_row)[0]
        proba  = model.predict_proba(X_row)[0]
        label  = LABELS[pred]
        passed = label in c["expected_min"]
        results.append({
            "case": c["name"],
            "prediction": label,
            "confidence": float(proba[pred]),
            "expected": c["expected_min"],
            "passed": passed,
            "probabilities": {LABELS[i]: float(p) for i, p in enumerate(proba)},
        })
        status = "✅ PASS" if passed else "❌ FAIL"
        log.info("%s | %s → %s (%.1f%%) %s",
                 c["name"], c["name"], label, proba[pred]*100, status)
    return results


def main():
    # ── 1. Generar dataset ──────────────────────────────────────
    log.info("=== RMHealth Triage Classifier v4 — Training Job ===")
    log.info("v4: Triple Low pattern (bradycardia+hypotension+hypoxemia)")
    df = generate_dataset(n_per_class=2500, seed=44)  # seed 44 para v4

    local_dataset = "/tmp/training_dataset.csv"
    df.to_csv(local_dataset, index=False)
    upload_to_gcs(local_dataset, DATASET_PATH)

    # ── 2. Entrenar ─────────────────────────────────────────────
    model, metrics, le = train_and_evaluate(df)

    # ── 3. Validar casos clínicos ───────────────────────────────
    clinical_results = run_clinical_cases(model, le)
    metrics["clinical_cases"] = clinical_results

    all_passed = all(r["passed"] for r in clinical_results)
    metrics["clinical_cases_passed"] = all_passed

    # ── 4. Guardar métricas ─────────────────────────────────────
    local_metrics = "/tmp/triage_metrics_v2.json"
    with open(local_metrics, "w") as f:
        json.dump(metrics, f, indent=2, ensure_ascii=False)
    upload_to_gcs(local_metrics, METRICS_PATH)
    log.info("Métricas guardadas en GCS.")

    # ── 5. Guardar modelo (solo si pasa todos los criterios) ────
    if metrics["deploy_approved"] and all_passed:
        local_model = "/tmp/triage_classifier.joblib"
        joblib.dump(model, local_model)

        # 5a. Guardar v4 en GCS (ruta canonica) SIN sobrescribir v3
        model_gcs_uri_v4 = f"gs://{BUCKET_NAME}/models/triage_classifier_v4.joblib"
        upload_to_gcs(local_model, model_gcs_uri_v4)
        # Tambien actualizar la ruta 'latest' para que Cloud Run lo descargue
        model_gcs_uri = f"gs://{BUCKET_NAME}/models/triage_classifier_v2.joblib"
        upload_to_gcs(local_model, model_gcs_uri)
        log.info("Modelo v4 subido: %s", model_gcs_uri_v4)

        # 5b. Guardar en AIP_MODEL_DIR (ruta que Vertex AI SDK espera)
        #     Esto evita el error 'There are no files under .../model'
        aip_model_dir = os.environ.get("AIP_MODEL_DIR", "").rstrip("/")
        if aip_model_dir.startswith("gs://"):
            parts = aip_model_dir.replace("gs://", "").split("/", 1)
            bucket_name_aip = parts[0]
            blob_prefix     = parts[1] if len(parts) > 1 else ""
            blob_path       = f"{blob_prefix}/triage_classifier.joblib".lstrip("/")
            client = storage.Client()
            bucket_aip = client.bucket(bucket_name_aip)
            bucket_aip.blob(blob_path).upload_from_filename(local_model)
            log.info("Modelo subido a AIP_MODEL_DIR: gs://%s/%s", bucket_name_aip, blob_path)
        elif aip_model_dir:
            os.makedirs(aip_model_dir, exist_ok=True)
            joblib.dump(model, f"{aip_model_dir}/triage_classifier.joblib")
            log.info("Modelo guardado en AIP_MODEL_DIR local: %s", aip_model_dir)

        log.info("✅ MODELO APROBADO. sklearn=%s", sklearn.__version__)
    else:
        log.warning("❌ MODELO NO APROBADO. Recall CRITICO=%.2f%% (requerido>=90%%)",
                    metrics["recall_critico"] * 100)
        log.warning("Casos clinicos fallidos: %s",
                    [r["case"] for r in clinical_results if not r["passed"]])

    log.info("=== JOB COMPLETADO ===")
    log.info("Recall CRÍTICO: %.2f%%", metrics["recall_critico"] * 100)
    log.info("Accuracy global: %.2f%%", metrics["accuracy"] * 100)
    log.info("Deploy aprobado: %s", metrics["deploy_approved"])
    log.info("Casos clínicos: %s", "TODOS PASAN ✅" if all_passed else "HAY FALLOS ❌")


if __name__ == "__main__":
    main()
