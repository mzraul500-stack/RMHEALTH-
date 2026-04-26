"""
RMHealth API — Load Test (Locust)
Run: locust -f locustfile.py --host http://localhost:8001
"""

import random
from locust import HttpUser, task, between


TOKEN = "rmhealth_secure_2025"

DEMO_USERS = [
    "maria_gonzalez_68",
    "carlos_mendoza_72",
    "rosa_hernandez_65",
    "jose_martinez_71",
    "ana_ramirez_66",
    "luis_perez_74",
]

# Acapulco area coordinates (slight jitter per request)
BASE_LAT = 16.8531
BASE_LON = -99.8237


def _normal_vitals():
    """Generate a payload with healthy vital signs."""
    return {
        "usuario_id": random.choice(DEMO_USERS),
        "ecg": 1.0,
        "ppg": 1.0,
        "oxigeno": random.randint(95, 99),
        "presion_sistolica": random.randint(110, 130),
        "presion_diastolica": random.randint(70, 85),
        "frecuencia_cardiaca": random.randint(60, 90),
        "temperatura": round(random.uniform(36.2, 37.0), 1),
        "glucosa": round(random.uniform(80, 110), 1),
        "ubicacion_lat": BASE_LAT + random.uniform(-0.02, 0.02),
        "ubicacion_lon": BASE_LON + random.uniform(-0.02, 0.02),
        "dispositivo_id": "locust_test",
        "emergencia_detectada": False,
    }


def _critical_vitals():
    """Generate a payload that should trigger an emergency."""
    scenario = random.choice(["cardiac", "pressure", "hypoxia", "glucose"])

    base = _normal_vitals()

    if scenario == "cardiac":
        base["frecuencia_cardiaca"] = random.choice([42, 44, 155, 170])
    elif scenario == "pressure":
        base["presion_sistolica"] = random.randint(185, 220)
        base["presion_diastolica"] = random.randint(121, 140)
    elif scenario == "hypoxia":
        base["oxigeno"] = random.randint(78, 84)
    elif scenario == "glucose":
        base["glucosa"] = round(random.uniform(35, 50), 1)

    return base


class RMHealthUser(HttpUser):
    """Simulated patient sending vital signs."""

    wait_time = between(1, 3)
    headers = {
        "Authorization": f"Bearer {TOKEN}",
        "Content-Type": "application/json",
    }

    @task(7)
    def send_normal_vitals(self):
        """70% of traffic — routine check-ins with healthy vitals."""
        self.client.post(
            "/api/vital-signs",
            json=_normal_vitals(),
            headers=self.headers,
            name="/api/vital-signs [normal]",
        )

    @task(3)
    def send_critical_vitals(self):
        """30% of traffic — emergencies that trigger hospital routing."""
        self.client.post(
            "/api/vital-signs",
            json=_critical_vitals(),
            headers=self.headers,
            name="/api/vital-signs [critical]",
        )

    @task(1)
    def health_check(self):
        """Lightweight health probe."""
        self.client.get("/health", name="/health")
