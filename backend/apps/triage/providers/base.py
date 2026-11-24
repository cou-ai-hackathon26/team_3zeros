"""VoiceProvider protocol per BACKEND §8.4 and SECURITY §8.1 (Q-05)."""
from dataclasses import dataclass, field
from typing import Any, Dict, Protocol


@dataclass(frozen=True)
class ProviderCredentials:
    session_ref: str
    provider: str
    token: str
    expires_at: str
    status: str = "ready"  # "placeholder" | "ready"
    metadata: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "session_ref": self.session_ref,
            "provider": self.provider,
            "token": self.token,
            "expires_at": self.expires_at,
            "status": self.status,
            **self.metadata,
        }


@dataclass(frozen=True)
class ProviderEvent:
    event_type: str
    session_ref: str = ""
    transcript: str = ""
    language: str = ""
    raw: Dict[str, Any] = field(default_factory=dict)


class VoiceProvider(Protocol):
    """
    Server-side vendor boundary (D-08, BACKEND §8.4).
    Implementations (e.g. Vapi) only receive a random session_ref — never name, phone, or record ID.
    """

    def create_session(self, session_ref: str, language: str) -> ProviderCredentials: ...

    def verify_webhook(self, request: Any) -> ProviderEvent: ...

    def speak(self, session_ref: str, text: str, language: str, end_after: bool = False) -> bool: ...

    def end_session(self, session_ref: str) -> None: ...
