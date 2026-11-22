import pytest
from apps.triage.rules.engine import evaluate_red_flags
from apps.triage.services import create_triage_session, process_patient_turn
from apps.common.exceptions import ConsentRequiredError

def test_red_flag_engine_english_and_bangla():
    # English emergencies
    is_em, hits, instr = evaluate_red_flags("I am having severe chest pain radiating to left arm", language="en")
    assert is_em is True
    assert hits[0]["symptom"] == "chest_pain"
    assert "cardiac emergency" in instr

    # Bangla emergencies
    is_em_bn, hits_bn, instr_bn = evaluate_red_flags("আমার বুকে তীব্র ব্যথা এবং শ্বাসকষ্ট হচ্ছে", language="bn")
    assert is_em_bn is True
    assert any(h["symptom"] in ("chest_pain", "severe_dyspnea") for h in hits_bn)
    assert "জরুরী" in instr_bn

def test_red_flag_engine_negation_handling():
    # English negation
    is_em, hits, _ = evaluate_red_flags("I have a mild cough, but no chest pain", language="en")
    assert is_em is False
    assert len(hits) == 0

    # Bangla negation
    is_em_bn, hits_bn, _ = evaluate_red_flags("বুকে কোনো ব্যথা নেই, শুধু সাধারণ সর্দি", language="bn")
    assert is_em_bn is False
    assert len(hits_bn) == 0

@pytest.mark.django_db
def test_triage_session_flow(db):
    # Missing disclosure consent fails
    with pytest.raises(ConsentRequiredError):
        create_triage_session(user=None, disclosure_version="")

    # Valid creation
    session = create_triage_session(user=None, language="bn", disclosure_version="v1.0")
    assert session.state == "ACTIVE"
    assert session.turns.count() == 1  # Initial greeting

    # Patient triggers emergency red flag
    turn = process_patient_turn(session, "আমার প্রচুর রক্তবমি হচ্ছে")
    session.refresh_from_db()
    assert session.state == "EMERGENCY_PATHWAY"
    assert turn.response_policy == "emergency"
    assert session.ended_at is not None
