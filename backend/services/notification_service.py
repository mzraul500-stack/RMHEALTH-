"""
Notification Service — Emergency SMS and Hospital Alert Dispatch.

Orchestrates multi-channel emergency notifications:
  1. SMS to emergency contacts via Twilio
  2. FHIR report transmission to hospital endpoint (planned)

Environment variables required for SMS:
  TWILIO_ACCOUNT_SID  — Twilio account identifier
  TWILIO_AUTH_TOKEN   — Twilio authentication token
  TWILIO_PHONE_NUMBER — Twilio sender phone number (E.164 format)

When Twilio credentials are not configured, the service logs messages
instead of sending them. This preserves backward compatibility with
the existing simulation.
"""

import logging
import os
from typing import Dict, Any, Optional

logger = logging.getLogger("RMHealth.NotificationService")

# Twilio configuration — loaded once at module level
TWILIO_SID: Optional[str] = os.environ.get("TWILIO_ACCOUNT_SID")
TWILIO_TOKEN: Optional[str] = os.environ.get("TWILIO_AUTH_TOKEN")
TWILIO_PHONE: Optional[str] = os.environ.get("TWILIO_PHONE_NUMBER")

# Lazy-load the Twilio client only if credentials exist
_twilio_client = None


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
