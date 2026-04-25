import json
from backend.services.medical_engine import MedicalEngine, VitalsInput, PatientContext

def test_engine():
    print("--- TESTING RMHEALTH MEDICAL ENGINE (CEREBRO) ---\n")
    
    scenarios = [
        {
            "name": "CASE 1: Healthy Adult",
            "vitals": VitalsInput(
                usuario_id="user_001",
                ritmo_cardiaco=72,
                spo2=98,
                presion_sistolica=115,
                presion_diastolica=75,
                temperatura=36.6
            ),
            "context": PatientContext(edad=30)
        },
        {
            "name": "CASE 2: Hypertensive Crisis (Critical)",
            "vitals": VitalsInput(
                usuario_id="user_002",
                ritmo_cardiaco=85,
                spo2=96,
                presion_sistolica=195,
                presion_diastolica=122,
                temperatura=36.8
            ),
            "context": PatientContext(
                edad=55, 
                hipertenso=True,
                nombre_completo="Raúl Morales Zepeda",
                tipo_sangre="O+",
                contacto_emergencia_nombre="Maria Zepeda",
                contacto_emergencia_tel="+52 33 1234 5678"
            )
        },
        {
            "name": "CASE 3: Elderly with Tachycardia",
            "vitals": VitalsInput(
                usuario_id="user_003",
                ritmo_cardiaco=115,
                spo2=94,
                presion_sistolica=140,
                presion_diastolica=90,
                temperatura=37.2
            ),
            "context": PatientContext(edad=80, cardiopata=True)
        },
        {
            "name": "CASE 4: Severe Hypoxemia + Fall",
            "vitals": VitalsInput(
                usuario_id="user_004",
                ritmo_cardiaco=110,
                spo2=82,
                presion_sistolica=100,
                presion_diastolica=60,
                temperatura=36.2,
                caida_detectada=True,
                movimiento_posterior=False
            ),
            "context": PatientContext(edad=68)
        },
        {
            "name": "CASE 5: Predictive Tachycardia (Rising Trend)",
            "vitals": VitalsInput(
                usuario_id="user_test_predictivo",
                ritmo_cardiaco=105, # Current value is high-normal
                spo2=96,
                presion_sistolica=120,
                presion_diastolica=80,
                temperatura=37.0
            ),
            "context": PatientContext(
                historial_ritmo=[80, 90, 98], # Rising trend
                nombre_completo="Test Predictivo"
            )
        }
    ]

    for scenario in scenarios:
        print(f"{scenario['name']}")
        result = MedicalEngine.detect_patterns(scenario['vitals'], scenario['context'])
        print(f"  - Risk Score: {result.score_riesgo:.1f}")
        print(f"  - Severity: {result.nivel_criticidad}")
        print(f"  - Factors: {', '.join(result.factores_riesgo)}")
        print(f"  - Recommendation: {result.recomendacion}\n")

if __name__ == "__main__":
    test_engine()
