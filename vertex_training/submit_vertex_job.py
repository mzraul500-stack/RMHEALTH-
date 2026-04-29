"""
submit_vertex_job.py — Lanza el training job en Vertex AI Custom Training
y descarga los artefactos (modelo + métricas) al terminar.

Uso: python vertex_training/submit_vertex_job.py

© 2025-2026 MORALES ZEPEDA RAUL
"""

import json
import logging
import os
import tempfile
from pathlib import Path

from google.cloud import aiplatform, storage

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger("RMHealth.SubmitJob")

# ── Config ──────────────────────────────────────────────────────
PROJECT      = "rmhealth-494123"
REGION       = "us-central1"
BUCKET       = "rmhealth-training-artifacts"
DISPLAY_NAME = "rmhealth-triage-v2"
SCRIPT_PATH  = str(Path(__file__).parent / "trainer" / "task.py")

MODEL_LOCAL_PATHS = [
    Path("h:/RMHEALTH/models/triage_classifier.joblib"),
    Path("h:/RMHEALTH/backend/models/triage_classifier.joblib"),
]
METRICS_LOCAL_PATH = Path("h:/RMHEALTH/models/triage_metrics.json")

def download_artifact(bucket_name: str, blob_path: str, local_path: Path) -> bool:
    """Descarga un artefacto de GCS. Retorna True si lo encontró."""
    try:
        client = storage.Client(project=PROJECT)
        bucket = client.bucket(bucket_name)
        blob = bucket.blob(blob_path)
        if not blob.exists():
            log.warning("Artefacto no encontrado en GCS: gs://%s/%s", bucket_name, blob_path)
            return False
        local_path.parent.mkdir(parents=True, exist_ok=True)
        blob.download_to_filename(str(local_path))
        log.info("Descargado: gs://%s/%s → %s", bucket_name, blob_path, local_path)
        return True
    except Exception as e:
        log.error("Error descargando %s: %s", blob_path, e)
        return False


def main():
    log.info("=== Iniciando Vertex AI Custom Training Job ===")
    log.info("Proyecto: %s | Región: %s", PROJECT, REGION)
    log.info("Script: %s", SCRIPT_PATH)

    aiplatform.init(project=PROJECT, location=REGION, staging_bucket=f"gs://{BUCKET}")

    job = aiplatform.CustomTrainingJob(
        display_name=DISPLAY_NAME,
        script_path=SCRIPT_PATH,
        container_uri="us-docker.pkg.dev/vertex-ai/training/sklearn-cpu.1-0:latest",
        requirements=[
            "scikit-learn==1.6.1",   # must match production backend
            "pandas==2.2.2",
            "google-cloud-storage==2.16.0",
        ],
        # Sin model_serving_container_image_uri: no necesitamos Model Registry.
        # Descargamos el .joblib directamente de GCS al terminar.
    )

    log.info("Job creado. Lanzando entrenamiento...")
    log.info("(Esto tomara ~5-8 minutos. Puedes seguirlo en: "
             "https://console.cloud.google.com/vertex-ai/training/custom-jobs?project=%s)", PROJECT)

    job.run(
        replica_count=1,
        machine_type="n1-standard-4",
        environment_variables={
            "AIP_BUCKET": BUCKET,
            "AIP_MODEL_DIR": f"gs://{BUCKET}/models/",
        },
        sync=True,
        create_request_timeout=None,
    )

    log.info("=== Job terminado. Estado: %s ===", job.state)

    # ── Descargar artefactos ─────────────────────────────────────
    log.info("Descargando modelo y métricas...")

    model_ok = download_artifact(
        BUCKET, "models/triage_classifier_v2.joblib",
        Path(tempfile.mktemp(suffix=".joblib"))
    )

    metrics_ok = download_artifact(
        BUCKET, "metrics/triage_metrics_v2.json",
        METRICS_LOCAL_PATH
    )

    if metrics_ok:
        with open(METRICS_LOCAL_PATH) as f:
            metrics = json.load(f)

        log.info("")
        log.info("════════════════════════════════════════════")
        log.info("   RESULTADOS DEL ENTRENAMIENTO v2")
        log.info("════════════════════════════════════════════")
        log.info("Accuracy global:  %.2f%%", metrics["accuracy"] * 100)
        log.info("Recall CRÍTICO:   %.2f%% (mínimo requerido: 90%%)",
                 metrics["recall_critico"] * 100)
        log.info("Deploy aprobado:  %s",
                 "✅ SÍ" if metrics["deploy_approved"] else "❌ NO — NO SE DESPLIEGA")
        log.info("")

        cr = metrics["classification_report"]
        log.info("Métricas por clase:")
        for lbl in ["BAJO", "MEDIO", "ALTO", "CRITICO"]:
            d = cr[lbl]
            log.info("  %-8s Precision=%.1f%%  Recall=%.1f%%  F1=%.1f%%",
                     lbl, d["precision"]*100, d["recall"]*100, d["f1-score"]*100)

        log.info("")
        log.info("Casos clínicos de Raúl:")
        for case in metrics.get("clinical_cases", []):
            status = "✅ PASS" if case["passed"] else "❌ FAIL"
            log.info("  %s | Predicción: %-8s | Esperado: %-20s | %s",
                     case["case"], case["prediction"],
                     str(case["expected"]), status)

        if metrics["deploy_approved"] and metrics.get("clinical_cases_passed"):
            log.info("")
            log.info("✅ TODOS LOS CRITERIOS CUMPLIDOS — LISTO PARA DEPLOY")

            # Descargar y copiar el modelo a las rutas de producción
            tmp_model = Path(tempfile.mktemp(suffix=".joblib"))
            if download_artifact(BUCKET, "models/triage_classifier_v2.joblib", tmp_model):
                for dest in MODEL_LOCAL_PATHS:
                    dest.parent.mkdir(parents=True, exist_ok=True)
                    import shutil
                    shutil.copy2(str(tmp_model), str(dest))
                    log.info("Modelo copiado a: %s", dest)
                log.info("✅ Modelos locales actualizados. Listo para deploy a Cloud Run.")
            else:
                log.error("No se pudo descargar el modelo v2 de GCS.")
        else:
            log.warning("❌ No se despliega. Verifica los criterios fallidos arriba.")
    else:
        log.error("No se pudieron descargar las métricas. Revisa los logs del job.")

    log.info("Console del job: https://console.cloud.google.com/vertex-ai/training/custom-jobs?project=%s", PROJECT)


if __name__ == "__main__":
    main()
