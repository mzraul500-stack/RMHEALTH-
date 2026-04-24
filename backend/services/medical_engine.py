import logging
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
    nombre_completo: str = "Paciente Desconocido"
    tipo_sangre: str = "No especificado"
    contacto_emergencia_nombre: str = "No disponible"
    contacto_emergencia_tel: str = "No disponible"
    alergias: List[str] = []

class AnalysisResult(BaseModel):
    """Structured output — Wellness pattern analysis (non-diagnostic)"""
    alerta_detectada: bool
    nivel_atencion: str  # CRITICAL, HIGH, MEDIUM, LOW, NORMAL
    indice_bienestar: float
    metricas_inusuales: List[str]
    sugerencia: str
    timestamp: datetime = Field(default_factory=datetime.now)
    # Aliases for backward compatibility with mobile app
    @property
    def emergencia_detectada(self): return self.alerta_detectada
    @property
    def nivel_criticidad(self): return self.nivel_atencion
    @property
    def score_riesgo(self): return self.indice_bienestar
    @property
    def factores_riesgo(self): return self.metricas_inusuales
    @property
    def recomendacion(self): return self.sugerencia

class MedicalEngine:
    """
    RMHealth Critical Judgment Engine.
    Implements multi-factorial analysis for medical risk assessment.
    """
    
    # Umbrales de riesgo MJC
    UMBRAL_ALTA = 70
    UMBRAL_MEDIA = 50
    UMBRAL_BAJA = 20
    


    @classmethod
    def analyze(cls, vitals: VitalsInput, context: Optional[PatientContext] = None) -> AnalysisResult:
        """
        🔥 CORAZÓN DEL SISTEMA: Módulo de Juicio Crítico (MJC)
        Analiza signos vitales con contexto completo:
        1. Valores actuales
        2. Tendencia temporal
        3. Historial médico del usuario (Multiplicadores)
        4. Patrones de riesgo conocidos (Caídas/Inconsciencia)
        """
        try:
            score_riesgo = 0.0
            factores_riesgo = []

            # FACTOR 1: Signos vitales puntuales (MJC Logic)
            p_score, p_factors = cls._analizar_vitales_puntuales(vitals)
            score_riesgo += p_score
            factores_riesgo.extend(p_factors)

            # FACTOR 2: Tendencia temporal (🔥 VENTAJA vs Competencia)
            if context:
                t_score, t_factors = cls._analizar_tendencia(context)
                score_riesgo += t_score
                factores_riesgo.extend(t_factors)

            # FACTOR 3: Contexto médico del usuario (Multiplicadores MJC)
            if context:
                multiplicador_contexto, factores_contexto = cls._analizar_contexto_usuario(context)
                score_riesgo *= (1 + multiplicador_contexto / 100)
                factores_riesgo.extend(factores_contexto)

            # FACTOR 4: Detección de inconsciencia post-caída
            if vitals.caida_detectada and not vitals.movimiento_posterior:
                score_riesgo += 50
                factores_riesgo.append("🚨 Patrón inusual: posible caída sin movimiento posterior")


            # DECISIÓN FINAL SEGÚN UMBRALES MJC
            emergencia = False
            nivel = "NORMAL"
            recomendacion = "✅ Tus métricas están dentro del rango habitual"

            if score_riesgo >= cls.UMBRAL_ALTA:
                nivel = "CRITICAL"
                emergencia = True
                recomendacion = "🚨 Patrón atípico detectado — se activó coordinación de respuesta"
            elif score_riesgo >= cls.UMBRAL_MEDIA:
                nivel = "HIGH"
                emergencia = True
                recomendacion = "⚠️ Métricas fuera de rango habitual — notificando contactos"
            elif score_riesgo >= cls.UMBRAL_BAJA:
                nivel = "MEDIUM"
                emergencia = False
                recomendacion = "📊 Algunas métricas fuera de rango — monitoreo sugerido"

            return AnalysisResult(
                alerta_detectada=emergencia,
                nivel_atencion=nivel,
                indice_bienestar=min(score_riesgo, 100.0),
                metricas_inusuales=factores_riesgo,
                sugerencia=recomendacion
            )

        except Exception as e:
            logger.error(f"Error en MJC: {e}")
            return AnalysisResult(
                alerta_detectada=True,
                nivel_atencion="CRITICAL",
                indice_bienestar=100.0,
                metricas_inusuales=["Error en análisis de patrones"],
                sugerencia="Se sugiere atención — error interno en el sistema"
            )

    @staticmethod
    def _analizar_vitales_puntuales(v: VitalsInput) -> Tuple[float, List[str]]:
        score = 0.0
        factores = []

        # Ritmo cardíaco (Umbrales MJC)
        ritmo = v.ritmo_cardiaco
        if ritmo > 120:
            score += 30
            factores.append(f"Pulso muy elevado ({ritmo} bpm) — por encima del rango habitual")
        elif ritmo > 100:
            score += 15
            factores.append(f"Pulso elevado ({ritmo} bpm)")
        elif ritmo < 50:
            score += 35
            factores.append(f"Pulso muy bajo ({ritmo} bpm) — por debajo del rango habitual")
        elif ritmo < 60:
            score += 10
            factores.append(f"Pulso bajo ({ritmo} bpm)")

        # Saturación de oxígeno (Umbrales MJC)
        if v.spo2 < 85:
            score += 40
            factores.append(f"Oxígeno muy bajo (SpO2: {v.spo2}%) — muy por debajo del rango habitual")
        elif v.spo2 < 90:
            score += 25
            factores.append(f"Oxígeno bajo (SpO2: {v.spo2}%) — por debajo del rango habitual")
        elif v.spo2 < 94:
            score += 10
            factores.append(f"Oxígeno ligeramente bajo (SpO2: {v.spo2}%)")

        # Presión arterial (Umbrales MJC)
        sistolica = v.presion_sistolica
        diastolica = v.presion_diastolica
        if sistolica > 180 or diastolica > 120:
            score += 35
            factores.append(f"Presión arterial muy elevada ({sistolica}/{diastolica}) — muy por encima del rango habitual")
        elif sistolica > 160 or diastolica > 100:
            score += 20
            factores.append(f"Presión arterial elevada ({sistolica}/{diastolica}) — por encima del rango recomendado")
        elif sistolica < 90 or diastolica < 55:
            score += 30
            factores.append(f"Presión arterial baja ({sistolica}/{diastolica}) — por debajo del rango habitual")
        elif sistolica < 100 or diastolica < 60:
            score += 15
            factores.append(f"Presión ligeramente baja ({sistolica}/{diastolica})")
        elif sistolica >= 140 or diastolica >= 90:
            score += 15
            factores.append(f"Presión por encima del rango recomendado ({sistolica}/{diastolica}) — referencia AHA")
        elif sistolica >= 130 or diastolica >= 80:
            score += 8
            factores.append(f"Presión ligeramente elevada ({sistolica}/{diastolica}) — referencia AHA")

        # Glucosa — ADA Standards of Medical Care 2024
        # Reference: American Diabetes Association, Diabetes Care 2024;47(Suppl.1)
        glucosa = v.glucosa
        if glucosa < 54:
            score += 40
            factores.append(f"Glucosa muy baja ({glucosa} mg/dL) — muy por debajo del rango habitual (ref. ADA)")
        elif glucosa < 70:
            score += 20
            factores.append(f"Glucosa por debajo del rango habitual ({glucosa} mg/dL) — referencia ADA")
        elif glucosa > 300:
            score += 35
            factores.append(f"Glucosa muy elevada ({glucosa} mg/dL) — muy por encima del rango habitual")
        elif glucosa > 250:
            score += 20
            factores.append(f"Glucosa elevada ({glucosa} mg/dL) — por encima del rango habitual")
        elif glucosa > 180:
            score += 10
            factores.append(f"Glucosa ligeramente elevada ({glucosa} mg/dL) — referencia ADA")

        # Temperatura corporal
        if v.temperatura > 40.0:
            score += 30
            factores.append(f"Temperatura muy elevada ({v.temperatura}°C) — por encima del rango habitual")
        elif v.temperatura > 38.5:
            score += 15
            factores.append(f"Temperatura elevada ({v.temperatura}°C)")
        elif v.temperatura < 35.0:
            score += 25
            factores.append(f"Temperatura baja ({v.temperatura}°C) — por debajo del rango habitual")
        elif v.temperatura < 35.5:
            score += 10
            factores.append(f"Temperatura ligeramente baja ({v.temperatura}°C)")

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
