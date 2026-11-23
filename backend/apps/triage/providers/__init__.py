"""Voice provider adapters for triage (BACKEND §8.4, Q-05)."""
from .base import ProviderCredentials, ProviderEvent, VoiceProvider
from .placeholder import PlaceholderVoiceProvider, get_voice_provider

__all__ = [
    "ProviderCredentials",
    "ProviderEvent",
    "VoiceProvider",
    "PlaceholderVoiceProvider",
    "get_voice_provider",
]
