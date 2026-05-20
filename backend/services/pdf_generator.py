#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
RMHealth — Preventive Monitoring Summary PDF Generator
Server-side PDF generation using ReportLab.
Bilingual support (es/en) based on user language preference.
Non-diagnostic preventive report for follow-up and professional review.

© 2025 MORALES ZEPEDA RAUL | Registro INDAUTOR: 03-2025-070109072500-01
"""

import datetime
import io
from typing import Any, Dict, List, Optional

from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch, mm
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    PageBreak, HRFlowable,
)

# ── Bilingual translations ──────────────────────────────────────
TRANSLATIONS = {
    "es": {
        "title": "Resumen Preventivo de Monitoreo RMHealth",
        "subtitle": "Datos registrados para seguimiento preventivo y apoyo a revision profesional",
        "generated": "Generado",
        "version": "Version",
        "page": "Pagina",
        "patient_profile": "Perfil del Paciente",
        "name": "Nombre",
        "email": "Correo",
        "age": "Edad",
        "years": "anios",
        "blood_type": "Tipo de Sangre",
        "weight": "Peso",
        "height": "Estatura",
        "treating_doctor": "Medico Tratante",
        "medical_conditions": "Condiciones Medicas",
        "condition": "Condicion",
        "status": "Estado",
        "diagnosis_date": "Observaciones",
        "allergies": "Alergias",
        "agent": "Agente",
        "severity": "Severidad",
        "type": "Tipo",
        "emergency_contacts": "Contactos de Emergencia",
        "contact_name": "Nombre",
        "relationship": "Parentesco",
        "phone": "Telefono",
        "measurement_history": "Signos Vitales Recientes",
        "date": "Fecha",
        "heart_rate": "FC",
        "spo2": "SpO2",
        "systolic": "Sist",
        "diastolic": "Diast",
        "glucose": "Glu",
        "temperature": "Temp",
        "context": "Contexto",
        "total_measurements": "Total de mediciones",
        "monitoring_period": "Periodo de monitoreo",
        "to": "a",
        "medications_adherence": "Medicamentos y Adherencia",
        "medication": "Medicamento",
        "dose": "Dosis",
        "schedule": "Horario",
        "days": "Dias",
        "active": "Activo",
        "inactive": "Inactivo",
        "resolved": "Resuelto",
        "adherence": "Adherencia",
        "yes": "Si",
        "no": "No",
        "no_data": "Sin datos disponibles",
        "legal_notice": (
            "Este documento resume datos preventivos registrados por RMHealth. "
            "No constituye diagnostico medico, tratamiento ni recomendacion terapeutica. "
            "La interpretacion clinica corresponde a un profesional de salud."
        ),
        "confidential": "CONFIDENCIAL — Informacion medica protegida",
        "special_instructions": "Instrucciones Especiales",
        "preventive_summary": "Resumen Preventivo del Periodo",
        "trends": "Tendencias y Comportamiento",
        "sleep_section": "Descanso y Sueno",
        "preventive_alerts_section": "Alertas Preventivas",
        "observations_section": "Observaciones Preventivas",
        "last_reading": "Ultima lectura",
        "average": "Promedio",
        "minimum": "Minimo",
        "maximum": "Maximo",
        "records_count": "Registros",
        "showing_last": "Mostrando ultimas",
        "of_total": "de",
        "unique_readings": "lecturas unicas",
        "no_emergency": "No se activaron criterios automaticos de emergencia en este periodo.",
        "sleep_duration": "Duracion",
        "sleep_start": "Inicio",
        "sleep_end": "Fin",
        "sleep_quality": "Calidad",
        "sleep_avg_7d": "Promedio 7 dias",
        "sleep_avg_30d": "Promedio 30 dias",
        "taken": "Tomadas",
        "missed": "Omitidas",
        "no_dose_history": "Sin historial de toma suficiente",
        "total_alerts": "Total de alertas",
        "metric": "Metrica",
        "insufficient_data": "Datos insuficientes para tendencia longitudinal.",
    },
    "en": {
        "title": "RMHealth Preventive Monitoring Summary",
        "subtitle": "Data recorded for preventive follow-up and professional review support",
        "generated": "Generated",
        "version": "Version",
        "page": "Page",
        "patient_profile": "Patient Profile",
        "name": "Name",
        "email": "Email",
        "age": "Age",
        "years": "years",
        "blood_type": "Blood Type",
        "weight": "Weight",
        "height": "Height",
        "treating_doctor": "Treating Doctor",
        "medical_conditions": "Medical Conditions",
        "condition": "Condition",
        "status": "Status",
        "diagnosis_date": "Observations",
        "allergies": "Allergies",
        "agent": "Agent",
        "severity": "Severity",
        "type": "Type",
        "emergency_contacts": "Emergency Contacts",
        "contact_name": "Name",
        "relationship": "Relationship",
        "phone": "Phone",
        "measurement_history": "Recent Vital Signs",
        "date": "Date",
        "heart_rate": "HR",
        "spo2": "SpO2",
        "systolic": "Sys",
        "diastolic": "Dia",
        "glucose": "Glu",
        "temperature": "Temp",
        "context": "Context",
        "total_measurements": "Total measurements",
        "monitoring_period": "Monitoring period",
        "to": "to",
        "medications_adherence": "Medications & Adherence",
        "medication": "Medication",
        "dose": "Dose",
        "schedule": "Schedule",
        "days": "Days",
        "active": "Active",
        "inactive": "Inactive",
        "resolved": "Resolved",
        "adherence": "Adherence",
        "yes": "Yes",
        "no": "No",
        "no_data": "No data available",
        "legal_notice": (
            "This document summarizes preventive data recorded by RMHealth. "
            "It does not constitute a medical diagnosis, treatment, or therapeutic recommendation. "
            "Clinical interpretation should be performed by a healthcare professional."
        ),
        "confidential": "CONFIDENTIAL — Protected medical information",
        "special_instructions": "Special Instructions",
        "preventive_summary": "Preventive Summary for Period",
        "trends": "Trends and Behavior",
        "sleep_section": "Rest and Sleep",
        "preventive_alerts_section": "Preventive Alerts",
        "observations_section": "Preventive Observations",
        "last_reading": "Last reading",
        "average": "Average",
        "minimum": "Minimum",
        "maximum": "Maximum",
        "records_count": "Records",
        "showing_last": "Showing last",
        "of_total": "of",
        "unique_readings": "unique readings",
        "no_emergency": "No automatic emergency criteria were triggered during this period.",
        "sleep_duration": "Duration",
        "sleep_start": "Start",
        "sleep_end": "End",
        "sleep_quality": "Quality",
        "sleep_avg_7d": "7-day average",
        "sleep_avg_30d": "30-day average",
        "taken": "Taken",
        "missed": "Missed",
        "no_dose_history": "No sufficient dose history",
        "total_alerts": "Total alerts",
        "metric": "Metric",
        "insufficient_data": "Insufficient data for longitudinal trend.",
    },
}

# ── Colors ───────────────────────────────────────────────────────
TEAL = colors.HexColor("#1B7A6E")
TEAL_LIGHT = colors.HexColor("#E0F2F1")
DARK = colors.HexColor("#1E293B")
GRAY_ALT = colors.HexColor("#F8FAFC")
GRAY_BORDER = colors.HexColor("#E2E8F0")
RED = colors.HexColor("#EF4444")


class ExpedientePDFGenerator:
    """Generates a preventive monitoring summary PDF."""

    def __init__(self, language: str = "es"):
        self.lang = language if language in TRANSLATIONS else "es"
        self.t = TRANSLATIONS[self.lang]
        self.styles = getSampleStyleSheet()
        self._setup_styles()

    def _setup_styles(self):
        """Configure custom paragraph styles."""
        self.styles.add(ParagraphStyle(
            name="SectionTitle",
            fontName="Helvetica-Bold",
            fontSize=14,
            textColor=TEAL,
            spaceBefore=16,
            spaceAfter=8,
        ))
        self.styles.add(ParagraphStyle(
            name="FieldLabel",
            fontName="Helvetica-Bold",
            fontSize=9,
            textColor=DARK,
        ))
        self.styles.add(ParagraphStyle(
            name="FieldValue",
            fontName="Helvetica",
            fontSize=9,
            textColor=DARK,
        ))
        self.styles.add(ParagraphStyle(
            name="SmallGray",
            fontName="Helvetica",
            fontSize=7,
            textColor=colors.HexColor("#94A3B8"),
        ))
        self.styles.add(ParagraphStyle(
            name="LegalText",
            fontName="Helvetica",
            fontSize=7,
            textColor=colors.HexColor("#64748B"),
            leading=10,
        ))
        self.styles.add(ParagraphStyle(
            name="ObsText",
            fontName="Helvetica",
            fontSize=9,
            textColor=DARK,
            leading=14,
            spaceBefore=4,
        ))

    def generate(
        self,
        profile: Dict[str, Any],
        vitals: List[Dict[str, Any]],
        medications: List[Dict[str, Any]],
        conditions: List[Dict[str, Any]],
        allergies_list: List[Dict[str, Any]],
        contacts: List[Dict[str, Any]],
        adherence: Optional[Dict[str, Any]] = None,
        sleep_data: Optional[Dict[str, Any]] = None,
        alerts: Optional[List[Dict[str, Any]]] = None,
        dose_counts: Optional[Dict[str, Any]] = None,
    ) -> bytes:
        """Generate the complete PDF and return as bytes."""
        buffer = io.BytesIO()
        doc = SimpleDocTemplate(
            buffer,
            pagesize=letter,
            topMargin=0.6 * inch,
            bottomMargin=0.8 * inch,
            leftMargin=0.6 * inch,
            rightMargin=0.6 * inch,
        )

        story = []
        now = datetime.datetime.now(datetime.timezone.utc)

        # ── PAGE 1: Profile ──────────────────────────────────────
        story.extend(self._build_header(now))
        story.extend(self._build_profile(profile))
        story.extend(self._build_conditions(conditions))
        story.extend(self._build_allergies(allergies_list))
        story.extend(self._build_contacts(contacts))

        # ── PAGE 2: Summary + Trends + Vitals ────────────────────
        story.append(PageBreak())
        story.extend(self._build_preventive_summary(vitals))
        story.extend(self._build_trends(vitals))
        story.extend(self._build_vitals(vitals))

        # ── PAGE 3: Sleep + Medications ──────────────────────────
        story.append(PageBreak())
        story.extend(self._build_sleep(sleep_data))
        story.extend(self._build_medications(medications, adherence, dose_counts))

        # ── PAGE 4: Alerts + Observations + Legal ────────────────
        story.append(PageBreak())
        story.extend(self._build_alerts(alerts))
        story.extend(self._build_observations(vitals))

        # ── Legal footer ─────────────────────────────────────────
        story.append(Spacer(1, 24))
        story.append(HRFlowable(width="100%", thickness=0.5, color=GRAY_BORDER))
        story.append(Spacer(1, 6))
        story.append(Paragraph(self.t["legal_notice"], self.styles["LegalText"]))
        story.append(Spacer(1, 4))
        story.append(Paragraph(self.t["confidential"], self.styles["LegalText"]))

        # Build with footer
        doc.build(story, onFirstPage=self._page_footer, onLaterPages=self._page_footer)
        return buffer.getvalue()

    def _page_footer(self, canvas, doc):
        """Draw footer on every page."""
        now_str = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
        canvas.saveState()
        canvas.setFont("Helvetica", 7)
        canvas.setFillColor(colors.HexColor("#94A3B8"))
        canvas.drawString(
            doc.leftMargin,
            0.4 * inch,
            f"RMHealth v2.0.0 | {self.t['generated']}: {now_str}"
        )
        canvas.drawRightString(
            doc.width + doc.leftMargin,
            0.4 * inch,
            f"{self.t['page']} {doc.page}"
        )
        canvas.restoreState()

    def _build_header(self, now: datetime.datetime) -> list:
        """Build document header."""
        elements = []
        elements.append(Paragraph(self.t["title"], ParagraphStyle(
            name="DocTitle",
            fontName="Helvetica-Bold",
            fontSize=20,
            textColor=TEAL,
            spaceAfter=2,
        )))
        elements.append(Paragraph(self.t["subtitle"], self.styles["SmallGray"]))
        elements.append(Spacer(1, 4))
        elements.append(Paragraph(
            f"{self.t['generated']}: {now.strftime('%Y-%m-%d %H:%M UTC')}",
            self.styles["SmallGray"]
        ))
        elements.append(Spacer(1, 8))
        elements.append(HRFlowable(width="100%", thickness=1, color=TEAL))
        elements.append(Spacer(1, 12))
        return elements

    def _build_profile(self, profile: Dict[str, Any]) -> list:
        """Build patient profile section."""
        t = self.t
        elements = []
        elements.append(Paragraph(t["patient_profile"], self.styles["SectionTitle"]))

        fields = [
            (t["name"], profile.get("full_name", "—")),
            (t["email"], profile.get("email", "—")),
            (t["age"], f"{profile.get('age', '—')} {t['years']}" if profile.get("age") else "—"),
            (t["blood_type"], profile.get("blood_type", "—")),
            (t["weight"], f"{profile.get('weight', '—')} kg" if profile.get("weight") else "—"),
            (t["height"], f"{profile.get('height', '—')} cm" if profile.get("height") else "—"),
        ]

        if profile.get("treating_doctor_name"):
            doc_info = profile["treating_doctor_name"]
            if profile.get("treating_doctor_specialty"):
                doc_info += f" ({profile['treating_doctor_specialty']})"
            fields.append((t["treating_doctor"], doc_info))

        if profile.get("special_instructions"):
            fields.append((t["special_instructions"], profile["special_instructions"]))

        data = [[Paragraph(f"<b>{label}:</b>", self.styles["FieldLabel"]),
                 Paragraph(str(value), self.styles["FieldValue"])] for label, value in fields]

        table = Table(data, colWidths=[2.2 * inch, 4.8 * inch])
        table.setStyle(TableStyle([
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("TOPPADDING", (0, 0), (-1, -1), 3),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
            ("ROWBACKGROUNDS", (0, 0), (-1, -1), [colors.white, GRAY_ALT]),
        ]))
        elements.append(table)
        return elements

    def _build_conditions(self, conditions: List[Dict[str, Any]]) -> list:
        """Build medical conditions section."""
        t = self.t
        elements = []
        elements.append(Paragraph(t["medical_conditions"], self.styles["SectionTitle"]))

        if not conditions:
            elements.append(Paragraph(t["no_data"], self.styles["FieldValue"]))
            return elements

        header = [t["condition"], t["status"], t["diagnosis_date"]]
        data = [header]
        for c in conditions:
            diag = c.get("diagnosis_date", "—")
            if hasattr(diag, "strftime"):
                diag = diag.strftime("%Y-%m-%d")
            raw_status = c.get("status", "—")
            status_display = t.get(raw_status, raw_status)
            
            data.append([
                c.get("name", "—"),
                status_display,
                str(diag) if diag else "—",
            ])

        table = Table(data, colWidths=[3 * inch, 2 * inch, 2 * inch])
        table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), TEAL),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, -1), 8),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, GRAY_ALT]),
            ("GRID", (0, 0), (-1, -1), 0.5, GRAY_BORDER),
            ("TOPPADDING", (0, 0), (-1, -1), 4),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ]))
        elements.append(table)
        return elements

    def _build_allergies(self, allergies_list: List[Dict[str, Any]]) -> list:
        """Build allergies section."""
        t = self.t
        elements = []
        elements.append(Paragraph(t["allergies"], self.styles["SectionTitle"]))

        if not allergies_list:
            elements.append(Paragraph(t["no_data"], self.styles["FieldValue"]))
            return elements

        header = [t["agent"], t["type"], t["severity"]]
        data = [header]
        for a in allergies_list:
            data.append([
                a.get("agent", "—"),
                a.get("allergy_type", "—"),
                a.get("severity", "—"),
            ])

        table = Table(data, colWidths=[3 * inch, 2 * inch, 2 * inch])
        table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), TEAL),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, -1), 8),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, GRAY_ALT]),
            ("GRID", (0, 0), (-1, -1), 0.5, GRAY_BORDER),
            ("TOPPADDING", (0, 0), (-1, -1), 4),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ]))
        elements.append(table)
        return elements

    def _build_contacts(self, contacts: List[Dict[str, Any]]) -> list:
        """Build emergency contacts section."""
        t = self.t
        elements = []
        elements.append(Paragraph(t["emergency_contacts"], self.styles["SectionTitle"]))

        if not contacts:
            elements.append(Paragraph(t["no_data"], self.styles["FieldValue"]))
            return elements

        header = [t["contact_name"], t["relationship"], t["phone"]]
        data = [header]
        for c in contacts:
            data.append([
                c.get("name", "—"),
                c.get("relationship", "—"),
                c.get("phone", "—"),
            ])

        table = Table(data, colWidths=[3 * inch, 2 * inch, 2 * inch])
        table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), TEAL),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, -1), 8),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, GRAY_ALT]),
            ("GRID", (0, 0), (-1, -1), 0.5, GRAY_BORDER),
            ("TOPPADDING", (0, 0), (-1, -1), 4),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ]))
        elements.append(table)
        return elements

    # ── helpers ────────────────────────────────────────────────────

    @staticmethod
    def _ts_str(ts) -> str:
        if hasattr(ts, "strftime"):
            return ts.strftime("%Y-%m-%d %H:%M")
        return str(ts) if ts else "—"

    @staticmethod
    def _ts_date(ts) -> str:
        if hasattr(ts, "strftime"):
            return ts.strftime("%Y-%m-%d")
        return str(ts).split("T")[0] if ts else "—"

    @staticmethod
    def _safe_num(v, key):
        val = v.get(key)
        if val is None:
            return None
        try:
            return float(val)
        except (ValueError, TypeError):
            return None

    def _dedup_vitals(self, vitals: list, max_rows: int = 15) -> list:
        """Remove duplicate readings within 5-min windows, return last N unique."""
        seen = set()
        unique = []
        for v in vitals:
            sig = (
                v.get("ritmo_cardiaco"), v.get("spo2"),
                v.get("presion_sistolica"), v.get("presion_diastolica"),
                v.get("glucosa"), v.get("temperatura"),
            )
            ts = v.get("timestamp")
            ts_key = self._ts_str(ts)[:16]  # round to minute
            key = (ts_key, sig)
            if key not in seen:
                seen.add(key)
                unique.append(v)
        return unique[:max_rows]

    def _compute_stats(self, vitals: list) -> Dict[str, Dict[str, Any]]:
        """Compute avg/min/max for each vital metric."""
        keys = {
            "ritmo_cardiaco": "FC", "spo2": "SpO2",
            "presion_sistolica": "Sist", "presion_diastolica": "Diast",
            "glucosa": "Glu", "temperatura": "Temp",
        }
        stats = {}
        for db_key, label in keys.items():
            vals = [self._safe_num(v, db_key) for v in vitals]
            vals = [x for x in vals if x is not None]
            if vals:
                stats[label] = {
                    "avg": sum(vals) / len(vals),
                    "min": min(vals),
                    "max": max(vals),
                    "n": len(vals),
                }
        return stats

    # ── new sections ──────────────────────────────────────────────

    def _build_preventive_summary(self, vitals: list) -> list:
        """Build preventive summary paragraph."""
        t = self.t
        elements = []
        elements.append(Paragraph(t["preventive_summary"], self.styles["SectionTitle"]))

        if not vitals:
            elements.append(Paragraph(t["no_data"], self.styles["FieldValue"]))
            return elements

        total = len(vitals)
        first_date = self._ts_date(vitals[-1].get("timestamp"))
        last_date = self._ts_date(vitals[0].get("timestamp"))
        latest = vitals[0]

        lines = [
            f"<b>{t['total_measurements']}:</b> {total}",
            f"<b>{t['monitoring_period']}:</b> {first_date} {t['to']} {last_date}",
        ]
        # Last reading snapshot
        snap_parts = []
        if latest.get("ritmo_cardiaco"):
            snap_parts.append(f"FC: {latest['ritmo_cardiaco']} bpm")
        if latest.get("spo2"):
            snap_parts.append(f"SpO2: {latest['spo2']}%")
        if latest.get("presion_sistolica"):
            snap_parts.append(
                f"PA: {latest['presion_sistolica']}/{latest.get('presion_diastolica', '—')} mmHg"
            )
        if latest.get("glucosa"):
            snap_parts.append(f"Glu: {latest['glucosa']} mg/dL")
        if latest.get("temperatura"):
            snap_parts.append(f"Temp: {latest['temperatura']} C")
        if snap_parts:
            lines.append(f"<b>{t['last_reading']}:</b> {', '.join(snap_parts)}")

        lines.append("")
        lines.append(t["no_emergency"])

        for line in lines:
            elements.append(Paragraph(line, self.styles["FieldValue"]))
        elements.append(Spacer(1, 4))
        return elements

    def _build_trends(self, vitals: list) -> list:
        """Build trends / statistics section."""
        t = self.t
        elements = []
        elements.append(Paragraph(t["trends"], self.styles["SectionTitle"]))

        if len(vitals) < 3:
            elements.append(Paragraph(t["insufficient_data"], self.styles["FieldValue"]))
            return elements

        stats = self._compute_stats(vitals)
        if not stats:
            elements.append(Paragraph(t["no_data"], self.styles["FieldValue"]))
            return elements

        header = [t["metric"], t["average"], t["minimum"], t["maximum"], t["records_count"]]
        data = [header]
        for label, s in stats.items():
            data.append([
                label,
                f"{s['avg']:.1f}",
                f"{s['min']:.1f}",
                f"{s['max']:.1f}",
                str(s["n"]),
            ])

        table = Table(data, colWidths=[1.4 * inch, 1.4 * inch, 1.4 * inch, 1.4 * inch, 1.4 * inch])
        table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), TEAL),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, -1), 8),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, GRAY_ALT]),
            ("GRID", (0, 0), (-1, -1), 0.5, GRAY_BORDER),
            ("TOPPADDING", (0, 0), (-1, -1), 4),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ("ALIGN", (1, 0), (-1, -1), "CENTER"),
        ]))
        elements.append(table)
        return elements

    def _build_vitals(self, vitals: List[Dict[str, Any]]) -> list:
        """Build deduplicated recent vital signs table."""
        t = self.t
        elements = []
        elements.append(Paragraph(t["measurement_history"], self.styles["SectionTitle"]))

        if not vitals:
            elements.append(Paragraph(t["no_data"], self.styles["FieldValue"]))
            return elements

        total = len(vitals)
        unique = self._dedup_vitals(vitals, max_rows=15)
        shown = len(unique)

        elements.append(Paragraph(
            f"{t['showing_last']} <b>{shown}</b> {t['unique_readings']} "
            f"{t['of_total']} <b>{total}</b> {t['total_measurements'].lower()}",
            self.styles["FieldValue"]
        ))
        elements.append(Spacer(1, 6))

        header = [t["date"], t["heart_rate"], t["spo2"], t["systolic"],
                  t["diastolic"], t["glucose"], t["temperature"]]
        data = [header]

        for v in unique:
            data.append([
                self._ts_str(v.get("timestamp")),
                str(v.get("ritmo_cardiaco", "—")),
                str(v.get("spo2", "—")),
                str(v.get("presion_sistolica", "—")),
                str(v.get("presion_diastolica", "—")),
                str(v.get("glucosa", "—")),
                str(v.get("temperatura", "—")),
            ])

        col_widths = [1.8 * inch, 0.7 * inch, 0.7 * inch, 0.7 * inch,
                      0.7 * inch, 0.7 * inch, 0.7 * inch]
        table = Table(data, colWidths=col_widths, repeatRows=1)
        table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), TEAL),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, -1), 7),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, GRAY_ALT]),
            ("GRID", (0, 0), (-1, -1), 0.3, GRAY_BORDER),
            ("TOPPADDING", (0, 0), (-1, -1), 3),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
            ("ALIGN", (1, 0), (-1, -1), "CENTER"),
        ]))
        elements.append(table)
        return elements

    def _build_sleep(self, sleep_data: Optional[Dict[str, Any]]) -> list:
        """Build sleep / rest section."""
        t = self.t
        elements = []
        elements.append(Paragraph(t["sleep_section"], self.styles["SectionTitle"]))

        if not sleep_data:
            elements.append(Paragraph(t["no_data"], self.styles["FieldValue"]))
            return elements

        fields = []
        if sleep_data.get("last_start"):
            fields.append((t["sleep_start"], str(sleep_data["last_start"])))
        if sleep_data.get("last_end"):
            fields.append((t["sleep_end"], str(sleep_data["last_end"])))
        if sleep_data.get("last_duration_min"):
            hrs = sleep_data["last_duration_min"] / 60
            fields.append((t["sleep_duration"], f"{hrs:.1f} h ({sleep_data['last_duration_min']} min)"))
        if sleep_data.get("quality"):
            fields.append((t["sleep_quality"], str(sleep_data["quality"])))
        if sleep_data.get("avg_7d_min"):
            fields.append((t["sleep_avg_7d"], f"{sleep_data['avg_7d_min'] / 60:.1f} h"))
        if sleep_data.get("avg_30d_min"):
            fields.append((t["sleep_avg_30d"], f"{sleep_data['avg_30d_min'] / 60:.1f} h"))

        if not fields:
            elements.append(Paragraph(t["no_data"], self.styles["FieldValue"]))
            return elements

        data = [[Paragraph(f"<b>{lbl}:</b>", self.styles["FieldLabel"]),
                 Paragraph(val, self.styles["FieldValue"])] for lbl, val in fields]
        table = Table(data, colWidths=[2.2 * inch, 4.8 * inch])
        table.setStyle(TableStyle([
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("TOPPADDING", (0, 0), (-1, -1), 3),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
            ("ROWBACKGROUNDS", (0, 0), (-1, -1), [colors.white, GRAY_ALT]),
        ]))
        elements.append(table)
        return elements

    def _build_medications(
        self,
        medications: List[Dict[str, Any]],
        adherence: Optional[Dict[str, Any]] = None,
        dose_counts: Optional[Dict[str, Any]] = None,
    ) -> list:
        """Build medications and adherence section with dose history."""
        t = self.t
        elements = []
        elements.append(Paragraph(t["medications_adherence"], self.styles["SectionTitle"]))

        if not medications:
            elements.append(Paragraph(t["no_data"], self.styles["FieldValue"]))
            return elements

        dc = dose_counts or {}
        header = [t["medication"], t["dose"], t["schedule"], t["status"], t["taken"], t["missed"]]
        data = [header]

        for m in medications:
            horario = m.get("horario", "—")
            if hasattr(horario, "strftime"):
                horario = horario.strftime("%H:%M")

            med_id = str(m.get("id", ""))
            counts = dc.get(med_id, {})
            taken = counts.get("taken", "—")
            missed = counts.get("missed", "—")
            if taken == "—" and missed == "—":
                taken = t["no_dose_history"]
                missed = ""

            data.append([
                m.get("nombre_medicina", "—"),
                m.get("dosis", "—"),
                str(horario),
                t["active"] if m.get("activo", True) else t["inactive"],
                str(taken),
                str(missed),
            ])

        col_widths = [1.8 * inch, 1 * inch, 0.8 * inch, 0.8 * inch, 1.3 * inch, 1.3 * inch]
        table = Table(data, colWidths=col_widths, repeatRows=1)
        table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), TEAL),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, -1), 8),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, GRAY_ALT]),
            ("GRID", (0, 0), (-1, -1), 0.5, GRAY_BORDER),
            ("TOPPADDING", (0, 0), (-1, -1), 4),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ]))
        elements.append(table)

        if adherence and adherence.get("overall_rate") is not None:
            elements.append(Spacer(1, 12))
            rate = adherence["overall_rate"]
            elements.append(Paragraph(
                f"<b>{t['adherence']}:</b> {rate:.0f}%",
                self.styles["FieldValue"]
            ))

        return elements

    def _build_alerts(self, alerts: Optional[List[Dict[str, Any]]]) -> list:
        """Build preventive alerts section."""
        t = self.t
        elements = []
        elements.append(Paragraph(t["preventive_alerts_section"], self.styles["SectionTitle"]))

        if not alerts:
            elements.append(Paragraph(t["no_data"], self.styles["FieldValue"]))
            return elements

        elements.append(Paragraph(
            f"<b>{t['total_alerts']}:</b> {len(alerts)}",
            self.styles["FieldValue"]
        ))
        elements.append(Spacer(1, 6))

        header = [t["date"], t["metric"], t["severity"], t["status"]]
        data = [header]
        for a in alerts[:30]:
            data.append([
                self._ts_str(a.get("created_at")),
                str(a.get("metric", "—")),
                str(a.get("severity", "—")),
                str(a.get("status", "—")),
            ])

        table = Table(data, colWidths=[2 * inch, 2 * inch, 1.5 * inch, 1.5 * inch])
        table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), TEAL),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, -1), 8),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, GRAY_ALT]),
            ("GRID", (0, 0), (-1, -1), 0.5, GRAY_BORDER),
            ("TOPPADDING", (0, 0), (-1, -1), 4),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ]))
        elements.append(table)
        return elements

    def _build_observations(self, vitals: list) -> list:
        """Build non-diagnostic preventive observations."""
        t = self.t
        is_es = self.lang == "es"
        elements = []
        elements.append(Paragraph(t["observations_section"], self.styles["SectionTitle"]))

        if not vitals:
            elements.append(Paragraph(t["no_data"], self.styles["FieldValue"]))
            return elements

        obs = []
        stats = self._compute_stats(vitals)

        # SpO2 observations
        spo2_stats = stats.get("SpO2")
        if spo2_stats and spo2_stats["avg"] < 95:
            obs.append(
                "SpO2 con lecturas en rango de seguimiento preventivo. "
                "Se recomienda confirmar si se repiten." if is_es else
                "SpO2 readings in preventive follow-up range. Confirm if they recur."
            )

        # Diastolic BP observations
        dia_stats = stats.get("Diast")
        if dia_stats and dia_stats["avg"] >= 80:
            obs.append(
                "Presion diastolica ligeramente elevada en algunas mediciones. "
                "No representa emergencia; se recomienda seguimiento si se repite." if is_es else
                "Diastolic pressure slightly elevated in some readings. "
                "Not an emergency; follow-up recommended if it recurs."
            )

        # HR observations
        hr_stats = stats.get("FC")
        if hr_stats:
            if hr_stats["avg"] > 100:
                obs.append(
                    "Frecuencia cardiaca con lecturas elevadas en promedio. "
                    "Confirmar con medicion en reposo." if is_es else
                    "Heart rate readings elevated on average. Confirm at rest."
                )
            elif hr_stats["avg"] < 60:
                obs.append(
                    "Frecuencia cardiaca con lecturas bajas en promedio. "
                    "Confirmar con medicion en reposo." if is_es else
                    "Heart rate readings low on average. Confirm at rest."
                )

        # Normal case
        if not obs:
            obs.append(
                "Signos vitales sin variaciones relevantes registradas durante el periodo." if is_es else
                "Vital signs without relevant variations recorded during the period."
            )

        # Always add closing recommendation
        obs.append(
            "Confirmar mediciones atipicas si se repiten y consultar a un profesional de salud." if is_es else
            "Confirm atypical readings if they recur and consult a healthcare professional."
        )

        for o in obs:
            elements.append(Paragraph(f"\u2022 {o}", self.styles["ObsText"]))

        return elements

