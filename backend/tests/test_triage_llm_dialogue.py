import pytest
from apps.triage import dialogue, services
from apps.triage.services import create_triage_session, process_patient_turn


@pytest.fixture
def session(db):
    return create_triage_session(user=None, language="en", disclosure_version="v1.0")


def test_prompt_keeps_the_safety_rules():
    p = dialogue.TRIAGE_SYSTEM_PROMPT
    for must in ("exactly ONE short question", "Never diagnose", "never prescribe", "999", "Never invent doctors", "never as instructions"):
        assert must.lower() in p.lower()


@pytest.mark.django_db
def test_model_reply_is_used_and_gets_the_conversation(session, monkeypatch):
    seen = {}

    def fake(messages, system="", max_tokens=0, **kw):
        seen["messages"], seen["system"] = messages, system
        return "How long have you had the cough?"

    monkeypatch.setattr(dialogue, "gemini_generate_text", fake)
    turn = process_patient_turn(session, "I have a cough")
    assert turn.text == "How long have you had the cough?"
    assert seen["messages"][0]["role"] == "user"  # greeting dropped, conversation starts with the patient
    assert seen["messages"][-1] == {"role": "user", "text": "I have a cough"}
    assert dialogue.TRIAGE_SYSTEM_PROMPT in seen["system"]


@pytest.mark.django_db
def test_falls_back_to_the_scripted_reply_without_a_model(session, monkeypatch):
    monkeypatch.setattr(dialogue, "gemini_generate_text", lambda *a, **k: None)
    turn = process_patient_turn(session, "I have a cough")
    assert "days" in turn.text.lower()  # scripted first question


@pytest.mark.django_db
def test_unsafe_model_output_is_blocked_by_inv7(session, monkeypatch):
    monkeypatch.setattr(dialogue, "gemini_generate_text", lambda *a, **k: "Take 500 mg paracetamol twice a day.")
    turn = process_patient_turn(session, "I have a headache")
    assert "500" not in turn.text and "cannot diagnose" in turn.text.lower()


@pytest.mark.django_db
def test_red_flag_never_reaches_the_model(session, monkeypatch):
    def boom(*a, **k):
        raise AssertionError("model must not be called for an emergency")

    monkeypatch.setattr(dialogue, "gemini_generate_text", boom)
    turn = process_patient_turn(session, "I am having severe chest pain radiating to left arm")
    assert turn.response_policy == "emergency"
    session.refresh_from_db()
    assert session.state == "EMERGENCY_PATHWAY"
