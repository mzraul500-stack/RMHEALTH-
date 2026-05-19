"""
Notification Service — Multi-Channel Alert Dispatch.

Orchestrates multi-channel notifications:
  1. SMS to emergency contacts via Twilio
  2. Push notifications via Firebase Cloud Messaging (FCM)
  3. FHIR report transmission to hospital endpoint (planned)

Environment variables required for SMS:
  TWILIO_ACCOUNT_SID  — Twilio account identifier
  TWILIO_AUTH_TOKEN   — Twilio authentication token
  TWILIO_PHONE_NUMBER — Twilio sender phone number (E.164 format)

Environment variables for FCM:
  FCM_ENABLED                   — "true" to enable push notifications (default: "false")
  FIREBASE_SERVICE_ACCOUNT_PATH — Path to Firebase service account JSON file

When credentials are not configured, each channel logs messages
instead of sending them. This preserves backward compatibility.

SECURITY RULES (JIDOKA):
  - Push payload MUST NOT contain clinical data (HR, BP, SpO2, glucose, location)
  - Push payload only carries: title, body, alert_id, type
  - Clinical details are fetched in-app via authenticated API
  - FCM does NOT activate or cancel emergencies
  - FCM does NOT decide criticality

© 2025-2026 MORALES ZEPEDA RAUL | INDAUTOR 03-2025-070109072500-01
"""

import logging
import os
from typing import Dict, Any, List, Optional

logger = logging.getLogger("RMHealth.NotificationService")

# ── Twilio configuration ──────────────────────────────────────────────────
TWILIO_SID: Optional[str] = os.environ.get("TWILIO_ACCOUNT_SID")
TWILIO_TOKEN: Optional[str] = os.environ.get("TWILIO_AUTH_TOKEN")
TWILIO_PHONE: Optional[str] = os.environ.get("TWILIO_PHONE_NUMBER")

# ── FCM configuration ─────────────────────────────────────────────────────
FCM_ENABLED: bool = os.environ.get("FCM_ENABLED", "false").lower() == "true"
FIREBASE_SA_PATH: Optional[str] = os.environ.get("FIREBASE_SERVICE_ACCOUNT_PATH")

# Lazy-load clients
_twilio_client = None
_firebase_initialized = False

# Safe import of firebase_admin
try:
    import firebase_admin
    from firebase_admin import credentials as fb_credentials, messaging
    FIREBASE_AVAILABLE = True
except ImportError:
    FIREBASE_AVAILABLE = False


# ── Firebase Initialization ───────────────────────────────────────────────

def _init_firebase():
    """Initialize Firebase Admin SDK lazily.

    Only initializes once. Requires FIREBASE_SERVICE_ACCOUNT_PATH to point
    to a valid service account JSON file.

    Returns:
        True if Firebase is ready, False otherwise.
    """
    global _firebase_initialized

    if _firebase_initialized:
        return True

    if not FIREBASE_AVAILABLE:
        logger.warning(
            "firebase-admin package not installed. "
            "Push notifications disabled. "
            "Run: pip install firebase-admin"
        )
        return False

    if not FCM_ENABLED:
        logger.info("FCM_ENABLED=false — push notifications disabled by feature flag.")
        return False

    if not FIREBASE_SA_PATH:
        logger.warning(
            "FIREBASE_SERVICE_ACCOUNT_PATH not set. "
            "Push notifications will be logged but NOT sent."
        )
        return False

    try:
        # Check if already initialized (e.g., by another module)
        firebase_admin.get_app()
        _firebase_initialized = True
        logger.info("Firebase Admin SDK already initialized.")
        return True
    except ValueError:
        pass

    try:
        if not os.path.isfile(FIREBASE_SA_PATH):
            logger.error(
                f"Firebase service account file not found: {FIREBASE_SA_PATH}"
            )
            return False

        cred = fb_credentials.Certificate(FIREBASE_SA_PATH)
        firebase_admin.initialize_app(cred)
        _firebase_initialized = True
        logger.info("Firebase Admin SDK initialized successfully.")
        return True
    except Exception as e:
        logger.error(f"Firebase initialization failed: {e}")
        return False


# ── Twilio Client ─────────────────────────────────────────────────────────

def _get_twilio_client():
    """Get or create the Twilio client singleton.

    Returns:
        twilio.rest.Client or None if credentials are missing.
    """
    global _twilio_client

    if _twilio_client is not None:
        return _twilio_client

    if not all([TWILIO_SID, TWILIO_TOKEN, TWILIO_PHONE]):
        logger.warning(
            "Twilio credentials not configured. "
            "SMS will be logged but NOT sent. "
            "Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, "
            "and TWILIO_PHONE_NUMBER in environment."
        )
        return None

    try:
        from twilio.rest import Client
        _twilio_client = Client(TWILIO_SID, TWILIO_TOKEN)
        logger.info("Twilio client initialized successfully.")
        return _twilio_client
    except ImportError:
        logger.error(
            "twilio package not installed. "
            "Run: pip install twilio"
        )
        return None
    except Exception as e:
        logger.error(f"Twilio client initialization failed: {e}")
        return None


# ── Push Notifications (FCM) ──────────────────────────────────────────────

def send_push_notification(
    token: str,
    title: str,
    body: str,
    data: Optional[Dict[str, str]] = None,
) -> bool:
    """Send a push notification via Firebase Cloud Messaging.

    SECURITY: The payload MUST NOT contain clinical data.
    Only generic alert info (title, body, alert_id, type) is permitted.

    Args:
        token: FCM device token.
        title: Notification title (visible to user).
        body: Notification body (visible to user).
        data: Optional data payload (key-value strings only).
              Must NOT contain: HR, BP, SpO2, glucose, location, diagnosis.

    Returns:
        True if sent successfully, False otherwise.
    """
    if not FCM_ENABLED:
        logger.info(
            f"[FCM-DISABLED] Push not sent (feature flag off). "
            f"Title: {title[:50]}"
        )
        return False

    if not token:
        logger.warning("[FCM] Empty token — push not sent.")
        return False

    if not _init_firebase():
        logger.info(
            f"[FCM-SIMULATION] Push to token[...{token[-8:] if len(token) > 8 else '***'}]: "
            f"{title[:50]}"
        )
        return False

    # Sanitize data payload — ensure no clinical data leaks
    safe_data = {}
    if data:
        FORBIDDEN_KEYS = {
            "heart_rate", "ritmo_cardiaco", "spo2", "presion", "systolic",
            "diastolic", "glucose", "glucosa", "temperatura", "temperature",
            "lat", "lon", "ubicacion", "location", "diagnosis", "diagnostico",
            "criticidad", "nivel_criticidad", "score_riesgo",
        }
        for key, value in data.items():
            if key.lower() not in FORBIDDEN_KEYS:
                safe_data[key] = str(value)
            else:
                logger.warning(
                    f"[FCM-SECURITY] Blocked clinical key '{key}' from push payload."
                )

    try:
        message = messaging.Message(
            notification=messaging.Notification(
                title=title,
                body=body,
            ),
            data=safe_data,
            token=token,
            android=messaging.AndroidConfig(
                priority="high",
                notification=messaging.AndroidNotification(
                    channel_id="rmhealth_preventive",
                    priority="high",
                ),
            ),
        )

        response = messaging.send(message)
        logger.info(
            f"[FCM] Push sent successfully. "
            f"Response: {response}, "
            f"Token suffix: ...{token[-8:] if len(token) > 8 else '***'}"
        )
        return True

    except Exception as e:
        error_str = str(e)
        # Handle invalid/expired tokens
        if "Requested entity was not found" in error_str or "not a valid FCM" in error_str:
            logger.warning(
                f"[FCM] Invalid or expired token (suffix: ...{token[-8:] if len(token) > 8 else '***'}). "
                f"Token should be removed from database."
            )
        else:
            logger.error(f"[FCM] Push send failed: {e}")
        return False


def send_preventive_push(
    tokens: List[str],
    alert_id: str,
) -> Dict[str, Any]:
    """Send a preventive notice push to one or more devices.

    Uses the JIDOKA-approved payload template.
    No clinical data is included — user must open the app to see details.

    Args:
        tokens: List of FCM device tokens.
        alert_id: UUID of the preventive alert for in-app lookup.

    Returns:
        Dict with sent/failed counts.
    """
    results = {"sent": 0, "failed": 0, "total": len(tokens)}

    for token in tokens:
        success = send_push_notification(
            token=token,
            title="Aviso preventivo RMHealth",
            body="Se generó un aviso informativo. Abre RMHealth para revisar detalles.",
            data={
                "type": "preventive_notice",
                "alert_id": alert_id,
            },
        )
        if success:
            results["sent"] += 1
        else:
            results["failed"] += 1

    logger.info(
        f"[FCM] Preventive push batch: "
        f"{results['sent']}/{results['total']} sent, "
        f"{results['failed']} failed"
    )
    return results


# ── SMS (Twilio) ──────────────────────────────────────────────────────────

def send_sms(to_number: str, message: str) -> bool:
    """Send an SMS message via Twilio.

    Args:
        to_number: Recipient phone number in E.164 format (+521234567890).
        message: SMS body text (max 1600 chars for Twilio).

    Returns:
        True if sent successfully, False otherwise.
    """
    client = _get_twilio_client()

    if client is None:
        logger.info(
            f"[SIMULATION] SMS to {to_number}: {message[:100]}..."
        )
        return False

    try:
        result = client.messages.create(
            body=message[:1600],  # Twilio limit
            from_=TWILIO_PHONE,
            to=to_number,
        )
        logger.info(
            f"SMS sent successfully. SID: {result.sid}, "
            f"To: {to_number}, Status: {result.status}"
        )
        return True
    except Exception as e:
        logger.error(f"SMS send failed to {to_number}: {e}")
        return False


class NotificationService:
    """Multi-channel emergency notification orchestrator.

    Dispatches simultaneous alerts to:
      - Hospitals (FHIR endpoint — planned)
      - Emergency contacts (SMS via Twilio)
    """

    @staticmethod
    def dispatch_emergency_protocol(
        patient_data: Dict[str, Any],
        hospital_info: Dict[str, Any],
    ) -> Dict[str, bool]:
        """Activate multi-channel emergency notification.

        Args:
            patient_data: Patient info including contacts and location.
            hospital_info: Selected hospital details from routing.

        Returns:
            Dict with status of each notification channel.
        """
        logger.info("EMERGENCY PROTOCOL ACTIVATED — dispatching notifications")

        results = {
            "hospital_notified": False,
            "contacts_notified": False,
        }

        # 1. Notify hospital (FHIR transmission — planned)
        results["hospital_notified"] = (
            NotificationService._notify_hospital(patient_data, hospital_info)
        )

        # 2. Notify emergency contacts (SMS)
        results["contacts_notified"] = (
            NotificationService._notify_contacts(patient_data)
        )

        logger.info(f"Emergency protocol results: {results}")
        return results

    @staticmethod
    def _notify_hospital(
        patient: Dict[str, Any],
        hospital: Dict[str, Any],
    ) -> bool:
        """Send FHIR report to hospital endpoint.

        Currently logs the intent. Real FHIR transmission requires
        hospital API agreements and certification.

        Args:
            patient: Patient data dict.
            hospital: Hospital routing info dict.

        Returns:
            True if notification was dispatched.
        """
        hospital_name = hospital.get("name", "Unknown")
        logger.info(
            f"HOSPITAL ALERT: Sending FHIR report to {hospital_name}"
        )
        # TODO: Real FHIR POST to hospital.get("endpoint_url")
        # This requires signed agreements with each hospital
        logger.info(
            f"[PLANNED] FHIR report for hospital {hospital_name} "
            f"logged but NOT transmitted — no real endpoint configured."
        )
        return False

    @staticmethod
    def _notify_contacts(patient: Dict[str, Any]) -> bool:
        """Send SMS alerts to emergency contacts.

        Args:
            patient: Patient data dict with contact info and location.

        Returns:
            True if at least one SMS was sent successfully.
        """
        contact_name = patient.get(
            "contacto_emergencia_nombre", "Emergency Contact"
        )
        contact_phone = patient.get(
            "contacto_emergencia_tel", None
        )
        patient_name = patient.get(
            "nombre_completo", "RMHealth Patient"
        )
        lat = patient.get("lat", 0)
        lon = patient.get("lon", 0)

        message = (
            f"RMHEALTH EMERGENCY ALERT: {patient_name} is experiencing "
            f"a critical medical event. Emergency services have been "
            f"notified. Location: https://maps.google.com/?q={lat},{lon}"
        )

        if not contact_phone:
            logger.warning(
                f"No phone number for contact '{contact_name}'. "
                f"SMS not sent."
            )
            return False

        logger.info(
            f"Sending emergency SMS to {contact_name} ({contact_phone})"
        )
        return send_sms(contact_phone, message)
