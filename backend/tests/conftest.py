import pytest


@pytest.fixture(autouse=True)
def _providers_are_mocked_in_tests(settings, monkeypatch):
    from django.core.cache import cache
    cache.clear()  # key cooldowns and cached embeddings never leak between tests
    """Tests never call a real model, voice or SMS provider, and never see a real key, whatever the developer's .env says."""
    settings.LLM_PROVIDER = "mock"
    settings.VOICE_PROVIDER = "placeholder"
    settings.EMBEDDING_PROVIDER = "mock"  # word-hash vectors, offline
    settings.EMBEDDING_TOKENS_PER_MINUTE = 0  # no pacing sleeps in tests
    settings.KNOWLEDGE_MIN_SIMILARITY = 0.1  # the mock vectors are weak; real similarity is tuned with clinicians
    settings.GEMINI_API_KEYS = ""
    for name in ("GEMINI_API_KEY", "GEMINI_API_KEYS", "OPENAI_API_KEY", "CEREBRAS_API_KEY"):
        setattr(settings, name, "")
        monkeypatch.delenv(name, raising=False)
