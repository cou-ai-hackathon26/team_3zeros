"""
Vapi VoiceProvider (Q-05, D-08, D-22; SECURITY §8.1).

Only a random `session_ref` ever reaches Vapi: the browser passes it as call
metadata so webhooks can be matched back to a triage session. No name, phone
or record ID is sent. The orchestrator stays in the backend: Vapi transcribes
and speaks; our `process_patient_turn` decides what is said (D-08).

Assistant setup required in the Vapi dashboard: server URL pointing to
`POST /api/v1/triage/provider-events` with the same secret as VAPI_WEBHOOK_SECRET,
`monitorPlan.controlEnabled = true` (gives us the control URL used by `speak`),
and no model-generated replies (our backend supplies every sentence).
"""
import hmac
import logging
from datetime import timedelta
from typing import Any

import requests
from django.conf import settings
from django.core.cache import cache
from django.utils import timezone

from apps.common.exceptions import NotAuthenticatedError
from .base import ProviderCredentials, ProviderEvent

logger = logging.getLogger(__name__)

API_BASE = "https://api.vapi.ai"
CONTROL_TTL = 60 * 60


def _control_key(session_ref: str) -> str:
    return f"vapi:control:{session_ref}"


class VapiVoiceProvider:
    provider_name = "vapi"

    def create_session(self, session_ref: str, language: str) -> ProviderCredentials:
        # Vapi web calls use the public key (safe to expose, restricted by allowed origins in Vapi).
        return ProviderCredentials(
            session_ref=session_ref,
            provider=self.provider_name,
            token=settings.VAPI_PUBLIC_KEY,
            expires_at=(timezone.now() + timedelta(minutes=5)).isoformat(),
            metadata={"assistant_id": settings.VAPI_ASSISTANT_ID, "language": language},
        )

    def verify_webhook(self, request: Any) -> ProviderEvent:
        secret = settings.VAPI_WEBHOOK_SECRET
        supplied = request.headers.get("x-vapi-secret", "")
        if not secret or not hmac.compare_digest(supplied, secret):
            raise NotAuthenticatedError("Invalid provider signature.")

        message = (getattr(request, "data", None) or {}).get("message") or {}
        call = message.get("call") or {}
        session_ref = str((call.get("metadata") or {}).get("session_ref", ""))
        control_url = (call.get("monitor") or {}).get("controlUrl")
        if session_ref and control_url:
            cache.set(_control_key(session_ref), control_url, CONTROL_TTL)

        mtype = str(message.get("type", "noop"))
        is_patient_final = (
            mtype.startswith("transcript")
            and message.get("role") == "user"
            and message.get("transcriptType", "final") == "final"
        )
        return ProviderEvent(
            event_type="transcript" if is_patient_final else mtype,
            session_ref=session_ref,
            transcript=str(message.get("transcript", "")) if is_patient_final else "",
            language=str(message.get("language", "")),
            raw={"type": mtype},  # never keep the full payload
        )

    def speak(self, session_ref: str, text: str, language: str) -> None:
        url = cache.get(_control_key(session_ref))
        if not url:
            logger.warning("vapi speak: no control URL for session")
            return
        try:
            requests.post(url, json={"type": "say", "content": text}, timeout=10).raise_for_status()
        except requests.RequestException as exc:
            logger.error("vapi speak failed: %s", exc)

    def end_session(self, session_ref: str) -> None:
        url = cache.get(_control_key(session_ref))
        if not url:
            return
        try:
            requests.post(url, json={"type": "end-call"}, timeout=10).raise_for_status()
        except requests.RequestException as exc:
            logger.error("vapi end_session failed: %s", exc)
        cache.delete(_control_key(session_ref))
