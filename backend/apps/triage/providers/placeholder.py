"""
Placeholder VoiceProvider adapter for Vapi integration (Q-05, D-08).

Teammate integration point:
  1. Create `apps/triage/providers/vapi.py` implementing `VoiceProvider`.
  2. In `create_session()`, mint a short-lived (<= 5 min) Vapi web call token bound
     ONLY to `session_ref` (random UUID; never send patient name, phone, or record ID).
  3. In `verify_webhook()`, verify the Vapi webhook signature header and parse ASR turns
     into `ProviderEvent(event_type="transcript", session_ref=..., transcript=...)`.
  4. Return `VapiVoiceProvider()` from `get_voice_provider()` when configured via settings.
"""
import uuid
from datetime import timedelta
from typing import Any
from django.utils import timezone
from .base import ProviderCredentials, ProviderEvent


class PlaceholderVoiceProvider:
    provider_name = "vapi_placeholder"

    def create_session(self, session_ref: str, language: str) -> ProviderCredentials:
        expires_at = timezone.now() + timedelta(minutes=5)
        return ProviderCredentials(
            session_ref=session_ref or uuid.uuid4().hex,
            provider=self.provider_name,
            token=f"placeholder-{uuid.uuid4().hex}",
            expires_at=expires_at.isoformat(),
            status="placeholder",
            metadata={"language": language, "q05_pending": True},
        )

    def verify_webhook(self, request: Any) -> ProviderEvent:
        # TODO(teammate/vapi): Verify HMAC / bearer signature before trusting payload.
        data = getattr(request, "data", {}) or {}
        return ProviderEvent(
            event_type=str(data.get("type", "noop")),
            session_ref=str(data.get("session_ref", "")),
            transcript=str(data.get("transcript", "")),
            language=str(data.get("language", "")),
            raw=dict(data) if isinstance(data, dict) else {},
        )

    def speak(self, session_ref: str, text: str, language: str, end_after: bool = False) -> bool:
        # TODO(teammate/vapi): Push server-authored assistant text to Vapi TTS stream.
        return False

    def end_session(self, session_ref: str) -> None:
        # TODO(teammate/vapi): Terminate active Vapi call immediately (required on emergency).
        return None


def get_voice_provider():
    """Factory returning the configured VoiceProvider (settings.VOICE_PROVIDER, Q-05)."""
    from django.conf import settings

    if getattr(settings, "VOICE_PROVIDER", "placeholder").lower() == "vapi":
        from .vapi import VapiVoiceProvider

        return VapiVoiceProvider()
    return PlaceholderVoiceProvider()
