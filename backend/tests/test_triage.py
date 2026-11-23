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


@pytest.mark.django_db
def test_list_own_triage_sessions_and_state_filter(django_user_model):
    from rest_framework.test import APIClient
    from apps.accounts.models import PatientAccount
    from apps.identity.models import Patient

    owner = django_user_model.objects.create_user(phone="+8801833333331", password="x")
    PatientAccount.objects.create(user=owner, patient=Patient.objects.create(given_name="Owner", family_name="One"))
    other = django_user_model.objects.create_user(phone="+8801833333332", password="x")
    PatientAccount.objects.create(user=other, patient=Patient.objects.create(given_name="Other", family_name="Two"))

    s_active = create_triage_session(user=owner, language="bn", disclosure_version="v1.0")
    s_ended = create_triage_session(user=owner, language="en", disclosure_version="v1.0")
    run_triage_action(s_ended, "end", owner)
    create_triage_session(user=other, language="bn", disclosure_version="v1.0")

    client = APIClient()
    # Unauthenticated list must be rejected
    unauth = client.get("/api/v1/triage/sessions")
    assert unauth.status_code in (401, 403)

    # Authenticated patient lists only own sessions
    client.force_authenticate(user=owner)
    all_resp = client.get("/api/v1/triage/sessions")
    assert all_resp.status_code == 200
    assert {r["id"] for r in all_resp.data["results"]} == {str(s_active.public_id), str(s_ended.public_id)}

    open_resp = client.get("/api/v1/triage/sessions?state=ACTIVE,PAUSED")
    assert open_resp.status_code == 200
    assert [r["id"] for r in open_resp.data["results"]] == [str(s_active.public_id)]


@pytest.mark.django_db
def test_triage_pause_resume_endpoints(django_user_model):
    from rest_framework.test import APIClient
    from apps.accounts.models import PatientAccount
    from apps.identity.models import Patient

    owner = django_user_model.objects.create_user(phone="+8801833333333", password="x")
    PatientAccount.objects.create(user=owner, patient=Patient.objects.create(given_name="Pause", family_name="Test"))
    session = create_triage_session(user=owner, language="en", disclosure_version="v1.0")

    client = APIClient()
    client.force_authenticate(user=owner)

    p_resp = client.post(f"/api/v1/triage/sessions/{session.public_id}/pause")
    assert p_resp.status_code == 200
    assert p_resp.data["state"] == "PAUSED"
    assert "resume" in p_resp.data["allowed_actions"]

    r_resp = client.post(f"/api/v1/triage/sessions/{session.public_id}/resume")
    assert r_resp.status_code == 200
    assert r_resp.data["state"] == "ACTIVE"
    assert "pause" in r_resp.data["allowed_actions"]


@pytest.mark.django_db
def test_triage_read_scoping_patient_clinician_stranger(django_user_model):
    from datetime import timedelta
    from django.utils import timezone
    from rest_framework.test import APIClient
    from apps.accounts.models import Membership, PatientAccount
    from apps.directory.models import Specialty
    from apps.identity.models import Patient
    from apps.organizations.models import Facility, Practitioner, PractitionerRole
    from apps.scheduling.models import Appointment, Schedule, Slot

    owner_user = django_user_model.objects.create_user(phone="+8801833333334", password="x")
    owner_patient = Patient.objects.create(given_name="Scoped", family_name="Patient")
    PatientAccount.objects.create(user=owner_user, patient=owner_patient)

    stranger = django_user_model.objects.create_user(phone="+8801833333335", password="x")
    PatientAccount.objects.create(user=stranger, patient=Patient.objects.create(given_name="Stranger", family_name="P"))

    clinician = django_user_model.objects.create_user(email="clin-triage@demo.com", password="x")
    unrelated_clinician = django_user_model.objects.create_user(email="other-clin@demo.com", password="x")
    fac1 = Facility.objects.create(name="Clinic A", type="clinic")
    fac2 = Facility.objects.create(name="Clinic B", type="clinic")
    spec = Specialty.objects.create(code="general_medicine", name_en="General Medicine", name_bn="মেডিসিন")
    prac = Practitioner.objects.create(name="Dr A", registration_number="BMDC-9991", user=clinician)
    role = PractitionerRole.objects.create(practitioner=prac, facility=fac1, specialty=spec)
    Membership.objects.create(user=clinician, facility=fac1, role="clinician")
    Membership.objects.create(user=unrelated_clinician, facility=fac2, role="clinician")

    session = create_triage_session(user=owner_user, language="en", disclosure_version="v1.0")
    process_patient_turn(session, "Fever and headache for 3 days", user=owner_user)
    run_triage_action(session, "finish_questions", owner_user)
    run_triage_action(session, "confirm_summary", owner_user)

    sched = Schedule.objects.create(practitioner_role=role)
    start = timezone.now() + timedelta(days=1)
    slot = Slot.objects.create(schedule=sched, start=start, end=start + timedelta(minutes=30), state="HELD")
    Appointment.objects.create(
        patient=owner_patient,
        practitioner=prac,
        facility=fac1,
        slot=slot,
        state="REQUESTED",
        triage_session_id=session.public_id,
    )

    client = APIClient()

    # Owner can read full session with turns
    client.force_authenticate(user=owner_user)
    r_owner = client.get(f"/api/v1/triage/sessions/{session.public_id}")
    assert r_owner.status_code == 200
    assert len(r_owner.data["turns"]) >= 2

    # Stranger patient gets 404 (no existence leak)
    client.force_authenticate(user=stranger)
    assert client.get(f"/api/v1/triage/sessions/{session.public_id}").status_code == 404

    # Unrelated clinician gets 404
    client.force_authenticate(user=unrelated_clinician)
    assert client.get(f"/api/v1/triage/sessions/{session.public_id}").status_code == 404

    # Care-relationship clinician gets 200 with summary and empty turns
    client.force_authenticate(user=clinician)
    r_clin = client.get(f"/api/v1/triage/sessions/{session.public_id}")
    assert r_clin.status_code == 200
    assert r_clin.data["summary"]["patient_words"] == "Fever and headache for 3 days"
    assert r_clin.data["turns"] == []


@pytest.mark.django_db
def test_triage_summary_has_specialty_code_and_sources():
    session = create_triage_session(user=None, language="en", disclosure_version="v1.0")
    process_patient_turn(session, "My child has fever for 2 days")
    session.refresh_from_db()
    sf = session.summary.structured_fields
    assert sf["suggested_specialty_code"] == "pediatrics"
    assert isinstance(sf.get("guidance_sources"), list) and len(sf["guidance_sources"]) >= 1


@pytest.mark.django_db
def test_turns_rejected_after_finish_questions():
    session = create_triage_session(user=None, language="en", disclosure_version="v1.0")
    process_patient_turn(session, "Mild fever for 2 days")
    run_triage_action(session, "finish_questions")
    assert session.state == "SUMMARY_PENDING_REVIEW"

    # Both non-emergency and emergency turns must be rejected once questioning is finished
    with pytest.raises(TransitionNotAllowedError):
        process_patient_turn(session, "Severe chest pain")
    with pytest.raises(TransitionNotAllowedError):
        process_patient_turn(session, "Also mild cough")


@pytest.mark.django_db
def test_deactivated_clinician_and_facility_admin_cannot_read_triage_session(django_user_model):
    from datetime import timedelta
    from django.utils import timezone
    from rest_framework.test import APIClient
    from apps.accounts.models import Membership, PatientAccount
    from apps.directory.models import Specialty
    from apps.identity.models import Patient
    from apps.organizations.models import Facility, Practitioner, PractitionerRole
    from apps.scheduling.models import Appointment, Schedule, Slot

    owner_user = django_user_model.objects.create_user(phone="+8801844444441", password="x")
    owner_patient = Patient.objects.create(given_name="Active", family_name="Patient")
    PatientAccount.objects.create(user=owner_user, patient=owner_patient)

    deactivated_doc = django_user_model.objects.create_user(email="expired-doc@demo.com", password="x")
    fac_admin = django_user_model.objects.create_user(email="fac-admin@demo.com", password="x")
    fac = Facility.objects.create(name="Scoped Clinic", type="clinic")
    spec = Specialty.objects.create(code="general_medicine", name_en="General Medicine", name_bn="মেডিসিন")
    prac = Practitioner.objects.create(name="Dr Ex", registration_number="BMDC-8811", user=deactivated_doc)
    role = PractitionerRole.objects.create(practitioner=prac, facility=fac, specialty=spec)

    # Expired/deactivated clinician membership and a facility_admin membership
    Membership.objects.create(
        user=deactivated_doc,
        facility=fac,
        role="clinician",
        active_to=timezone.now() - timedelta(hours=1),
    )
    Membership.objects.create(user=fac_admin, facility=fac, role="facility_admin")

    session = create_triage_session(user=owner_user, language="en", disclosure_version="v1.0")
    process_patient_turn(session, "Headache for 2 days", user=owner_user)
    run_triage_action(session, "finish_questions", owner_user)
    run_triage_action(session, "confirm_summary", owner_user)

    sched = Schedule.objects.create(practitioner_role=role)
    start = timezone.now() + timedelta(days=1)
    slot = Slot.objects.create(schedule=sched, start=start, end=start + timedelta(minutes=30), state="HELD")
    Appointment.objects.create(
        patient=owner_patient,
        practitioner=prac,
        facility=fac,
        slot=slot,
        state="REQUESTED",
        triage_session_id=session.public_id,
    )

    client = APIClient()
    client.force_authenticate(user=deactivated_doc)
    assert client.get(f"/api/v1/triage/sessions/{session.public_id}").status_code == 404

    client.force_authenticate(user=fac_admin)
    assert client.get(f"/api/v1/triage/sessions/{session.public_id}").status_code == 404



