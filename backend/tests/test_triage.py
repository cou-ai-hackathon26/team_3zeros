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


def test_normalizer_bangla_digits_and_nfc():
    import unicodedata
    from apps.triage.normalizer import normalize_bangla_digits, normalize_text

    assert normalize_bangla_digits("৩ দিন ধরে ১০২ জ্বর") == "3 দিন ধরে 102 জ্বর"
    decomposed = unicodedata.normalize("NFD", "ড়")
    assert normalize_text(f"  {decomposed}   জ্বর  ") == unicodedata.normalize("NFC", "ড় জ্বর")


def test_red_flag_clause_bounded_negation():
    # Earlier clause negation must NOT negate a later clause's red flag (Review Focus #1)
    is_em, hits, _ = evaluate_red_flags("No fever, but I have severe chest pain", language="en")
    assert is_em is True
    assert any(h["rule_id"] == "RF-CHEST-01" for h in hits)

    is_em_bn, hits_bn, _ = evaluate_red_flags("জ্বর নেই, কিন্তু বুকে ব্যথা হচ্ছে", language="bn")
    assert is_em_bn is True
    assert any(h["rule_id"] == "RF-CHEST-01" for h in hits_bn)

    # Same-clause negation must still suppress the false positive
    is_em_safe, hits_safe, _ = evaluate_red_flags("I have fever, no chest pain", language="en")
    assert is_em_safe is False
    assert hits_safe == []


def test_cumulative_session_red_flags():
    from apps.triage.rules.engine import evaluate_session_red_flags

    is_em, hits, instr = evaluate_session_red_flags(
        ["I feel dizzy and weak", "Now I am struggling to breathe"],
        language="en",
    )
    assert is_em is True
    assert any(h["rule_id"] == "RF-BREATH-01" for h in hits)
    assert "PLACEHOLDER — NOT CLINICALLY APPROVED" in instr


def test_output_policy_blocks_diagnosis_and_prescription():
    from apps.triage.policy import validate_assistant_output

    text_unsafe, policy_unsafe = validate_assistant_output(
        "You have dengue. Take 500mg paracetamol every 6 hours.",
        language="en",
    )
    assert policy_unsafe == "declined"
    assert "500mg" not in text_unsafe
    assert "dengue" not in text_unsafe.lower()

    text_safe, policy_safe = validate_assistant_output(
        "How many days have you had this symptom?",
        language="en",
    )
    assert policy_safe == "question"
    assert text_safe == "How many days have you had this symptom?"


def test_infer_specialty_returns_canonical_directory_code():
    from apps.triage.policy import infer_specialty

    assert infer_specialty("my child has fever")["code"] == "pediatrics"
    assert infer_specialty("high blood pressure and palpitations")["code"] == "cardiology"
    assert infer_specialty("fever and headache for 3 days")["code"] == "general_medicine"


def test_placeholder_voice_provider_issues_pii_free_credentials():
    from apps.triage.providers.placeholder import get_voice_provider

    provider = get_voice_provider()
    creds = provider.create_session("sess-ref-123", "bn")
    assert creds.provider == "vapi_placeholder"
    assert creds.session_ref == "sess-ref-123"
    assert creds.token
    assert creds.expires_at
    assert creds.status == "placeholder"

