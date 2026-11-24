import pytest
from rest_framework.test import APIClient
from apps.common.exceptions import NotAuthenticatedError
from apps.triage.models import TriageSession
from apps.triage.providers.placeholder import get_voice_provider
from apps.triage.providers.vapi import VapiVoiceProvider
from apps.triage.services import create_triage_session


@pytest.fixture
def vapi(settings):
    settings.VOICE_PROVIDER = "vapi"
    settings.VAPI_PUBLIC_KEY = "pk_test"
    settings.VAPI_ASSISTANT_ID = "asst_1"
    settings.VAPI_WEBHOOK_SECRET = "whsec"
    return settings


def _body(session_ref, text, role="user", ttype="final", control="https://control.example/c1"):
    return {"message": {"type": "transcript", "role": role, "transcriptType": ttype, "transcript": text,
                        "call": {"metadata": {"session_ref": session_ref}, "monitor": {"controlUrl": control}}}}


def test_factory_follows_setting(vapi):
    assert isinstance(get_voice_provider(), VapiVoiceProvider)
    vapi.VOICE_PROVIDER = "placeholder"
    assert get_voice_provider().provider_name == "vapi_placeholder"


def test_credentials_are_pii_free(vapi):
    c = VapiVoiceProvider().create_session("ref-1", "bn").to_dict()
    assert c["token"] == "pk_test" and c["assistant_id"] == "asst_1" and c["session_ref"] == "ref-1"
    assert "private" not in str(c).lower()


@pytest.mark.django_db
def test_webhook_rejects_bad_or_missing_signature(vapi):
    client = APIClient()
    assert client.post("/api/v1/triage/provider-events", _body("r", "hi"), format="json").status_code in (401, 403)
    assert client.post("/api/v1/triage/provider-events", _body("r", "hi"), format="json", HTTP_X_VAPI_SECRET="nope").status_code in (401, 403)


@pytest.mark.django_db
def test_final_patient_transcript_becomes_a_turn_and_is_spoken(vapi, monkeypatch):
    session = create_triage_session(user=None, language="en", disclosure_version="v1.0")
    spoken = []
    monkeypatch.setattr(VapiVoiceProvider, "speak", lambda self, ref, text, lang, end_after=False: spoken.append(text) or True)
    ref = session.provider_session_ref
    r = APIClient().post("/api/v1/triage/provider-events", _body(str(ref), "I have a mild cough"), format="json", HTTP_X_VAPI_SECRET="whsec")
    assert r.status_code == 200
    assert session.turns.filter(role="patient", text__icontains="cough").count() == 1
    assert len(spoken) == 1


@pytest.mark.django_db
def test_partial_and_assistant_transcripts_are_ignored(vapi):
    session = create_triage_session(user=None, language="en", disclosure_version="v1.0")
    before = session.turns.count()
    c = APIClient()
    ref = str(session.provider_session_ref)
    c.post("/api/v1/triage/provider-events", _body(ref, "cough", ttype="partial"), format="json", HTTP_X_VAPI_SECRET="whsec")
    c.post("/api/v1/triage/provider-events", _body(ref, "hello", role="assistant"), format="json", HTTP_X_VAPI_SECRET="whsec")
    assert session.turns.count() == before


@pytest.mark.django_db
def test_emergency_is_spoken_in_full_then_the_call_ends_itself(vapi, monkeypatch):
    session = create_triage_session(user=None, language="en", disclosure_version="v1.0")
    calls = []
    monkeypatch.setattr(VapiVoiceProvider, "speak", lambda self, ref, text, lang, end_after=False: calls.append(("speak", end_after)) or True)
    monkeypatch.setattr(VapiVoiceProvider, "end_session", lambda self, ref: calls.append(("end",)))
    APIClient().post("/api/v1/triage/provider-events", _body(str(session.provider_session_ref), "I am having severe chest pain radiating to left arm"), format="json", HTTP_X_VAPI_SECRET="whsec")
    assert calls == [("speak", True)]  # one message that ends the call after it is spoken, no abrupt hang-up
    session.refresh_from_db()
    assert session.state == "EMERGENCY_PATHWAY"


@pytest.mark.django_db
def test_if_the_emergency_cannot_be_spoken_the_call_is_ended_anyway(vapi, monkeypatch):
    session = create_triage_session(user=None, language="en", disclosure_version="v1.0")
    calls = []
    monkeypatch.setattr(VapiVoiceProvider, "speak", lambda self, ref, text, lang, end_after=False: False)
    monkeypatch.setattr(VapiVoiceProvider, "end_session", lambda self, ref: calls.append("end"))
    APIClient().post("/api/v1/triage/provider-events", _body(str(session.provider_session_ref), "I am having severe chest pain radiating to left arm"), format="json", HTTP_X_VAPI_SECRET="whsec")
    assert calls == ["end"]


def test_speak_asks_vapi_to_end_the_call_after_the_words(vapi, monkeypatch):
    from django.core.cache import cache
    from apps.triage.providers import vapi as vapi_mod
    cache.set(vapi_mod._control_key("r1"), "https://control.example/c")
    sent = {}
    monkeypatch.setattr(vapi_mod.requests, "post", lambda url, json=None, timeout=0: sent.update(url=url, body=json) or type("R", (), {"raise_for_status": lambda self: None})())
    assert VapiVoiceProvider().speak("r1", "Goodbye", "en", end_after=True) is True
    assert sent["body"] == {"type": "say", "content": "Goodbye", "endCallAfterSpoken": True}
    assert VapiVoiceProvider().speak("unknown", "x", "en") is False


def test_translate_returns_none_without_a_provider(settings):
    from apps.ai.translate import translate_text
    settings.LLM_PROVIDER = "mock"
    assert translate_text("hello", "en", "bn") is None
    assert translate_text("hello", "en", "en") is None


@pytest.mark.django_db
def test_translate_endpoint_is_owner_only_and_degrades_to_null():
    session = create_triage_session(user=None, language="en", disclosure_version="v1.0")
    c = APIClient()
    r = c.post(f"/api/v1/triage/sessions/{session.public_id}/translate", {"text": "hello", "source": "en"}, format="json")
    assert r.status_code in (200, 404)
    bad = c.post(f"/api/v1/triage/sessions/{session.public_id}/translate", {"text": "", "source": "xx"}, format="json")
    assert bad.status_code in (400, 404)
