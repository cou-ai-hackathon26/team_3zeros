import pytest
from apps.triage import dialogue
from apps.triage.rules.engine import evaluate_session_red_flags
from apps.triage.services import create_triage_session, process_patient_turn


def test_fever_and_stiff_neck_across_turns_is_an_emergency():
    em, hits, instr = evaluate_session_red_flags(["I have fever for three days", "now my neck is stiff"], language="en")
    assert em and hits[0]["rule_id"] == "RF-MENING-01" and "999" in instr


def test_bangla_fever_and_stiff_neck():
    em, hits, instr = evaluate_session_red_flags(["আমার তিন দিন ধরে জ্বর", "ঘাড় শক্ত লাগছে"], language="bn")
    assert em and hits[0]["symptom"] == "fever_with_stiff_neck" and "৯৯৯" in instr


@pytest.mark.parametrize("said", [["I have fever"], ["my neck is stiff"], ["I have fever", "no stiff neck"], ["no fever", "stiff neck from sleeping badly"]])
def test_either_finding_alone_or_a_denied_one_is_not_an_emergency(said):
    assert evaluate_session_red_flags(said, language="en")[0] is False


@pytest.mark.django_db
def test_live_chat_stops_at_fever_plus_stiff_neck():
    s = create_triage_session(user=None, language="bn", disclosure_version="v1.0")
    process_patient_turn(s, "আমার তিন দিন ধরে জ্বর আর মাথা ব্যথা")
    turn = process_patient_turn(s, "জ্বর অনেক বেশি, ঘাড় শক্ত লাগছে")
    assert turn.response_policy == "emergency"
    s.refresh_from_db()
    assert s.state == "EMERGENCY_PATHWAY"


@pytest.mark.django_db
def test_model_raised_emergency_uses_the_fixed_instruction_and_ends_triage(monkeypatch):
    s = create_triage_session(user=None, language="en", disclosure_version="v1.0")
    monkeypatch.setattr(dialogue, "generate_text", lambda *a, **k: "[EMERGENCY] Sure, take two tablets and rest.")
    turn = process_patient_turn(s, "I feel very strange and confused")
    assert turn.response_policy == "emergency"
    assert "tablets" not in turn.text and "999" in turn.text  # the model's own words are never shown
    assert turn.red_flag_hits[0]["rule_id"] == "MODEL-EMERGENCY"
    s.refresh_from_db()
    assert s.state == "EMERGENCY_PATHWAY" and s.ended_at is not None


@pytest.mark.django_db
def test_marker_in_the_middle_of_a_reply_does_not_escalate(monkeypatch):
    s = create_triage_session(user=None, language="en", disclosure_version="v1.0")
    monkeypatch.setattr(dialogue, "generate_text", lambda *a, **k: "How long has it lasted? [EMERGENCY]")
    turn = process_patient_turn(s, "I have a mild cough")
    assert turn.response_policy == "question"
    s.refresh_from_db()
    assert s.state == "ACTIVE"
