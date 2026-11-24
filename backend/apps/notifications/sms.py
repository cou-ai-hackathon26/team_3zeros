"""
SMS notification provider (MASTERPLAN §4.9, SECURITY §7, D-21).
SECURITY §7: SMS body contains no clinical details.
SMS messages must be strictly non-clinical transactional notifications.
"""
import logging
import re
from typing import Optional
from django.conf import settings
from apps.common.exceptions import ValidationError

logger = logging.getLogger(__name__)

# Disallowed clinical terms in SMS to prevent PHI exposure (SECURITY §7)
PROHIBITED_CLINICAL_KEYWORDS = [
    r"\bdiagnosis\b",
    r"\btuberculosis\b",
    r"\bcancer\b",
    r"\bdiabetes\b",
    r"\bhiv\b",
    r"\bpositive\b",
    r"\bnegative\b",
    r"\bmg\b",
    r"\bml\b",
    r"\btablet\b",
    r"\bdose\b",
    r"\bprescription\b",
    r"\bsyndrome\b",
]


def validate_sms_body_non_clinical(body: str) -> None:
    """Verifies that an SMS message does not contain clinical diagnosis or medication details."""
    body_lower = body.lower()
    for pattern in PROHIBITED_CLINICAL_KEYWORDS:
        if re.search(pattern, body_lower):
            raise ValidationError(
                f"SECURITY §7 violation: SMS body cannot contain clinical keywords matching '{pattern}'."
            )


def send_sms(to_phone: str, message: str) -> bool:
    """
    Sends a transactional SMS to a recipient phone number.
    Rejects any message containing clinical details.
    """
    if not to_phone or not message:
        return False

    validate_sms_body_non_clinical(message)

    provider = getattr(settings, "SMS_PROVIDER", "console").lower()
    if provider == "console" or getattr(settings, "DEBUG", True):
        logger.info("[SMS CONSOLE] To: %s | Message: %s", to_phone, message)
        return True

    # Real provider integration (e.g. Bangladesh SMS gateway such as Teletalk / SSL Wireless)
    gateway_url = getattr(settings, "SMS_GATEWAY_URL", "")
    api_key = getattr(settings, "SMS_API_KEY", "")
    if gateway_url and api_key:
        import requests
        try:
            resp = requests.post(
                gateway_url,
                json={"to": to_phone, "message": message, "api_key": api_key},
                timeout=10,
            )
            resp.raise_for_status()
            logger.info("SMS delivered successfully to %s", to_phone)
            return True
        except requests.RequestException as exc:
            logger.error("SMS gateway dispatch failed: %s", exc)
            return False

    logger.warning("SMS gateway not configured, logging SMS to console: To: %s", to_phone)
    return True
