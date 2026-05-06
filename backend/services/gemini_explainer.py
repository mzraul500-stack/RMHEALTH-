import os
import json
import logging
from typing import Dict, Any, List

# Manejo seguro para que no falle si la librería no está instalada aún.
try:
    import vertexai
    from vertexai.generative_models import GenerativeModel, GenerationConfig
    VERTEX_AVAILABLE = True
except ImportError:
    VERTEX_AVAILABLE = False

logger = logging.getLogger(__name__)

# Feature flag apagado por defecto, variables configurables por entorno.
GEMINI_EXPLAINER_ENABLED = os.environ.get("GEMINI_EXPLAINER_ENABLED", "false").lower() == "true"
GCP_PROJECT_ID = os.environ.get("GCP_PROJECT_ID", "rmhealth-494123")
VERTEX_AI_LOCATION = os.environ.get("VERTEX_AI_LOCATION", "us-central1")
GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "gemini-1.5-flash")
GEMINI_TIMEOUT_SECONDS = int(os.environ.get("GEMINI_TIMEOUT_SECONDS", "3"))

_vertex_initialized = False

def _init_vertex():
    """Inicializa la API de Vertex de manera perezosa (lazy)."""
    global _vertex_initialized
    if not _vertex_initialized and VERTEX_AVAILABLE:
        try:
            vertexai.init(project=GCP_PROJECT_ID, location=VERTEX_AI_LOCATION)
            _vertex_initialized = True
        except Exception as e:
            logger.error(f"Error inicializando Vertex AI: {e}")

def fallback_explanation() -> Dict[str, Any]:
    """
    Respuesta genérica y segura en caso de fallo, timeout, 
    o si la característica (feature flag) está deshabilitada.
    """
    return {
        "explicacion_educativa": "Análisis completado mediante el motor médico de RMHealth. Los datos han sido procesados y las alertas clínicas se mantienen activas según el protocolo de la aplicación.",
        "resumen_para_familiar": "El paciente ha sido evaluado localmente y el estado clínico está siendo monitoreado.",
        "resumen_para_medico": "Evaluar los signos vitales y la criticidad detectada por el algoritmo de RMHealth.",
        "acciones_generales": ["Siga las indicaciones preventivas de la aplicación", "Mantenga la calma"],
        "disclaimer": "RMHealth proporciona observaciones preventivas. No constituye diagnóstico médico."
    }

def build_safe_prompt(analysis_result: Dict[str, Any], vitals: Dict[str, Any], patient_context: Dict[str, Any]) -> str:
    """
    Construye un prompt seguro que impide que Gemini asuma roles de diagnóstico o decisión.
    Inyecta la criticidad calculada previamente por el modelo local.
    """
    criticidad = analysis_result.get("nivel_criticidad", "DESCONOCIDO")
    riesgo = analysis_result.get("score_riesgo", "0")
    factores = analysis_result.get("factores_riesgo", [])
    
    prompt = f"""
Eres un asistente de comunicación educativa para una aplicación de monitoreo de salud.
Tu ÚNICA tarea es explicar en lenguaje natural una decisión MÉDICA que YA FUE TOMADA por un motor clínico (RMHealth).
NO DEBES DIAGNOSTICAR. NO DEBES RECETAR. NO DEBES CAMBIAR EL NIVEL DE CRITICIDAD. ERES SÓLO UN TRADUCTOR A LENGUAJE COMÚN.

Nivel de Criticidad final dictaminado por RMHealth: {criticidad}
Puntuación de riesgo: {riesgo}
Factores de riesgo identificados: {', '.join(factores) if factores else 'Ninguno'}

Signos vitales brutos:
{json.dumps(vitals, indent=2)}

Contexto del paciente (no sensible):
{json.dumps(patient_context, indent=2)}

Genera una respuesta en formato JSON estricto con los siguientes campos y NINGÚN OTRO:
- "explicacion_educativa": Explicación didáctica y comprensible sobre qué significan los factores de riesgo de manera general.
- "resumen_para_familiar": Un párrafo empático, claro y breve dirigido a un familiar, sin jerga médica.
- "resumen_para_medico": Un resumen clínico para el médico tratante sobre el estado vital, mencionando que la criticidad es '{criticidad}'.
- "acciones_generales": Array de strings con acciones recomendadas no médicas (ej. "mantener reposo", "ventilar la habitación").
- "disclaimer": Debe decir EXACTAMENTE "RMHealth proporciona observaciones preventivas. No constituye diagnóstico médico."
"""
    return prompt

def validate_gemini_response(response_text: str) -> Dict[str, Any]:
    """
    Asegura que el JSON devuelto por Gemini sea válido, que no falten campos
    y reescribe obligatoriamente el disclaimer clínico de RMHealth.
    """
    try:
        # Vertex AI Gemini suele devolver el JSON envuelto en bloques markdown (```json ... ```)
        text = response_text.strip()
        if text.startswith("```json"):
            text = text[7:]
        if text.endswith("```"):
            text = text[:-3]
            
        data = json.loads(text.strip())
        
        # Validación de campos mínimos requeridos
        required_keys = ["explicacion_educativa", "resumen_para_familiar", "resumen_para_medico", "acciones_generales"]
        for key in required_keys:
            if key not in data or not data[key]:
                logger.warning(f"Respuesta de Gemini carece de '{key}', aplicando fallback para ese campo.")
                data[key] = fallback_explanation()[key]
        
        # Regla estricta JIDOKA: Sobreescribir disclaimer siempre.
        data["disclaimer"] = "RMHealth proporciona observaciones preventivas. No constituye diagnóstico médico."
        
        return data
        
    except json.JSONDecodeError:
        logger.error("Error al decodificar la respuesta JSON de Gemini.")
        return fallback_explanation()

def explain_risk_with_gemini(analysis_result: Dict[str, Any], vitals: Dict[str, Any], patient_context: Dict[str, Any]) -> Dict[str, Any]:
    """
    Punto de entrada. Si está habilitado, invoca al LLM para obtener la explicación.
    Contiene un fallback incondicional ante cualquier error.
    """
    if not GEMINI_EXPLAINER_ENABLED:
        return fallback_explanation()
        
    if not VERTEX_AVAILABLE:
        logger.warning("Librería google-cloud-aiplatform no instalada. Fallback activado.")
        return fallback_explanation()
        
    _init_vertex()
    prompt = build_safe_prompt(analysis_result, vitals, patient_context)
    
    try:
        model = GenerativeModel(GEMINI_MODEL)
        
        # Configuración que exige salida JSON determinista (Flash)
        config = GenerationConfig(
            response_mime_type="application/json",
            temperature=0.2 
        )
        
        # Nota: El control asíncrono estricto de timeout (GEMINI_TIMEOUT_SECONDS) se implementaría
        # preferiblemente en el loop del backend (asyncio.wait_for) al usar generate_content_async.
        # Por seguridad en este scope aislado síncrono, si falla algo (timeout de la red incluido), se captura abajo.
        response = model.generate_content(
            prompt,
            generation_config=config,
            # No se puede pasar timeout directo aquí en el SDK sin kwargs custom de request,
            # el fallo de conexión lo capturará la excepción genérica.
        )
        
        if response and response.text:
            return validate_gemini_response(response.text)
        else:
            return fallback_explanation()
            
    except Exception as e:
        logger.error(f"Fallo en comunicación con Vertex AI. Se usa fallback local. Detalle: {e}")
        return fallback_explanation()
