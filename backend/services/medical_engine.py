import logging
import random
from datetime import datetime
from typing import Dict, List, Optional, Tuple
from pydantic import BaseModel, Field

# Setup professional logging
logger = logging.getLogger("RMHealth.MedicalEngine")

class VitalsInput(BaseModel):
    """Pydantic model for strict vitals validation"""
    usuario_id: str
    ritmo_cardiaco: int = Field(..., ge=0, le=300)
    spo2: int = Field(..., ge=0, le=100)
    presion_sistolica: int = Field(..., ge=0, le=300)
    presion_diastolica: int = Field(..., ge=0, le=200)
    temperatura: float = Field(..., ge=20.0, le=45.0)
    glucosa: float = Field(default=90.0, ge=20.0, le=600.0)
    caida_detectada: bool = False
    movimiento_posterior: bool = True

# Demo patient names for fallback when no DB profile exists
DEMO_NAMES = [
    "María González", "Carlos Mendoza", "Rosa Hernández",
    "José Martínez", "Ana Ramírez", "Luis Pérez",
]

class PatientContext(BaseModel):
    """Contextual patient data for risk modulation and hospital reporting"""
    edad: int = Field(25, ge=0, le=120)
    diabetico: bool = False
    hipertenso: bool = False
    cardiopata: bool = Field(default=False)
    # Memoria para análisis predictivo
    historial_ritmo: List[int] = Field(default_factory=list)
    historial_presion_s: List[int] = Field(default_factory=list)
    historial_spo2: List[int] = Field(default_factory=list)
    nombre_completo: str = Field(default_factory=lambda: random.choice(DEMO_NAMES))
    tipo_sangre: str = "No especificado"
    contacto_emergencia_nombre: str = "No disponible"
    contacto_emergencia_tel: str = "No disponible"
    alergias: List[str] = []

class AnalysisResult(BaseModel):
    """Structured output for the risk prioritization engine"""
    emergencia_detectada: bool
    nivel_criticidad: str  # CRITICAL, HIGH, MEDIUM, LOW, NORMAL
    score_riesgo: float
    factores_riesgo: List[str]
    recomendacion: str
    requiere_revision_humana: bool = False
    timestamp: datetime = Field(default_factory=datetime.now)

class MedicalEngine:
    """
    RMHealth Motor de Priorización de Riesgo en Validación Clínica.
    Este motor es heurístico y está en fase de validación clínica. No sustituye diagnóstico médico, juicio clínico ni protocolos hospitalarios.
    """
    
    # Umbrales de riesgo (Pesos heurísticos sujetos a validación médica)
    UMBRAL_ALTA = 70
    UMBRAL_MEDIA = 50
    UMBRAL_BAJA = 20
    


    @classmethod
    def detect_patterns(cls, vitals: VitalsInput, context: Optional[PatientContext] = None) -> AnalysisResult:
        """
        🔥 CORAZÓN DEL SISTEMA: Motor de Detección de Patrones (MDP)
        Identifica patrones en signos vitales con contexto completo:
        1. Valores actuales
        2. Tendencia temporal
        3. Historial del usuario (Multiplicadores)
        4. Patrones de riesgo conocidos (Caídas/Inconsciencia)
        
        TODO(Future): Integrate CriticalJudgmentModule (CJM) as a complementary 
        contextual layer. MedicalEngine should provide the baseline severity, 
        and CJM should adjust the risk based on complex patterns and non-diagnostic rules.
        """
        try:
            score_riesgo = 0.0
            factores_riesgo = []

            # FACTOR 1: Signos vitales puntuales
            p_score, p_factors = cls._analizar_vitales_puntuales(vitals)
            score_riesgo += p_score
            factores_riesgo.extend(p_factors)

            # FACTOR 2: Tendencia temporal (Detección temprana de patrones de riesgo)
            if context:
                t_score, t_factors = cls._analizar_tendencia(context)
                score_riesgo += t_score
                factores_riesgo.extend(t_factors)

            # FACTOR 3: Contexto médico del usuario
            if context:
                multiplicador_contexto, factores_contexto = cls._analizar_contexto_usuario(context)
                score_riesgo *= (1 + multiplicador_contexto / 100)
                factores_riesgo.extend(factores_contexto)

            # FACTOR 4: Detección de inconsciencia post-caída
            if vitals.caida_detectada and not vitals.movimiento_posterior:
                score_riesgo += 50
                factores_riesgo.append("Posible inconsciencia post-caída detectada")


            # DECISIÓN FINAL SEGÚN UMBRALES
            emergencia = False
            nivel = "NORMAL"
            recomendacion = "Continuar monitoreo rutinario"

            if score_riesgo >= cls.UMBRAL_ALTA:
                nivel = "CRITICAL"
                emergencia = True
                recomendacion = "Recomendación preliminar: requiere revisión urgente y posible activación de protocolo"
            elif score_riesgo >= cls.UMBRAL_MEDIA:
                nivel = "HIGH"
                emergencia = True
                recomendacion = "Recomendación preliminar: revisión humana prioritaria y posible contacto clínico"
            elif score_riesgo >= cls.UMBRAL_BAJA:
                nivel = "MEDIUM"
                emergencia = False
                recomendacion = "Monitoreo intensivo recomendado; considerar notificación según contexto"

            # Ajuste para NORMAL con factores leves presentes
            if nivel == "NORMAL" and factores_riesgo:
                recomendacion = "Monitoreo recomendado: se detectaron factores leves, observar evolución"

            return AnalysisResult(
                emergencia_detectada=emergencia,
                nivel_criticidad=nivel,
                score_riesgo=min(score_riesgo, 100.0),
                factores_riesgo=factores_riesgo,
                recomendacion=recomendacion,
                requiere_revision_humana=(emergencia or nivel in ["CRITICAL", "HIGH"])
            )

        except Exception as e:
            logger.error(f"Error en MDP: {e}")
            return AnalysisResult(
                emergencia_detectada=True,
                nivel_criticidad="CRITICAL",
                score_riesgo=100.0,
                factores_riesgo=["Falla en Motor de Detección de Patrones"],
                recomendacion="REQUERIDA COORDINACIÓN INMEDIATA - Error Interno",
                requiere_revision_humana=True
            )

    @staticmethod
    def _analizar_vitales_puntuales(v: VitalsInput) -> Tuple[float, List[str]]:
        score = 0.0
        factores = []

        # Ritmo cardíaco (Umbrales MJC)
        ritmo = v.ritmo_cardiaco
        if ritmo > 120:
            score += 30
            factores.append(f"Taquicardia severa ({ritmo} bpm)")
        elif ritmo > 100:
            score += 15
            factores.append(f"Taquicardia moderada ({ritmo} bpm)")
        elif ritmo < 50:
            score += 35
            factores.append(f"Bradicardia severa ({ritmo} bpm)")
        elif ritmo < 60:
            score += 10
            factores.append(f"Bradicardia leve ({ritmo} bpm)")

        # Saturación de oxígeno (Umbrales MJC)
        if v.spo2 < 85:
            score += 40
            factores.append(f"Hipoxemia crítica (SpO2: {v.spo2}%)")
        elif v.spo2 < 90:
            score += 25
            factores.append(f"Hipoxemia moderada (SpO2: {v.spo2}%)")
        elif v.spo2 < 94:
            score += 10
            factores.append(f"Hipoxemia leve (SpO2: {v.spo2}%)")

        # Presión arterial (Umbrales MJC)
        sistolica = v.presion_sistolica
        diastolica = v.presion_diastolica
        if sistolica > 180 or diastolica > 120:
            score += 55  # Pesos heurísticos sujetos a validación médica (ajustado: subclasificación detectada en pruebas)
            factores.append(f"Crisis hipertensiva ({sistolica}/{diastolica})")
        elif sistolica > 160 or diastolica > 100:
            score += 20
            factores.append(f"Hipertensión severa ({sistolica}/{diastolica})")
        elif sistolica < 90 or diastolica < 55:
            score += 30
            factores.append(f"Hipotensión significativa ({sistolica}/{diastolica})")
        elif sistolica < 100 or diastolica < 60:
            score += 15
            factores.append(f"Hipotensión leve ({sistolica}/{diastolica})")
        elif sistolica >= 140 or diastolica >= 90:
            # AHA Stage 2 Hypertension
            score += 15
            factores.append(f"Hipertensión Etapa 2 ({sistolica}/{diastolica}) — AHA")
        elif sistolica >= 130 or diastolica > 80:
            # Stage 1: systolic 130-139 OR diastolic 81-89
            # 120/80 NO activa (120 < 130 AND 80 no es > 80)
            # Pesos heurísticos sujetos a validación médica
            score += 8
            factores.append(f"Presión diastólica elevada ({diastolica} mmHg) — criterio AHA Stage 1")

        # Glucosa — ADA Standards of Medical Care 2024
        # Reference: American Diabetes Association, Diabetes Care 2024;47(Suppl.1)
        glucosa = v.glucosa
        if glucosa < 54:
            # Level 2 Hypoglycemia (ADA) — Clinically significant, needs immediate treatment
            score += 40
            factores.append(f"Hipoglucemia SEVERA ({glucosa} mg/dL) — ADA Level 2: requiere intervención inmediata")
        elif glucosa < 70:
            # Level 1 Hypoglycemia (ADA) — Alert value
            score += 20
            factores.append(f"Hipoglucemia ({glucosa} mg/dL) — ADA Level 1: alerta de coordinación")
        elif glucosa > 300:
            # Severe hyperglycemia — risk of DKA/HHS
            score += 35
            factores.append(f"Hiperglucemia severa ({glucosa} mg/dL) — Riesgo de cetoacidosis/SHH")
        elif glucosa > 250:
            # Moderate hyperglycemia
            score += 20
            factores.append(f"Hiperglucemia moderada ({glucosa} mg/dL)")
        elif glucosa > 180:
            # Above target (ADA postprandial)
            score += 10
            factores.append(f"Glucosa elevada ({glucosa} mg/dL) — sobre rango ADA")

        # Temperatura corporal
        if v.temperatura > 40.0:
            score += 30
            factores.append(f"Hipertermia severa ({v.temperatura}°C)")
        elif v.temperatura > 38.5:
            score += 15
            factores.append(f"Fiebre ({v.temperatura}°C)")
        elif v.temperatura < 35.0:
            score += 25
            factores.append(f"Hipotermia ({v.temperatura}°C)")
        elif v.temperatura < 35.5:
            score += 10
            factores.append(f"Hipotermia leve ({v.temperatura}°C)")

        return score, factores

    @staticmethod
    def _analizar_tendencia(ctx: PatientContext) -> Tuple[float, List[str]]:
        score = 0.0
        factores = []
        
        # Tendencia Ritmo Cardíaco (MJC logic)
        if len(ctx.historial_ritmo) >= 5:
            delta = ctx.historial_ritmo[-1] - ctx.historial_ritmo[0]
            if delta > 30:
                score += 15
                factores.append("Tendencia ascendente ritmo cardíaco (Alerta Temprana)")
            elif delta < -20:
                score += 10
                factores.append("Tendencia descendente ritmo cardíaco")

        # Tendencia SpO2
        if len(ctx.historial_spo2) >= 5:
            delta_spo2 = ctx.historial_spo2[-1] - ctx.historial_spo2[0]
            if delta_spo2 < -5:
                score += 20
                factores.append("Deterioro progresivo oxigenación (Análisis de Tendencia)")

        return score, factores

    @staticmethod
    def _analizar_contexto_usuario(ctx: PatientContext) -> Tuple[float, List[str]]:
        multiplier = 0.0
        factores = []

        # Edad (MJC thresholds)
        if ctx.edad > 70:
            multiplier += 20
            factores.append("Contexto: Paciente >70 años")
        elif ctx.edad > 60:
            multiplier += 10
            factores.append("Contexto: Paciente >60 años")

        # Comorbilidades
        if ctx.diabetico:
            multiplier += 15
            factores.append("Contexto: Historial Diabetes")
        if ctx.hipertenso:
            multiplier += 15
            factores.append("Contexto: Historial Hipertensión")
        if ctx.cardiopata:
            multiplier += 25
            factores.append("Contexto: Historial Cardiopatía")

        # Comorbilidad múltiple
        condiciones = sum([ctx.diabetico, ctx.hipertenso, ctx.cardiopata])
        if condiciones >= 2:
            multiplier += 10
            factores.append("Contexto: Múltiples comorbilidades (Riesgo Agravado)")

        return multiplier, factores
