import pytest
from apps.triage.rules.engine import evaluate_red_flags
from apps.triage.services import create_triage_session, process_patient_turn
from apps.common.exceptions import ConsentRequiredError, TransitionNotAllowedError, PermissionDeniedError
from apps.triage.services import run_triage_action

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


@pytest.mark.django_db
def test_triage_summary_flow_and_guards():
    session = create_triage_session(user=None, language="en", disclosure_version="v1.0")
    # Cannot confirm a summary before the questions are finished.
    with pytest.raises(TransitionNotAllowedError):
        run_triage_action(session, "confirm_summary")
    run_triage_action(session, "finish_questions")
    assert session.state == "SUMMARY_PENDING_REVIEW"
    run_triage_action(session, "confirm_summary")
    assert session.state == "CONFIRMED_BY_PATIENT"
    with pytest.raises(TransitionNotAllowedError):
        process_patient_turn(session, "more symptoms")


@pytest.mark.django_db
def test_other_patient_cannot_act_on_a_patient_session(django_user_model):
    from apps.accounts.models import PatientAccount
    from apps.identity.models import Patient
    owner = django_user_model.objects.create_user(phone="+8801811111111", password="x")
    PatientAccount.objects.create(user=owner, patient=Patient.objects.create(given_name="A", family_name="B"))
    stranger = django_user_model.objects.create_user(phone="+8801822222222", password="x")
    PatientAccount.objects.create(user=stranger, patient=Patient.objects.create(given_name="C", family_name="D"))
    session = create_triage_session(user=owner, language="bn", disclosure_version="v1.0")
    with pytest.raises(PermissionDeniedError):
        run_triage_action(session, "end", stranger)
    run_triage_action(session, "end", owner)
    assert session.state == "ENDED_BY_PATIENT"
