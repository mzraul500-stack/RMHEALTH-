"""
Tests for Firebase Cloud Messaging integration in notification_service.py.

Verifies:
  1. FCM disabled by feature flag → no crash, returns False
  2. Firebase not configured → no crash, returns False
  3. Clinical data blocked from push payload
  4. Preventive push batch works
  5. Invalid token handling

© 2025-2026 MORALES ZEPEDA RAUL | INDAUTOR 03-2025-070109072500-01
"""

import os
import sys
import unittest
from unittest.mock import patch, MagicMock

# Ensure backend is importable
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


class TestFCMNotification(unittest.TestCase):
    """Tests for FCM push notification functions."""

    def _import_fresh_module(self, env_overrides=None):
        """Import notification_service with clean state and optional env overrides."""
        import importlib
        env = {
            "FCM_ENABLED": "false",
            "FIREBASE_SERVICE_ACCOUNT_PATH": "",
        }
        if env_overrides:
            env.update(env_overrides)

        with patch.dict(os.environ, env, clear=False):
            # Remove cached module to re-import with new env
            if "services.notification_service" in sys.modules:
                del sys.modules["services.notification_service"]
            if "backend.services.notification_service" in sys.modules:
                del sys.modules["backend.services.notification_service"]

            from services import notification_service
            # Reset internal state
            notification_service._firebase_initialized = False
            notification_service.FCM_ENABLED = env.get("FCM_ENABLED", "false").lower() == "true"
            notification_service.FIREBASE_SA_PATH = env.get("FIREBASE_SERVICE_ACCOUNT_PATH", "")
            return notification_service

    # ── Test 1: FCM disabled by feature flag ──────────────────────────

    def test_send_push_fcm_disabled_returns_false(self):
        """When FCM_ENABLED=false, send_push_notification returns False without crash."""
        ns = self._import_fresh_module({"FCM_ENABLED": "false"})
        result = ns.send_push_notification(
            token="test_token_12345678",
            title="Test",
            body="Test body",
        )
        self.assertFalse(result)

    # ── Test 2: Firebase not configured → safe fallback ───────────────

    def test_send_push_firebase_not_configured(self):
        """When FCM_ENABLED=true but no SA path, returns False gracefully."""
        ns = self._import_fresh_module({
            "FCM_ENABLED": "true",
            "FIREBASE_SERVICE_ACCOUNT_PATH": "",
        })
        result = ns.send_push_notification(
            token="test_token_12345678",
            title="Test",
            body="Test body",
        )
        self.assertFalse(result)

    # ── Test 3: Empty token rejected ──────────────────────────────────

    def test_send_push_empty_token_rejected(self):
        """Empty token should be rejected."""
        ns = self._import_fresh_module({"FCM_ENABLED": "true"})
        result = ns.send_push_notification(
            token="",
            title="Test",
            body="Test body",
        )
        self.assertFalse(result)

    # ── Test 4: Clinical data blocked from payload ────────────────────

    def test_payload_no_clinical_data(self):
        """Clinical keys must be stripped from the push payload."""
        ns = self._import_fresh_module({"FCM_ENABLED": "true"})

        # Mock _init_firebase to return True and mock messaging
        with patch.object(ns, '_init_firebase', return_value=True), \
             patch.object(ns, 'FIREBASE_AVAILABLE', True):

            mock_messaging = MagicMock()
            mock_messaging.send.return_value = "projects/test/messages/123"
            mock_messaging.Message = MagicMock()
            mock_messaging.Notification = MagicMock()
            mock_messaging.AndroidConfig = MagicMock()
            mock_messaging.AndroidNotification = MagicMock()

            with patch.object(ns, 'messaging', mock_messaging):
                ns.send_push_notification(
                    token="test_token_12345678",
                    title="Aviso preventivo",
                    body="Abre la app para detalles.",
                    data={
                        "type": "preventive_notice",
                        "alert_id": "abc-123",
                        # These MUST be blocked:
                        "heart_rate": "120",
                        "spo2": "88",
                        "presion": "180/120",
                        "glucose": "300",
                        "lat": "19.4326",
                        "lon": "-99.1332",
                        "diagnosis": "hipertensión",
                        "criticidad": "CRITICAL",
                    },
                )

                # Check the data dict passed to Message
                call_kwargs = mock_messaging.Message.call_args
                if call_kwargs:
                    data_arg = call_kwargs.kwargs.get("data", {}) or \
                               (call_kwargs.args[0] if call_kwargs.args else {})
                    # Safe keys should be present
                    self.assertIn("type", data_arg)
                    self.assertIn("alert_id", data_arg)
                    # Clinical keys MUST NOT be present
                    for forbidden in ["heart_rate", "spo2", "presion", "glucose",
                                      "lat", "lon", "diagnosis", "criticidad"]:
                        self.assertNotIn(
                            forbidden, data_arg,
                            f"Clinical key '{forbidden}' leaked into push payload!"
                        )

    # ── Test 5: Preventive push batch results ─────────────────────────

    def test_preventive_push_batch_disabled(self):
        """Preventive push with FCM disabled returns correct counts."""
        ns = self._import_fresh_module({"FCM_ENABLED": "false"})
        result = ns.send_preventive_push(
            tokens=["token_a", "token_b", "token_c"],
            alert_id="test-alert-uuid",
        )
        self.assertEqual(result["total"], 3)
        self.assertEqual(result["failed"], 3)  # All fail because FCM is disabled
        self.assertEqual(result["sent"], 0)

    # ── Test 6: Module import without firebase-admin ──────────────────

    def test_module_works_without_firebase_admin(self):
        """The module should import and work even if firebase_admin is not installed."""
        ns = self._import_fresh_module({"FCM_ENABLED": "false"})
        # Basic functions should exist
        self.assertTrue(hasattr(ns, "send_push_notification"))
        self.assertTrue(hasattr(ns, "send_preventive_push"))
        self.assertTrue(hasattr(ns, "send_sms"))
        self.assertTrue(hasattr(ns, "NotificationService"))

    # ── Test 7: Approved payload template ─────────────────────────────

    def test_approved_payload_template(self):
        """send_preventive_push uses the JIDOKA-approved payload."""
        ns = self._import_fresh_module({"FCM_ENABLED": "true"})

        captured_calls = []
        original_send = ns.send_push_notification

        def mock_send(token, title, body, data=None):
            captured_calls.append({
                "token": token,
                "title": title,
                "body": body,
                "data": data,
            })
            return False  # Simulated failure

        with patch.object(ns, 'send_push_notification', side_effect=mock_send):
            ns.send_preventive_push(
                tokens=["test_token_001"],
                alert_id="uuid-test-123",
            )

        self.assertEqual(len(captured_calls), 1)
        call = captured_calls[0]
        self.assertEqual(call["title"], "Aviso preventivo RMHealth")
        self.assertIn("informativo", call["body"])
        self.assertEqual(call["data"]["type"], "preventive_notice")
        self.assertEqual(call["data"]["alert_id"], "uuid-test-123")


if __name__ == "__main__":
    unittest.main()
