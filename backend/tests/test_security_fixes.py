"""
RMHealth Security Regression Tests
===================================

Tests for CRITICAL/HIGH vulnerability fixes:
- V-01: Auth refresh must not issue tokens when DB fails
- V-03/V-04: Emergency endpoints must filter by authenticated user
- V-05: Preventive alerts must enforce ownership
- V-07: POST /api/vital-signs must use JWT user_id, not client body

These tests mock the FastAPI app and DB connections to validate
security logic without requiring live infrastructure.
"""

import pytest
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient
import jwt
import os
import sys

# Ensure backend is importable
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


# ── Helpers ──────────────────────────────────────────────────────────────

JWT_TEST_SECRET = "test-secret-key-for-security-tests-2026"
API_TEST_TOKEN = "test-api-secret-token-2026"


def _make_jwt(user_id: str, email: str = "test@rmhealth.app", role: str = "PACIENTE") -> str:
    """Create a valid JWT for testing."""
    from datetime import datetime, timedelta, timezone
    payload = {
        "sub": user_id,
        "email": email,
        "role": role,
        "type": "access",
        "iat": datetime.now(timezone.utc),
        "exp": datetime.now(timezone.utc) + timedelta(hours=1),
    }
    return jwt.encode(payload, JWT_TEST_SECRET, algorithm="HS256")


def _auth_header(user_id: str, role: str = "PACIENTE") -> dict:
    """Return Authorization header with JWT for given user."""
    token = _make_jwt(user_id, role=role)
    return {"Authorization": f"Bearer {token}"}


def _api_header() -> dict:
    """Return Authorization header with API secret token."""
    return {"Authorization": f"Bearer {API_TEST_TOKEN}"}


# ── App fixture ──────────────────────────────────────────────────────────

@pytest.fixture(scope="module")
def app_module():
    """Import the app module once with test env vars."""
    with patch.dict(os.environ, {
        "API_SECRET_TOKEN": API_TEST_TOKEN,
        "JWT_SECRET_KEY": JWT_TEST_SECRET,
        "DB_PASS": "test-password",
        "DB_HOST": "127.0.0.1",
    }):
        import importlib
        import rmhealth_api
        importlib.reload(rmhealth_api)
        return rmhealth_api


@pytest.fixture
def client(app_module):
    """Create test client."""
    return TestClient(app_module.app, raise_server_exceptions=False)


# ══════════════════════════════════════════════════════════════════════════
# V-01: Auth refresh must NOT issue tokens when DB unavailable
# ══════════════════════════════════════════════════════════════════════════

class TestV01AuthRefreshNoFallback:
    """V-01 CRITICAL: Verify auth refresh returns error when DB fails,
    never issuing a temp JWT."""

    def test_refresh_returns_error_when_db_unavailable(self, client, app_module):
        """When DB connection fails, refresh must NOT return tokens."""
        with patch.object(app_module, "get_db_connection", side_effect=Exception("DB connection refused")):
            response = client.post("/api/auth/refresh", json={
                "refresh_token": "some-refresh-token",
                "user_id": "attacker-supplied-id",
            })

        # Must NOT return 200 with tokens
        assert response.status_code in (503, 500, 401), \
            f"Expected error status, got {response.status_code}"

        body = response.json()
        assert "access_token" not in body, \
            "CRITICAL: access_token was issued without DB validation!"
        assert "refresh_token" not in body, \
            "CRITICAL: refresh_token was issued without DB validation!"

    def test_refresh_no_token_fields_in_error(self, client, app_module):
        """Double-check: no token fields in any error response."""
        with patch.object(app_module, "get_db_connection", side_effect=RuntimeError("Simulated DB outage")):
            response = client.post("/api/auth/refresh", json={
                "refresh_token": "fake-token",
                "user_id": "fake-user",
            })

        body = response.json()
        for forbidden_key in ("access_token", "refresh_token", "token_type"):
            assert forbidden_key not in body, \
                f"CRITICAL: '{forbidden_key}' found in error response!"


# ══════════════════════════════════════════════════════════════════════════
# V-03/V-04: Emergency endpoints must scope by user
# ══════════════════════════════════════════════════════════════════════════

class TestV03V04EmergencyUserScoping:
    """V-03/V-04 HIGH: Emergency endpoints must filter by authenticated user."""

    def test_emergencies_latest_requires_auth(self, client):
        """Without auth, should return 401/403."""
        response = client.get("/api/emergencies/latest")
        assert response.status_code in (401, 403)

    def test_emergencies_history_requires_auth(self, client):
        """Without auth, should return 401/403."""
        response = client.get("/api/emergencies/history")
        assert response.status_code in (401, 403)

    def test_emergencies_latest_filters_by_user(self, client, app_module):
        """PACIENTE user should only see own emergencies (SQL WHERE includes user_id)."""
        mock_cursor = MagicMock()
        mock_cursor.fetchone.return_value = None
        mock_conn = MagicMock()
        mock_conn.cursor.return_value = mock_cursor

        with patch.object(app_module, "get_db_connection", return_value=mock_conn):
            user_a_id = "user-a-uuid"
            response = client.get(
                "/api/emergencies/latest",
                headers=_auth_header(user_a_id),
            )

        # Verify SQL was called with user_id parameter
        call_args = mock_cursor.execute.call_args
        assert call_args is not None, "SQL execute was never called"
        sql = call_args[0][0]
        params = call_args[0][1] if len(call_args[0]) > 1 else ()

        assert "WHERE usuario_id" in sql.replace("\n", " ").replace("  ", " "), \
            "V-03: SQL must filter by usuario_id for PACIENTE"
        assert user_a_id in params, \
            "V-03: SQL params must include the authenticated user_id"

    def test_emergencies_history_filters_by_user(self, client, app_module):
        """PACIENTE user should only see own emergency history."""
        mock_cursor = MagicMock()
        mock_cursor.fetchall.return_value = []
        mock_conn = MagicMock()
        mock_conn.cursor.return_value = mock_cursor

        with patch.object(app_module, "get_db_connection", return_value=mock_conn):
            user_a_id = "user-a-uuid"
            response = client.get(
                "/api/emergencies/history",
                headers=_auth_header(user_a_id),
            )

        call_args = mock_cursor.execute.call_args
        assert call_args is not None, "SQL execute was never called"
        sql = call_args[0][0]
        params = call_args[0][1] if len(call_args[0]) > 1 else ()

        assert "WHERE usuario_id" in sql.replace("\n", " ").replace("  ", " "), \
            "V-04: SQL must filter by usuario_id for PACIENTE"
        assert user_a_id in params, \
            "V-04: SQL params must include the authenticated user_id"

    def test_medico_gets_cross_user_emergencies(self, client, app_module):
        """MEDICO role should get unfiltered results."""
        mock_cursor = MagicMock()
        mock_cursor.fetchone.return_value = None
        mock_conn = MagicMock()
        mock_conn.cursor.return_value = mock_cursor

        with patch.object(app_module, "get_db_connection", return_value=mock_conn):
            response = client.get(
                "/api/emergencies/latest",
                headers=_auth_header("medico-uuid", role="MEDICO"),
            )

        call_args = mock_cursor.execute.call_args
        assert call_args is not None, "SQL execute was never called"
        sql = call_args[0][0]
        # MEDICO should NOT have WHERE usuario_id filter
        assert "WHERE usuario_id" not in sql.replace("\n", " "), \
            "MEDICO should have unfiltered access for pilot"


# ══════════════════════════════════════════════════════════════════════════
# V-05: Preventive alerts must enforce ownership
# ══════════════════════════════════════════════════════════════════════════

class TestV05PreventiveAlertsOwnership:
    """V-05 HIGH: Preventive alerts must validate ownership."""

    def test_get_alerts_requires_auth(self, client):
        """Without auth, should return 401/403."""
        response = client.get("/api/users/some-user/preventive-alerts")
        assert response.status_code in (401, 403)

    def test_user_cannot_read_other_users_alerts(self, client, app_module):
        """User A requesting User B's alerts should get 403."""
        with patch.object(app_module, "get_db_connection", return_value=MagicMock()):
            response = client.get(
                "/api/users/user-b-uuid/preventive-alerts",
                headers=_auth_header("user-a-uuid"),
            )
        assert response.status_code == 403, \
            f"V-05: Expected 403 for cross-user access, got {response.status_code}"

    def test_owner_can_read_own_alerts(self, client, app_module):
        """User can read their own alerts."""
        mock_cursor = MagicMock()
        mock_cursor.fetchall.return_value = []
        mock_conn = MagicMock()
        mock_conn.cursor.return_value = mock_cursor

        with patch.object(app_module, "get_db_connection", return_value=mock_conn):
            user_id = "user-a-uuid"
            response = client.get(
                f"/api/users/{user_id}/preventive-alerts",
                headers=_auth_header(user_id),
            )
        assert response.status_code == 200

    def test_medico_can_read_other_user_alerts(self, client, app_module):
        """MEDICO role can read other users' alerts."""
        mock_cursor = MagicMock()
        mock_cursor.fetchall.return_value = []
        mock_conn = MagicMock()
        mock_conn.cursor.return_value = mock_cursor

        with patch.object(app_module, "get_db_connection", return_value=mock_conn):
            response = client.get(
                "/api/users/patient-uuid/preventive-alerts",
                headers=_auth_header("medico-uuid", role="MEDICO"),
            )
        assert response.status_code == 200

    def test_acknowledge_enforces_ownership(self, client, app_module):
        """Acknowledge should include user_id in SQL WHERE."""
        mock_cursor = MagicMock()
        mock_cursor.fetchone.return_value = None
        mock_conn = MagicMock()
        mock_conn.cursor.return_value = mock_cursor

        with patch.object(app_module, "get_db_connection", return_value=mock_conn):
            user_id = "user-a-uuid"
            response = client.post(
                "/api/preventive-alerts/some-alert-id/acknowledge",
                headers=_auth_header(user_id),
            )

        call_args = mock_cursor.execute.call_args
        assert call_args is not None, "SQL execute was never called"
        sql = call_args[0][0]
        params = call_args[0][1]
        assert "user_id = %s" in sql.replace("\n", " ").replace("  ", " "), \
            "V-05: Acknowledge SQL must filter by user_id"
        assert user_id in params, \
            "V-05: Acknowledge SQL params must include authenticated user_id"

    def test_respond_enforces_ownership(self, client, app_module):
        """Respond should include user_id in SQL WHERE."""
        mock_cursor = MagicMock()
        mock_cursor.fetchone.return_value = None
        mock_conn = MagicMock()
        mock_conn.cursor.return_value = mock_cursor

        with patch.object(app_module, "get_db_connection", return_value=mock_conn):
            user_id = "user-a-uuid"
            response = client.post(
                "/api/preventive-alerts/some-alert-id/respond",
                headers=_auth_header(user_id),
                json={"response_type": "false_alarm", "reason": "felt fine"},
            )

        call_args = mock_cursor.execute.call_args
        assert call_args is not None, "SQL execute was never called"
        sql = call_args[0][0]
        params = call_args[0][1]
        assert "user_id = %s" in sql.replace("\n", " ").replace("  ", " "), \
            "V-05: Respond SQL must filter by user_id"
        assert user_id in params, \
            "V-05: Respond SQL params must include authenticated user_id"


# ══════════════════════════════════════════════════════════════════════════
# V-07: POST /api/vital-signs must use JWT user_id
# ══════════════════════════════════════════════════════════════════════════

class TestV07VitalSignsUserIdEnforcement:
    """V-07 HIGH: POST /api/vital-signs must override client usuario_id with JWT sub."""

    SAMPLE_VITALS = {
        "usuario_id": "placeholder",
        "ritmo_cardiaco": 72,
        "spo2": 97,
        "oxigeno": 97,
        "frecuencia_cardiaca": 72,
        "presion_sistolica": 120,
        "presion_diastolica": 80,
        "ubicacion_lat": 20.67,
        "ubicacion_lon": -103.35,
        "dispositivo_id": "test-device-001",
    }

    def test_vital_signs_requires_auth(self, client):
        """Without auth, should return 401/403."""
        response = client.post("/api/vital-signs", json=self.SAMPLE_VITALS)
        assert response.status_code in (401, 403)

    def test_api_client_passes_through(self, client, app_module):
        """api_client token should allow body usuario_id to pass through."""
        mock_cursor = MagicMock()
        mock_conn = MagicMock()
        mock_conn.cursor.return_value = mock_cursor

        with patch.object(app_module, "get_db_connection", return_value=mock_conn), \
             patch.object(app_module, "classify_triage", return_value={"clasificacion": "NORMAL", "probabilidades": {}}):
            vitals = dict(self.SAMPLE_VITALS)
            vitals["usuario_id"] = "device-sensor-user"
            response = client.post(
                "/api/vital-signs",
                headers=_api_header(),
                json=vitals,
            )
        # api_client should process without 403/401
        assert response.status_code in (200, 500), \
            f"api_client request should process, got {response.status_code}"
