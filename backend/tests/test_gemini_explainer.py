import sys
import os
import json
import unittest
from unittest.mock import patch, MagicMock

# Mockear google-cloud-aiplatform (vertexai) ANTES de importar gemini_explainer
# Esto permite que la prueba pase en entornos donde la librería aún no se ha instalado,
# cumpliendo la directriz estricta de no instalar dependencias sin autorización.
mock_vertexai = MagicMock()
mock_generative_models = MagicMock()
mock_generative_model_class = MagicMock()
mock_generation_config_class = MagicMock()

mock_vertexai.generative_models = mock_generative_models
mock_generative_models.GenerativeModel = mock_generative_model_class
mock_generative_models.GenerationConfig = mock_generation_config_class

sys.modules['vertexai'] = mock_vertexai
sys.modules['vertexai.generative_models'] = mock_generative_models

# Configuramos variables de entorno seguras para el test
with patch.dict('os.environ', {
    'GEMINI_EXPLAINER_ENABLED': 'true',
    'GCP_PROJECT_ID': 'test-rmhealth',
    'VERTEX_AI_LOCATION': 'us-central1',
    'GEMINI_MODEL': 'gemini-1.5-flash-test',
    'GEMINI_TIMEOUT_SECONDS': '3'
}):
    from services.gemini_explainer import (
        explain_risk_with_gemini,
        fallback_explanation,
        build_safe_prompt,
        validate_gemini_response
    )

class TestGeminiExplainer(unittest.TestCase):
    
    def setUp(self):
        # Datos de entrada controlados (mock del engine local de RMHealth)
        self.analysis_result = {
            "nivel_criticidad": "CRITICO",
            "score_riesgo": 95,
            "factores_riesgo": ["Hipotensión severa", "Taquicardia"]
        }
        self.vitals = {"hr": 140, "bp_sys": 80}
        self.context = {"age": 65, "gender": "F"}

    def test_fallback_explanation_structure(self):
        """Verifica que el fallback siempre contenga el disclaimer requerido y los campos mínimos."""
        fallback = fallback_explanation()
        self.assertEqual(fallback["disclaimer"], "RMHealth proporciona observaciones preventivas. No constituye diagnóstico médico.")
        self.assertIn("explicacion_educativa", fallback)
        self.assertIn("resumen_para_medico", fallback)
        
    def test_build_safe_prompt(self):
        """Asegura que el prompt construido inyecte el nivel de criticidad real y las prohibiciones."""
        prompt = build_safe_prompt(self.analysis_result, self.vitals, self.context)
        self.assertIn("Nivel de Criticidad final dictaminado por RMHealth: CRITICO", prompt)
        self.assertIn("NO DEBES DIAGNOSTICAR", prompt)
        self.assertIn("NO DEBES RECETAR", prompt)
        self.assertIn("NO DEBES CAMBIAR EL NIVEL DE CRITICIDAD", prompt)
        self.assertIn("140", prompt) # HR

    def test_validate_gemini_response_valid_json(self):
        """Verifica que un JSON válido de Gemini se parsee correctamente y el disclaimer sea reescrito."""
        valid_json = json.dumps({
            "explicacion_educativa": "Explicación correcta",
            "resumen_para_familiar": "Resumen fam",
            "resumen_para_medico": "Resumen med",
            "acciones_generales": ["Accion 1"],
            "disclaimer": "Disclaimer falso que la IA intentó meter"
        })
        parsed = validate_gemini_response(valid_json)
        self.assertEqual(parsed["explicacion_educativa"], "Explicación correcta")
        # El disclaimer DEBE ser sobreescrito por la regla dura
        self.assertEqual(parsed["disclaimer"], "RMHealth proporciona observaciones preventivas. No constituye diagnóstico médico.")

    def test_validate_gemini_response_markdown_json(self):
        """Verifica la limpieza de Markdown (```json ... ```) común en respuestas de Gemini."""
        md_json = "```json\n" + json.dumps({
            "explicacion_educativa": "MD",
            "resumen_para_familiar": "F",
            "resumen_para_medico": "M",
            "acciones_generales": ["A"]
        }) + "\n```"
        parsed = validate_gemini_response(md_json)
        self.assertEqual(parsed["explicacion_educativa"], "MD")

    def test_validate_gemini_response_invalid_json(self):
        """Verifica que si Gemini responde basura, el módulo caiga al fallback sin romper la API."""
        parsed = validate_gemini_response("Soy Gemini y me negué a dar JSON.")
        self.assertEqual(parsed["explicacion_educativa"], fallback_explanation()["explicacion_educativa"])

    @patch('services.gemini_explainer.GEMINI_EXPLAINER_ENABLED', False)
    def test_explain_risk_disabled_flag(self):
        """Si el feature flag es falso, NUNCA debe llamar a Vertex, devolviendo fallback."""
        result = explain_risk_with_gemini(self.analysis_result, self.vitals, self.context)
        self.assertEqual(result, fallback_explanation())
        
    @patch('services.gemini_explainer.GenerativeModel')
    @patch('services.gemini_explainer.GEMINI_EXPLAINER_ENABLED', True)
    @patch('services.gemini_explainer.VERTEX_AVAILABLE', True)
    def test_successful_gemini_call(self, mock_generative_model_class):
        """Prueba una llamada exitosa a Vertex usando Mocks."""
        mock_model_instance = MagicMock()
        mock_generative_model_class.return_value = mock_model_instance
        
        mock_response = MagicMock()
        mock_response.text = json.dumps({
            "explicacion_educativa": "Todo en orden, este es un análisis.",
            "resumen_para_familiar": "Tranquilo.",
            "resumen_para_medico": "Paciente estable.",
            "acciones_generales": ["Observar"]
        })
        mock_model_instance.generate_content.return_value = mock_response
        
        result = explain_risk_with_gemini(self.analysis_result, self.vitals, self.context)
        
        self.assertEqual(result["explicacion_educativa"], "Todo en orden, este es un análisis.")
        mock_generative_model_class.assert_called_once_with('gemini-1.5-flash-test')
        mock_model_instance.generate_content.assert_called_once()

    @patch('services.gemini_explainer.GenerativeModel')
    @patch('services.gemini_explainer.GEMINI_EXPLAINER_ENABLED', True)
    @patch('services.gemini_explainer.VERTEX_AVAILABLE', True)
    def test_timeout_or_exception(self, mock_generative_model_class):
        """Prueba que si ocurre una excepción de red o VertexAI, caemos al fallback limpio."""
        mock_model_instance = MagicMock()
        mock_generative_model_class.return_value = mock_model_instance
        
        # Simulamos que ocurre un error de Google Cloud o Timeout
        mock_model_instance.generate_content.side_effect = Exception("Vertex API Deadline Exceeded")
        
        result = explain_risk_with_gemini(self.analysis_result, self.vitals, self.context)
        
        # Debemos recibir el fallback en lugar de crashear la aplicación
        self.assertEqual(result, fallback_explanation())

if __name__ == '__main__':
    unittest.main()
