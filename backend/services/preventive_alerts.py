"""
PreventiveAlertService — Módulo de Alertas Preventivas por Usuario
RMHealth © 2025 MORALES ZEPEDA RAUL

Este módulo es heurístico y está en fase de validación clínica.
No sustituye diagnóstico médico, juicio clínico ni protocolos hospitalarios.
Las alertas generadas son de carácter informativo y preventivo.
"""

import logging
import uuid
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Tuple
from pydantic import BaseModel, Field

logger = logging.getLogger("RMHealth.PreventiveAlerts")

# ── Configuration ──────────────────────────────────────────────────────────
# Time windows for trend analysis (in minutes)
WINDOW_SHORT = 15       # 15 minutes
WINDOW_MEDIUM = 120     # 2 hours
WINDOW_LONG = 1440      # 24 hours

# Minimum number of readings required per window to generate alerts
MIN_READINGS_SHORT = 3
MIN_READINGS_MEDIUM = 5
MIN_READINGS_LONG = 10

# Anti-spam: same alert type + metric + severity cannot repeat within this window
DEDUP_WINDOW_MINUTES = 30

# ── Thresholds (Pesos heurísticos sujetos a validación médica) ─────────────
# Heart Rate
HR_ELEVATED_THRESHOLD = 100       # Sustained above this = alert
HR_LOW_THRESHOLD = 55             # Sustained below this = alert
HR_DELTA_SIGNIFICANT = 20         # Deviation from personal baseline

# Blood Pressure
SYS_ELEVATED_THRESHOLD = 135      # Sustained systolic above this
SYS_LOW_THRESHOLD = 95            # Sustained systolic below this
DIA_ELEVATED_THRESHOLD = 85       # Sustained diastolic above this
BP_TREND_DELTA = 15               # Rising trend threshold

# SpO2
SPO2_LOW_THRESHOLD = 93           # Sustained below this
SPO2_DECLINE_DELTA = 3            # Progressive decline threshold

# Glucose (Manual input — ADA-informed but NOT diagnostic)
GLUCOSE_LOW_THRESHOLD = 75        # Repeated low values
GLUCOSE_HIGH_THRESHOLD = 160      # Repeated high values
GLUCOSE_DELTA_SIGNIFICANT = 30    # Deviation from personal baseline


# ── Models ─────────────────────────────────────────────────────────────────

class VitalReading(BaseModel):
    """A single vital sign reading with timestamp and source"""
    user_id: str
    heart_rate: Optional[int] = None
    spo2: Optional[int] = None
    systolic: Optional[int] = None
    diastolic: Optional[int] = None
    glucose: Optional[float] = None
    source: str = "unknown"  # "manual" | "health_connect" | "unknown"
    timestamp: datetime = Field(default_factory=datetime.utcnow)


class PreventiveAlert(BaseModel):
    """Structure for a single preventive alert"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    alert_type: str = "preventive"
    severity: str  # LOW | MEDIUM | HIGH
    metric: str    # heart_rate | systolic | diastolic | spo2 | glucose
    title: str
    message: str
    recommendation: str
    requires_human_review: bool = False
    created_at: datetime = Field(default_factory=datetime.utcnow)
    data_window: str  # "15m" | "2h" | "24h"
    baseline_value: float = 0
    current_value: float = 0
    delta: float = 0
    source: str = "unknown"


class PreventiveAnalysisResult(BaseModel):
    """Result of a preventive trend analysis for a user"""
    user_id: str
    alerts: List[PreventiveAlert] = []
    insufficient_data: bool = False
    metrics_analyzed: List[str] = []
    analysis_timestamp: datetime = Field(default_factory=datetime.utcnow)


# ── Message Templates ──────────────────────────────────────────────────────

MESSAGES = {
    "heart_rate_elevated": {
        "title": "Frecuencia cardíaca por encima de lo habitual",
        "message": (
            "Tu frecuencia cardíaca se ha mantenido más alta de lo habitual "
            "durante los últimos {window}. Esto puede deberse a actividad física, "
            "estrés u otros factores."
        ),
        "recommendation": (
            "Te recomendamos descansar, hidratarte y seguir monitoreando. "
            "Si presentas síntomas, consulta a un profesional de salud."
        ),
    },
    "heart_rate_low": {
        "title": "Frecuencia cardíaca por debajo de lo habitual",
        "message": (
            "Tu frecuencia cardíaca se ha mantenido más baja de lo habitual "
            "durante los últimos {window}."
        ),
        "recommendation": (
            "Si no estás en reposo profundo o no eres deportista de alto rendimiento, "
            "considera monitorear con mayor frecuencia. Consulta a un profesional si presentas mareos o fatiga."
        ),
    },
    "systolic_rising": {
        "title": "Posible tendencia ascendente en presión arterial",
        "message": (
            "Tu presión arterial sistólica muestra una tendencia ascendente "
            "en los últimos {window}. Esto puede estar relacionado con estrés, "
            "alimentación, actividad física u otros factores."
        ),
        "recommendation": (
            "Te recomendamos descansar, reducir el consumo de sodio y seguir monitoreando. "
            "Si persiste, consulta a un profesional de salud."
        ),
    },
    "systolic_elevated_repeated": {
        "title": "Presión arterial elevada en varias mediciones",
        "message": (
            "Se han detectado varias mediciones de presión arterial sistólica por encima "
            "de tu rango habitual durante los últimos {window}."
        ),
        "recommendation": (
            "Monitoreo recomendado. Si estás en tratamiento antihipertensivo, "
            "verifica tu adherencia. Consulta a tu médico si persiste."
        ),
    },
    "diastolic_elevated_repeated": {
        "title": "Presión diastólica elevada en varias mediciones",
        "message": (
            "Se han detectado varias mediciones de presión arterial diastólica por encima "
            "de tu rango habitual durante los últimos {window}."
        ),
        "recommendation": (
            "Monitoreo recomendado. Consulta a un profesional de salud si presentas "
            "dolor de cabeza, visión borrosa u otros síntomas."
        ),
    },
    "spo2_declining": {
        "title": "Posible descenso progresivo en oxigenación",
        "message": (
            "Tu saturación de oxígeno muestra un descenso progresivo "
            "en los últimos {window}. Esto podría estar relacionado con "
            "la altitud, actividad física intensa u otros factores."
        ),
        "recommendation": (
            "Te recomendamos descansar en un lugar ventilado y seguir monitoreando. "
            "Si presentas dificultad para respirar, consulta de inmediato a un profesional de salud."
        ),
    },
    "spo2_low_sustained": {
        "title": "Saturación de oxígeno por debajo de lo habitual",
        "message": (
            "Tu saturación de oxígeno se ha mantenido por debajo de lo habitual "
            "durante los últimos {window}."
        ),
        "recommendation": (
            "Monitoreo recomendado. Si presentas dificultad para respirar, "
            "fatiga inusual o coloración azulada, busca atención médica."
        ),
    },
    "glucose_low_repeated": {
        "title": "Posible valor bajo de glucosa en varias mediciones",
        "message": (
            "Tus registros manuales de glucosa muestran valores por debajo de tu "
            "rango habitual en los últimos {window}. Este dato fue ingresado manualmente "
            "y puede depender de comida, medicamentos, ejercicio u otros factores."
        ),
        "recommendation": (
            "Te recomendamos seguir monitoreando y consultar a un profesional "
            "de salud si presentas síntomas como temblor, sudoración o mareo."
        ),
    },
    "glucose_high_repeated": {
        "title": "Posible valor elevado de glucosa en varias mediciones",
        "message": (
            "Tu registro de glucosa muestra valores fuera de tu rango habitual. "
            "Este dato fue ingresado manualmente y puede depender de comida, "
            "medicamentos, ejercicio u otros factores."
        ),
        "recommendation": (
            "Te recomendamos seguir monitoreando y consultar a un profesional "
            "de salud si presentas síntomas."
        ),
    },
    "glucose_abnormal_variation": {
        "title": "Variación inusual en registros de glucosa",
        "message": (
            "Tus registros recientes de glucosa muestran una variación significativa "
            "respecto a tu promedio personal en los últimos {window}."
        ),
        "recommendation": (
            "Monitoreo recomendado. Considera factores como alimentación, "
            "medicamentos y actividad física. Consulta a tu médico si persiste."
        ),
    },
}


# ── Core Service ───────────────────────────────────────────────────────────

class PreventiveAlertService:
    """
    Servicio de Alertas Preventivas por Usuario.
    
    Este servicio es heurístico y está en fase de validación clínica.
    No sustituye diagnóstico médico, juicio clínico ni protocolos hospitalarios.
    Las alertas generadas son de carácter informativo y preventivo.
    """

    @staticmethod
    def analyze_user_trends(
        user_id: str,
        readings: List[VitalReading],
        recent_alerts: Optional[List[Dict]] = None,
    ) -> PreventiveAnalysisResult:
        """
        Analyze vital sign trends for a specific user and generate
        preventive alerts when patterns of risk are detected.
        
        Args:
            user_id: The user whose data to analyze.
            readings: Historical vital sign readings, most recent last.
            recent_alerts: Previously generated alerts (for deduplication).
            
        Returns:
            PreventiveAnalysisResult with any generated alerts.
        """
        now = datetime.utcnow()
        result = PreventiveAnalysisResult(user_id=user_id)

        if not readings or len(readings) < MIN_READINGS_SHORT:
            result.insufficient_data = True
            logger.info(f"[{user_id}] Insufficient data for preventive analysis ({len(readings)} readings)")
            return result

        recent_alerts = recent_alerts or []

        # Partition readings into time windows
        windows = {
            "15m": [r for r in readings if (now - r.timestamp).total_seconds() <= WINDOW_SHORT * 60],
            "2h":  [r for r in readings if (now - r.timestamp).total_seconds() <= WINDOW_MEDIUM * 60],
            "24h": [r for r in readings if (now - r.timestamp).total_seconds() <= WINDOW_LONG * 60],
        }

        all_alerts: List[PreventiveAlert] = []

        # Analyze each metric
        all_alerts.extend(PreventiveAlertService._analyze_heart_rate(user_id, windows, recent_alerts))
        result.metrics_analyzed.append("heart_rate")

        all_alerts.extend(PreventiveAlertService._analyze_blood_pressure(user_id, windows, recent_alerts))
        result.metrics_analyzed.append("systolic")
        result.metrics_analyzed.append("diastolic")

        all_alerts.extend(PreventiveAlertService._analyze_spo2(user_id, windows, recent_alerts))
        result.metrics_analyzed.append("spo2")

        all_alerts.extend(PreventiveAlertService._analyze_glucose(user_id, windows, recent_alerts))
        result.metrics_analyzed.append("glucose")

        result.alerts = all_alerts
        logger.info(f"[{user_id}] Preventive analysis complete: {len(all_alerts)} alerts generated")
        return result

    # ── Heart Rate Analysis ────────────────────────────────────────────

    @staticmethod
    def _analyze_heart_rate(
        user_id: str,
        windows: Dict[str, List[VitalReading]],
        recent_alerts: List[Dict],
    ) -> List[PreventiveAlert]:
        alerts = []

        for window_key, min_readings in [("15m", MIN_READINGS_SHORT), ("2h", MIN_READINGS_MEDIUM), ("24h", MIN_READINGS_LONG)]:
            readings = windows.get(window_key, [])
            hr_values = [r.heart_rate for r in readings if r.heart_rate is not None]

            if len(hr_values) < min_readings:
                continue

            avg = sum(hr_values) / len(hr_values)
            current = hr_values[-1]

            # Sustained elevation
            elevated_count = sum(1 for v in hr_values if v > HR_ELEVATED_THRESHOLD)
            if elevated_count >= len(hr_values) * 0.6:
                if not PreventiveAlertService._is_duplicate(recent_alerts, user_id, "heart_rate", "MEDIUM", window_key):
                    tmpl = MESSAGES["heart_rate_elevated"]
                    window_label = PreventiveAlertService._window_label(window_key)
                    alerts.append(PreventiveAlert(
                        user_id=user_id,
                        severity="MEDIUM",
                        metric="heart_rate",
                        title=tmpl["title"],
                        message=tmpl["message"].format(window=window_label),
                        recommendation=tmpl["recommendation"],
                        data_window=window_key,
                        baseline_value=round(avg, 1),
                        current_value=current,
                        delta=round(current - avg, 1),
                    ))

            # Sustained low
            low_count = sum(1 for v in hr_values if v < HR_LOW_THRESHOLD)
            if low_count >= len(hr_values) * 0.6:
                if not PreventiveAlertService._is_duplicate(recent_alerts, user_id, "heart_rate", "LOW", window_key):
                    tmpl = MESSAGES["heart_rate_low"]
                    window_label = PreventiveAlertService._window_label(window_key)
                    alerts.append(PreventiveAlert(
                        user_id=user_id,
                        severity="LOW",
                        metric="heart_rate",
                        title=tmpl["title"],
                        message=tmpl["message"].format(window=window_label),
                        recommendation=tmpl["recommendation"],
                        data_window=window_key,
                        baseline_value=round(avg, 1),
                        current_value=current,
                        delta=round(current - avg, 1),
                    ))

            # Abnormal deviation from personal average
            if abs(current - avg) >= HR_DELTA_SIGNIFICANT:
                severity = "HIGH" if abs(current - avg) >= HR_DELTA_SIGNIFICANT * 1.5 else "MEDIUM"
                if not PreventiveAlertService._is_duplicate(recent_alerts, user_id, "heart_rate", severity, window_key):
                    tmpl = MESSAGES["heart_rate_elevated"]
                    window_label = PreventiveAlertService._window_label(window_key)
                    alerts.append(PreventiveAlert(
                        user_id=user_id,
                        severity=severity,
                        metric="heart_rate",
                        title="Variación inusual en frecuencia cardíaca",
                        message=f"Tu frecuencia cardíaca actual ({current} bpm) se desvía significativamente de tu promedio reciente ({avg:.0f} bpm) en los últimos {window_label}.",
                        recommendation=tmpl["recommendation"],
                        requires_human_review=(severity == "HIGH"),
                        data_window=window_key,
                        baseline_value=round(avg, 1),
                        current_value=current,
                        delta=round(current - avg, 1),
                    ))

        return alerts

    # ── Blood Pressure Analysis ────────────────────────────────────────

    @staticmethod
    def _analyze_blood_pressure(
        user_id: str,
        windows: Dict[str, List[VitalReading]],
        recent_alerts: List[Dict],
    ) -> List[PreventiveAlert]:
        alerts = []

        for window_key, min_readings in [("15m", MIN_READINGS_SHORT), ("2h", MIN_READINGS_MEDIUM), ("24h", MIN_READINGS_LONG)]:
            readings = windows.get(window_key, [])
            sys_values = [r.systolic for r in readings if r.systolic is not None]
            dia_values = [r.diastolic for r in readings if r.diastolic is not None]

            if len(sys_values) < min_readings:
                continue

            sys_avg = sum(sys_values) / len(sys_values)
            sys_current = sys_values[-1]
            dia_avg = sum(dia_values) / len(dia_values) if dia_values else 0
            dia_current = dia_values[-1] if dia_values else 0

            window_label = PreventiveAlertService._window_label(window_key)

            # Systolic rising trend
            if len(sys_values) >= 3:
                trend_delta = sys_values[-1] - sys_values[0]
                if trend_delta >= BP_TREND_DELTA:
                    if not PreventiveAlertService._is_duplicate(recent_alerts, user_id, "systolic", "MEDIUM", window_key):
                        tmpl = MESSAGES["systolic_rising"]
                        alerts.append(PreventiveAlert(
                            user_id=user_id,
                            severity="MEDIUM",
                            metric="systolic",
                            title=tmpl["title"],
                            message=tmpl["message"].format(window=window_label),
                            recommendation=tmpl["recommendation"],
                            data_window=window_key,
                            baseline_value=round(sys_avg, 1),
                            current_value=sys_current,
                            delta=round(trend_delta, 1),
                        ))

            # Systolic elevated repeated
            elevated_sys = sum(1 for v in sys_values if v >= SYS_ELEVATED_THRESHOLD)
            if elevated_sys >= len(sys_values) * 0.5:
                severity = "HIGH" if sys_current >= 150 else "MEDIUM"
                if not PreventiveAlertService._is_duplicate(recent_alerts, user_id, "systolic", severity, window_key):
                    tmpl = MESSAGES["systolic_elevated_repeated"]
                    alerts.append(PreventiveAlert(
                        user_id=user_id,
                        severity=severity,
                        metric="systolic",
                        title=tmpl["title"],
                        message=tmpl["message"].format(window=window_label),
                        recommendation=tmpl["recommendation"],
                        requires_human_review=(severity == "HIGH"),
                        data_window=window_key,
                        baseline_value=round(sys_avg, 1),
                        current_value=sys_current,
                        delta=round(sys_current - sys_avg, 1),
                    ))

            # Diastolic elevated repeated
            if dia_values:
                elevated_dia = sum(1 for v in dia_values if v >= DIA_ELEVATED_THRESHOLD)
                if elevated_dia >= len(dia_values) * 0.5:
                    if not PreventiveAlertService._is_duplicate(recent_alerts, user_id, "diastolic", "MEDIUM", window_key):
                        tmpl = MESSAGES["diastolic_elevated_repeated"]
                        alerts.append(PreventiveAlert(
                            user_id=user_id,
                            severity="MEDIUM",
                            metric="diastolic",
                            title=tmpl["title"],
                            message=tmpl["message"].format(window=window_label),
                            recommendation=tmpl["recommendation"],
                            data_window=window_key,
                            baseline_value=round(dia_avg, 1),
                            current_value=dia_current,
                            delta=round(dia_current - dia_avg, 1),
                        ))

        return alerts

    # ── SpO2 Analysis ──────────────────────────────────────────────────

    @staticmethod
    def _analyze_spo2(
        user_id: str,
        windows: Dict[str, List[VitalReading]],
        recent_alerts: List[Dict],
    ) -> List[PreventiveAlert]:
        alerts = []

        for window_key, min_readings in [("15m", MIN_READINGS_SHORT), ("2h", MIN_READINGS_MEDIUM), ("24h", MIN_READINGS_LONG)]:
            readings = windows.get(window_key, [])
            spo2_values = [r.spo2 for r in readings if r.spo2 is not None]

            if len(spo2_values) < min_readings:
                continue

            avg = sum(spo2_values) / len(spo2_values)
            current = spo2_values[-1]
            window_label = PreventiveAlertService._window_label(window_key)

            # Progressive decline
            if len(spo2_values) >= 3:
                decline = spo2_values[0] - spo2_values[-1]
                if decline >= SPO2_DECLINE_DELTA:
                    severity = "HIGH" if decline >= SPO2_DECLINE_DELTA * 2 else "MEDIUM"
                    if not PreventiveAlertService._is_duplicate(recent_alerts, user_id, "spo2", severity, window_key):
                        tmpl = MESSAGES["spo2_declining"]
                        alerts.append(PreventiveAlert(
                            user_id=user_id,
                            severity=severity,
                            metric="spo2",
                            title=tmpl["title"],
                            message=tmpl["message"].format(window=window_label),
                            recommendation=tmpl["recommendation"],
                            requires_human_review=(severity == "HIGH"),
                            data_window=window_key,
                            baseline_value=round(avg, 1),
                            current_value=current,
                            delta=round(-decline, 1),
                        ))

            # Sustained low
            low_count = sum(1 for v in spo2_values if v < SPO2_LOW_THRESHOLD)
            if low_count >= len(spo2_values) * 0.5:
                if not PreventiveAlertService._is_duplicate(recent_alerts, user_id, "spo2", "HIGH", window_key):
                    tmpl = MESSAGES["spo2_low_sustained"]
                    alerts.append(PreventiveAlert(
                        user_id=user_id,
                        severity="HIGH",
                        metric="spo2",
                        title=tmpl["title"],
                        message=tmpl["message"].format(window=window_label),
                        recommendation=tmpl["recommendation"],
                        requires_human_review=True,
                        data_window=window_key,
                        baseline_value=round(avg, 1),
                        current_value=current,
                        delta=round(current - avg, 1),
                    ))

        return alerts

    # ── Glucose Analysis ───────────────────────────────────────────────

    @staticmethod
    def _analyze_glucose(
        user_id: str,
        windows: Dict[str, List[VitalReading]],
        recent_alerts: List[Dict],
    ) -> List[PreventiveAlert]:
        alerts = []

        for window_key, min_readings in [("15m", MIN_READINGS_SHORT), ("2h", MIN_READINGS_MEDIUM), ("24h", MIN_READINGS_LONG)]:
            readings = windows.get(window_key, [])
            glucose_values = [r.glucose for r in readings if r.glucose is not None]

            if len(glucose_values) < min_readings:
                continue

            avg = sum(glucose_values) / len(glucose_values)
            current = glucose_values[-1]
            window_label = PreventiveAlertService._window_label(window_key)

            # Repeated low glucose
            low_count = sum(1 for v in glucose_values if v < GLUCOSE_LOW_THRESHOLD)
            if low_count >= len(glucose_values) * 0.5:
                severity = "HIGH" if current < 60 else "MEDIUM"
                if not PreventiveAlertService._is_duplicate(recent_alerts, user_id, "glucose", severity, window_key):
                    tmpl = MESSAGES["glucose_low_repeated"]
                    alerts.append(PreventiveAlert(
                        user_id=user_id,
                        severity=severity,
                        metric="glucose",
                        title=tmpl["title"],
                        message=tmpl["message"].format(window=window_label),
                        recommendation=tmpl["recommendation"],
                        requires_human_review=(severity == "HIGH"),
                        data_window=window_key,
                        baseline_value=round(avg, 1),
                        current_value=current,
                        delta=round(current - avg, 1),
                        source="manual",
                    ))

            # Repeated high glucose
            high_count = sum(1 for v in glucose_values if v > GLUCOSE_HIGH_THRESHOLD)
            if high_count >= len(glucose_values) * 0.5:
                severity = "HIGH" if current > 250 else "MEDIUM"
                if not PreventiveAlertService._is_duplicate(recent_alerts, user_id, "glucose", severity, window_key):
                    tmpl = MESSAGES["glucose_high_repeated"]
                    alerts.append(PreventiveAlert(
                        user_id=user_id,
                        severity=severity,
                        metric="glucose",
                        title=tmpl["title"],
                        message=tmpl["message"].format(window=window_label),
                        recommendation=tmpl["recommendation"],
                        requires_human_review=(severity == "HIGH"),
                        data_window=window_key,
                        baseline_value=round(avg, 1),
                        current_value=current,
                        delta=round(current - avg, 1),
                        source="manual",
                    ))

            # Abnormal variation from personal average
            if abs(current - avg) >= GLUCOSE_DELTA_SIGNIFICANT:
                if not PreventiveAlertService._is_duplicate(recent_alerts, user_id, "glucose", "MEDIUM", window_key):
                    tmpl = MESSAGES["glucose_abnormal_variation"]
                    alerts.append(PreventiveAlert(
                        user_id=user_id,
                        severity="MEDIUM",
                        metric="glucose",
                        title=tmpl["title"],
                        message=tmpl["message"].format(window=window_label),
                        recommendation=tmpl["recommendation"],
                        data_window=window_key,
                        baseline_value=round(avg, 1),
                        current_value=current,
                        delta=round(current - avg, 1),
                        source="manual",
                    ))

        return alerts

    # ── Utility Methods ────────────────────────────────────────────────

    @staticmethod
    def _is_duplicate(
        recent_alerts: List[Dict],
        user_id: str,
        metric: str,
        severity: str,
        window: str,
    ) -> bool:
        """Check if a similar alert was generated within the dedup window."""
        cutoff = datetime.utcnow() - timedelta(minutes=DEDUP_WINDOW_MINUTES)
        for alert in recent_alerts:
            if (
                alert.get("user_id") == user_id
                and alert.get("metric") == metric
                and alert.get("severity") == severity
                and alert.get("data_window") == window
            ):
                alert_time = alert.get("created_at")
                if isinstance(alert_time, str):
                    try:
                        alert_time = datetime.fromisoformat(alert_time)
                    except ValueError:
                        continue
                if isinstance(alert_time, datetime) and alert_time >= cutoff:
                    return True
        return False

    @staticmethod
    def _window_label(key: str) -> str:
        """Convert window key to human-readable Spanish label."""
        return {"15m": "15 minutos", "2h": "2 horas", "24h": "24 horas"}.get(key, key)
