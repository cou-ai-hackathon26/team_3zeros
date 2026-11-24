import pytest


@pytest.fixture(autouse=True)
def _providers_are_mocked_in_tests(settings):
    """Tests never call a real model, voice or SMS provider, whatever the developer's .env says."""
    settings.LLM_PROVIDER = "mock"
    settings.VOICE_PROVIDER = "placeholder"
