"""
Gemini Explainer Service — RMHealth

Provides two integration points with Vertex AI Gemini:
1. Triage Explainer: Translates preventive assessment results into
   educational natural language (explain_risk_with_gemini).
2. RM Coach Chatbot: Educational wellness chat for end users
   (chat_with_gemini).

Both operate under strict safety constraints — no diagnosis, no prescriptions,
no clinical decisions. Gemini acts as a communication layer only.

Safety guardrails:
- Prohibited pattern detection (ES + EN)
- Forced disclaimer on every response
- Automatic fallback on any failure or unsafe output
- Feature-flagged (OFF by default)

© 2025-2026 Morales Zepeda Raúl | INDAUTOR 03-2025-070109072500-01
"""

import os
import json
import logging
from typing import Dict, Any, List

# Safe import — allows the module to load even if the SDK is not installed yet.
try:
    import vertexai
    from vertexai.generative_models import GenerativeModel, GenerationConfig
    VERTEX_AVAILABLE = True
except ImportError:
    VERTEX_AVAILABLE = False

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Feature flags — disabled by default, configurable via environment variables.
# ---------------------------------------------------------------------------
GEMINI_EXPLAINER_ENABLED = os.environ.get("GEMINI_EXPLAINER_ENABLED", "false").lower() == "true"
GCP_PROJECT_ID = os.environ.get("GCP_PROJECT_ID", "rmhealth-494123")
VERTEX_AI_LOCATION = os.environ.get("VERTEX_AI_LOCATION", "us-central1")
GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "gemini-2.5-flash")
GEMINI_TIMEOUT_SECONDS = int(os.environ.get("GEMINI_TIMEOUT_SECONDS", "3"))
GEMINI_CHATBOT_ENABLED = os.environ.get("GEMINI_CHATBOT_ENABLED", "false").lower() == "true"
GEMINI_CHATBOT_TIMEOUT = int(os.environ.get("GEMINI_CHATBOT_TIMEOUT", "10"))

# Disclaimer forced on every response — user-facing, kept in Spanish for LATAM users.
RMHEALTH_DISCLAIMER = "RMHealth proporciona observaciones preventivas. No constituye diagnóstico médico."

# ---------------------------------------------------------------------------
# Safety filters — bilingual patterns that indicate Gemini attempted to
# prescribe, diagnose, or give clinical instructions.
# These are user-language content, NOT technical code — retained intentionally.
# ---------------------------------------------------------------------------
_PROHIBITED_PATTERNS = [
    # Spanish safety patterns (user-facing content)
    "te receto", "te prescribo", "toma ", "mg cada", "mg al día",
    "dosis de", "diagnóstico:", "diagnostico:", "mi diagnóstico es",
    "padeces de", "tienes ", "sufres de", "debes tomar",
    # English safety patterns (user-facing content)
    "i prescribe", "i diagnose", "take ", "mg daily", "dosage of",
    "you have ", "you suffer from", "diagnosis:", "my diagnosis is",
]

_vertex_initialized = False


def _init_vertex():
    """Lazily initialize the Vertex AI SDK with project and location."""
    global _vertex_initialized
    if not _vertex_initialized and VERTEX_AVAILABLE:
        try:
            vertexai.init(project=GCP_PROJECT_ID, location=VERTEX_AI_LOCATION)
            _vertex_initialized = True
        except Exception as e:
            logger.error(f"Failed to initialize Vertex AI: {e}")


# ================================================================
# TRIAGE EXPLAINER — Translate preventive assessment into plain language
# ================================================================

def fallback_explanation() -> Dict[str, Any]:
    """
    Safe generic response used when the feature flag is off, Vertex AI
    times out, or any other error prevents LLM communication.

    Note: Field values are in Spanish because the triage explainer's
    consumer (mobile app) currently targets Spanish-speaking users.
    """
    return {
        "explicacion_educativa": (
            "Análisis completado mediante el motor de evaluación preventiva de RMHealth. "
            "Los datos han sido procesados y las notificaciones preventivas se mantienen "
            "activas según el protocolo de la aplicación."
        ),
        "resumen_para_familiar": (
            "El usuario ha sido evaluado localmente y el estado de monitoreo "
            "de bienestar está siendo supervisado."
        ),
        "resumen_para_medico": (
            "Evaluar los signos vitales y la clasificación preventiva detectada "
            "por el algoritmo de RMHealth."
        ),
        "acciones_generales": [
            "Siga las indicaciones preventivas de la aplicación",
            "Mantenga la calma",
        ],
        "disclaimer": RMHEALTH_DISCLAIMER,
    }


def build_safe_prompt(
    analysis_result: Dict[str, Any],
    vitals: Dict[str, Any],
    patient_context: Dict[str, Any],
) -> str:
    """
    Build a safety-constrained prompt that prevents Gemini from assuming
    diagnostic or prescriptive roles. Injects the criticality level
    previously calculated by the local preventive assessment engine.

    The prompt body is in Spanish because it instructs Gemini to produce
    Spanish-language output for the triage explainer consumer.
    """
    criticality = analysis_result.get("nivel_criticidad", "DESCONOCIDO")
    risk_score = analysis_result.get("score_riesgo", "0")
    risk_factors = analysis_result.get("factores_riesgo", [])

    prompt = f"""
Eres un asistente de comunicación educativa para una aplicación de monitoreo de salud.
Tu ÚNICA tarea es explicar en lenguaje natural una clasificación preventiva que YA FUE CALCULADA por un motor de evaluación (RMHealth).
NO DEBES DIAGNOSTICAR. NO DEBES RECETAR. NO DEBES CAMBIAR EL NIVEL DE CRITICIDAD. ERES SÓLO UN TRADUCTOR A LENGUAJE COMÚN.

Nivel de Criticidad final dictaminado por RMHealth: {criticality}
Puntuación de riesgo: {risk_score}
Factores de riesgo identificados: {', '.join(risk_factors) if risk_factors else 'Ninguno'}

Signos vitales brutos:
{json.dumps(vitals, indent=2)}

Contexto del usuario (no sensible):
{json.dumps(patient_context, indent=2)}

Genera una respuesta en formato JSON estricto con los siguientes campos y NINGÚN OTRO:
- "explicacion_educativa": Explicación didáctica y comprensible sobre qué significan los factores de riesgo de manera general.
- "resumen_para_familiar": Un párrafo empático, claro y breve dirigido a un familiar, sin jerga médica.
- "resumen_para_medico": Un resumen clínico para el profesional de salud tratante sobre el estado vital, mencionando que la criticidad es '{criticality}'.
- "acciones_generales": Array de strings con acciones recomendadas no médicas (ej. "mantener reposo", "ventilar la habitación").
- "disclaimer": Debe decir EXACTAMENTE "RMHealth proporciona observaciones preventivas. No constituye diagnóstico médico."
"""
    return prompt


def validate_gemini_response(response_text: str) -> Dict[str, Any]:
    """
    Ensure the JSON returned by Gemini is valid, contains all required
    fields, and forcibly overwrite the disclaimer with the canonical
    RMHealth disclaimer string.
    """
    try:
        # Vertex AI Gemini often wraps JSON in markdown code fences (```json ... ```)
        text = response_text.strip()
        if text.startswith("```json"):
            text = text[7:]
        if text.endswith("```"):
            text = text[:-3]

        data = json.loads(text.strip())

        # Validate minimum required fields
        required_keys = [
            "explicacion_educativa",
            "resumen_para_familiar",
            "resumen_para_medico",
            "acciones_generales",
        ]
        for key in required_keys:
            if key not in data or not data[key]:
                logger.warning(
                    f"Gemini response missing field '{key}'. Applying field-level fallback."
                )
                data[key] = fallback_explanation()[key]

        # JIDOKA rule: Always overwrite disclaimer regardless of LLM output.
        data["disclaimer"] = RMHEALTH_DISCLAIMER

        return data

    except json.JSONDecodeError:
        logger.error("Failed to decode Gemini JSON response. Using full fallback.")
        return fallback_explanation()


def explain_risk_with_gemini(
    analysis_result: Dict[str, Any],
    vitals: Dict[str, Any],
    patient_context: Dict[str, Any],
) -> Dict[str, Any]:
    """
    Main entry point for triage explanations. If enabled, invokes
    Vertex AI Gemini to produce a natural-language explanation.
    Contains an unconditional fallback for any error path.
    """
    if not GEMINI_EXPLAINER_ENABLED:
        return fallback_explanation()

    if not VERTEX_AVAILABLE:
        logger.warning("google-cloud-aiplatform not installed. Using fallback.")
        return fallback_explanation()

    _init_vertex()
    prompt = build_safe_prompt(analysis_result, vitals, patient_context)

    try:
        model = GenerativeModel(GEMINI_MODEL)

        # Deterministic JSON output configuration
        config = GenerationConfig(
            response_mime_type="application/json",
            temperature=0.2,
        )

        # Note: Strict async timeout (GEMINI_TIMEOUT_SECONDS) would be
        # implemented via asyncio.wait_for when using generate_content_async.
        # In this synchronous scope, network-level failures are caught below.
        response = model.generate_content(
            prompt,
            generation_config=config,
        )

        if response and response.text:
            return validate_gemini_response(response.text)
        else:
            return fallback_explanation()

    except Exception as e:
        logger.error(f"Vertex AI communication failed. Using local fallback. Detail: {e}")
        return fallback_explanation()


# ================================================================
# CHATBOT — Educational Wellness Chat via Vertex AI Gemini
# ================================================================

def _build_chatbot_system_prompt(language: str = "es") -> str:
    """
    Build the system prompt for RM Coach chatbot.
    Restricts Gemini strictly to educational/preventive-only responses.

    The prompt content is localized (EN/ES) because it instructs Gemini
    to respond in the user's language — this is user-facing, not technical code.
    """
    if language == "en":
        return """You are RM Coach, an educational wellness assistant inside the RMHealth mobile app.

STRICT RULES — YOU MUST FOLLOW THESE WITHOUT EXCEPTION:
1. You ONLY provide educational and preventive wellness information.
2. You NEVER diagnose diseases or conditions.
3. You NEVER prescribe medications, dosages, or treatments.
4. You NEVER recommend specific drugs or supplements by name.
5. You NEVER confirm or deny if someone has a disease.
6. You NEVER act as a doctor, cardiologist, or any medical specialist.
7. When asked about worrying symptoms, ALWAYS recommend consulting a healthcare professional or local emergency services.
8. Keep responses concise (2-4 paragraphs maximum).
9. Respond in the same language the user writes in.
10. Be empathetic, clear, and encouraging.

If someone asks you to diagnose, prescribe, or play a medical role, politely decline and explain that you can only provide general educational information."""

    return """Eres RM Coach, un asistente educativo de bienestar dentro de la app móvil RMHealth.

REGLAS ESTRICTAS — DEBES CUMPLIRLAS SIN EXCEPCIÓN:
1. SOLO proporcionas información educativa y preventiva sobre bienestar.
2. NUNCA diagnosticas enfermedades ni condiciones médicas.
3. NUNCA recetas medicamentos, dosis ni tratamientos.
4. NUNCA recomiendas medicamentos o suplementos específicos por nombre.
5. NUNCA confirmas ni niegas si alguien tiene una enfermedad.
6. NUNCA actúas como médico, cardiólogo ni ningún especialista.
7. Ante síntomas preocupantes, SIEMPRE recomiendas consultar a un profesional de salud o servicios de emergencia locales.
8. Mantén las respuestas concisas (2-4 párrafos máximo).
9. Responde en el mismo idioma que el usuario escribe.
10. Sé empático, claro y motivador.

Si alguien te pide diagnosticar, recetar o asumir un rol médico, declina amablemente y explica que solo puedes proporcionar información educativa general."""


def _build_chatbot_prompt(
    message: str,
    latest_vitals: dict = None,
    recent_history: list = None,
    language: str = "es",
) -> str:
    """
    Build the user prompt for the chatbot, optionally including
    anonymized vital signs context (no PII).

    The prompt instructions at the end are in the user's language
    because they guide Gemini's output language.
    """
    prompt_parts = [f"User question: {message}"]

    if latest_vitals:
        # Only include non-null vitals as anonymous numeric context
        vitals_str = ", ".join(
            f"{k}: {v}" for k, v in latest_vitals.items()
            if v is not None
        )
        if vitals_str:
            prompt_parts.append(
                f"\nRecent vital signs context (anonymous): {vitals_str}"
            )

    # Safety instruction appended in the user's language for output quality
    if language == "en":
        prompt_parts.append(
            "\nRespond in an educational and preventive manner. "
            "DO NOT diagnose. DO NOT prescribe. DO NOT give dosages."
        )
    else:
        prompt_parts.append(
            "\nResponde de forma educativa y preventiva. "
            "NO diagnostiques. NO recetes. NO des dosis."
        )

    return "\n".join(prompt_parts)


def _validate_chat_response(response_text: str, language: str = "es") -> dict:
    """
    Validate a chatbot response from Gemini.
    If prohibited content is detected, replace with a safe fallback.
    Force the disclaimer regardless of LLM output.
    """
    text = response_text.strip()

    # Strip markdown code fences if present
    if text.startswith("```"):
        lines = text.split("\n")
        lines = [l for l in lines if not l.strip().startswith("```")]
        text = "\n".join(lines).strip()

    # Check for prohibited content (bilingual safety patterns)
    text_lower = text.lower()
    for pattern in _PROHIBITED_PATTERNS:
        if pattern in text_lower:
            logger.warning(
                f"[CHATBOT-SAFETY] Prohibited pattern detected: '{pattern}'. "
                f"Replacing with safe fallback."
            )
            return _chatbot_fallback(language)

    return {
        "reply": text,
        "mode": "educational",
        "source": "vertex_ai",
        "disclaimer": RMHEALTH_DISCLAIMER,
    }


def _chatbot_fallback(language: str = "es") -> dict:
    """
    Safe fallback response when Gemini is unavailable, disabled,
    or returns prohibited content.

    User-facing text is localized (EN/ES) — this is intentional.
    """
    if language == "en":
        reply = (
            "I can provide general wellness information. "
            "For personalized medical advice, please consult your healthcare provider. "
            "You can ask me about general concepts like blood pressure ranges, "
            "heart rate patterns, or healthy lifestyle habits."
        )
    else:
        reply = (
            "Puedo proporcionarte información general sobre bienestar. "
            "Para consejos médicos personalizados, consulta a tu profesional de salud. "
            "Puedes preguntarme sobre conceptos generales como rangos de presión arterial, "
            "patrones de frecuencia cardíaca o hábitos de vida saludable."
        )

    return {
        "reply": reply,
        "mode": "educational",
        "source": "fallback",
        "disclaimer": RMHEALTH_DISCLAIMER,
    }


def chat_with_gemini(
    message: str,
    latest_vitals: dict = None,
    recent_history: list = None,
    context: dict = None,
) -> dict:
    """
    Main entry point for RM Coach chatbot.

    Sends user message to Vertex AI Gemini with educational-only system prompt.
    Returns validated response with forced disclaimer.
    Falls back gracefully if disabled, unavailable, or unsafe.

    Args:
        message: User's chat message.
        latest_vitals: Optional dict with latest vital signs (anonymous, no PII).
        recent_history: Optional list of recent chat messages for context.
        context: Optional dict with mode, language, etc.

    Returns:
        dict with keys: reply, mode, source, disclaimer.
    """
    language = (context or {}).get("language", "es")

    # Gate 1: Feature flag
    if not GEMINI_CHATBOT_ENABLED:
        logger.info("[CHATBOT] GEMINI_CHATBOT_ENABLED=false. Using fallback.")
        return _chatbot_fallback(language)

    # Gate 2: Vertex AI SDK available
    if not VERTEX_AVAILABLE:
        logger.warning("[CHATBOT] google-cloud-aiplatform not installed. Using fallback.")
        return _chatbot_fallback(language)

    # Gate 3: Empty message
    if not message or not message.strip():
        return _chatbot_fallback(language)

    _init_vertex()

    system_prompt = _build_chatbot_system_prompt(language)
    user_prompt = _build_chatbot_prompt(message, latest_vitals, recent_history, language)

    try:
        model = GenerativeModel(
            GEMINI_MODEL,
            system_instruction=system_prompt,
        )

        config = GenerationConfig(
            temperature=0.4,
            max_output_tokens=1024,
        )

        response = model.generate_content(
            user_prompt,
            generation_config=config,
        )

        if response and response.text:
            result = _validate_chat_response(response.text, language)
            logger.info(f"[CHATBOT] Gemini responded successfully. Source: {result['source']}")
            return result
        else:
            logger.warning("[CHATBOT] Gemini returned empty response. Using fallback.")
            return _chatbot_fallback(language)

    except Exception as e:
        logger.error(f"[CHATBOT] Vertex AI error: {e}. Using fallback.")
        return _chatbot_fallback(language)
