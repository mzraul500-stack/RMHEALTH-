"""
Tests for the Gemini Explainer Service — Triage explanation functions.

Tests run with mocked Vertex AI SDK to avoid real API calls.
Validates fallback behavior, prompt construction, response validation,
and safety guardrails.

© 2025-2026 Morales Zepeda Raúl | INDAUTOR 03-2025-070109072500-01
"""

import sys
import os
import json
import unittest
from unittest.mock import patch, MagicMock

# Mock google-cloud-aiplatform (vertexai) BEFORE importing gemini_explainer.
# This allows tests to pass in environments where the SDK is not yet installed,
# following the strict directive of no unauthorized dependency installation.
mock_vertexai = MagicMock()
mock_generative_models = MagicMock()
mock_generative_model_class = MagicMock()
mock_generation_config_class = MagicMock()

mock_vertexai.generative_models = mock_generative_models
mock_generative_models.GenerativeModel = mock_generative_model_class
mock_generative_models.GenerationConfig = mock_generation_config_class

sys.modules['vertexai'] = mock_vertexai
sys.modules['vertexai.generative_models'] = mock_generative_models

# Set safe environment variables for testing
with patch.dict('os.environ', {
    'GEMINI_EXPLAINER_ENABLED': 'true',
    'GCP_PROJECT_ID': 'test-rmhealth',
    'VERTEX_AI_LOCATION': 'us-central1',
    'GEMINI_MODEL': 'gemini-1.5-flash-test',
    'GEMINI_TIMEOUT_SECONDS': '3'
}):
    from backend.services.gemini_explainer import (
        explain_risk_with_gemini,
        fallback_explanation,
        build_safe_prompt,
        validate_gemini_response
    )

class TestGeminiExplainer(unittest.TestCase):

    def setUp(self):
        """Set up controlled input data (mock of the local preventive assessment engine)."""
        self.analysis_result = {
            "nivel_criticidad": "CRITICO",
            "score_riesgo": 95,
            "factores_riesgo": ["Hipotensión severa", "Taquicardia"]
        }
        self.vitals = {"hr": 140, "bp_sys": 80}
        self.context = {"age": 65, "gender": "F"}

    def test_fallback_explanation_structure(self):
        """Verify fallback always contains the required disclaimer and minimum fields."""
        fallback = fallback_explanation()
        self.assertEqual(
            fallback["disclaimer"],
            "RMHealth proporciona observaciones preventivas. No constituye diagnóstico médico."
        )
        self.assertIn("explicacion_educativa", fallback)
        self.assertIn("resumen_para_medico", fallback)

    def test_build_safe_prompt(self):
        """Ensure the prompt injects the real criticality level and safety prohibitions."""
        prompt = build_safe_prompt(self.analysis_result, self.vitals, self.context)
        self.assertIn("Nivel de Criticidad final dictaminado por RMHealth: CRITICO", prompt)
        self.assertIn("NO DEBES DIAGNOSTICAR", prompt)
        self.assertIn("NO DEBES RECETAR", prompt)
        self.assertIn("NO DEBES CAMBIAR EL NIVEL DE CRITICIDAD", prompt)
        self.assertIn("140", prompt)  # HR value

    def test_validate_gemini_response_valid_json(self):
        """Verify valid Gemini JSON is parsed correctly and the disclaimer is overwritten."""
        valid_json = json.dumps({
            "explicacion_educativa": "Explicación correcta",
            "resumen_para_familiar": "Resumen fam",
            "resumen_para_medico": "Resumen med",
            "acciones_generales": ["Accion 1"],
            "disclaimer": "Fake disclaimer the AI tried to inject"
        })
        parsed = validate_gemini_response(valid_json)
        self.assertEqual(parsed["explicacion_educativa"], "Explicación correcta")
        # Disclaimer MUST be overwritten by the hard rule
        self.assertEqual(
            parsed["disclaimer"],
            "RMHealth proporciona observaciones preventivas. No constituye diagnóstico médico."
        )

    def test_validate_gemini_response_markdown_json(self):
        """Verify markdown fence cleanup (```json ... ```) common in Gemini responses."""
        md_json = "```json\n" + json.dumps({
            "explicacion_educativa": "MD",
            "resumen_para_familiar": "F",
            "resumen_para_medico": "M",
            "acciones_generales": ["A"]
        }) + "\n```"
        parsed = validate_gemini_response(md_json)
        self.assertEqual(parsed["explicacion_educativa"], "MD")

    def test_validate_gemini_response_invalid_json(self):
        """Verify that garbage Gemini output triggers fallback without crashing the API."""
        parsed = validate_gemini_response("I am Gemini and I refused to give JSON.")
        self.assertEqual(parsed["explicacion_educativa"], fallback_explanation()["explicacion_educativa"])

    @patch('backend.services.gemini_explainer.GEMINI_EXPLAINER_ENABLED', False)
    def test_explain_risk_disabled_flag(self):
        """If the feature flag is false, Vertex must NEVER be called — returns fallback."""
        result = explain_risk_with_gemini(self.analysis_result, self.vitals, self.context)
        self.assertEqual(result, fallback_explanation())

    @patch('backend.services.gemini_explainer.GenerativeModel')
    @patch('backend.services.gemini_explainer.GEMINI_EXPLAINER_ENABLED', True)
    @patch('backend.services.gemini_explainer.VERTEX_AVAILABLE', True)
    @patch('backend.services.gemini_explainer.GEMINI_MODEL', 'gemini-1.5-flash-test')
    def test_successful_gemini_call(self, mock_generative_model_class):
        """Test a successful Vertex AI call using mocks."""
        mock_model_instance = MagicMock()
        mock_generative_model_class.return_value = mock_model_instance

        mock_response = MagicMock()
        mock_response.text = json.dumps({
            "explicacion_educativa": "Todo en orden, este es un análisis.",
            "resumen_para_familiar": "Tranquilo.",
            "resumen_para_medico": "User stable.",
            "acciones_generales": ["Observar"]
        })
        mock_model_instance.generate_content.return_value = mock_response

        result = explain_risk_with_gemini(self.analysis_result, self.vitals, self.context)

        self.assertEqual(result["explicacion_educativa"], "Todo en orden, este es un análisis.")
        mock_generative_model_class.assert_called_once_with('gemini-1.5-flash-test')
        mock_model_instance.generate_content.assert_called_once()

    @patch('backend.services.gemini_explainer.GenerativeModel')
    @patch('backend.services.gemini_explainer.GEMINI_EXPLAINER_ENABLED', True)
    @patch('backend.services.gemini_explainer.VERTEX_AVAILABLE', True)
    def test_timeout_or_exception(self, mock_generative_model_class):
        """Test that network or Vertex AI exceptions trigger clean fallback."""
        mock_model_instance = MagicMock()
        mock_generative_model_class.return_value = mock_model_instance

        # Simulate a Google Cloud or timeout error
        mock_model_instance.generate_content.side_effect = Exception("Vertex API Deadline Exceeded")

        result = explain_risk_with_gemini(self.analysis_result, self.vitals, self.context)

        # Must receive fallback instead of crashing the application
        self.assertEqual(result, fallback_explanation())

if __name__ == '__main__':
    unittest.main()
