import pytest
from rest_framework.test import APIClient
from apps.accounts.models import Membership
from apps.directory.models import Specialty
from apps.identity.models import Patient
from apps.organizations.models import Facility, Practitioner, PractitionerRole
from apps.triage.models import TriageSession, TriageSummary
from apps.triage.services import create_triage_session, get_triage_session_for_read
from apps.referrals.services import create_referral_draft
from apps.records.models import Encounter


@pytest.fixture
def test_setup(db, django_user_model):
    facility = Facility.objects.create(name="Primary Care Center")
    facility2 = Facility.objects.create(name="District Hospital")
    spec = Specialty.objects.create(code="general_medicine", name_en="General Medicine", name_bn="মেডিসিন")

    doctor_user = django_user_model.objects.create_user(email="doctor@test.com", password="pw")
    doctor_practitioner = Practitioner.objects.create(user=doctor_user, name="Dr. A", registration_number="BMDC-1111")
    PractitionerRole.objects.create(practitioner=doctor_practitioner, facility=facility, specialty=spec)
    Membership.objects.create(user=doctor_user, facility=facility, role="clinician")

    doctor2_user = django_user_model.objects.create_user(email="specialist@test.com", password="pw")
    doctor2_practitioner = Practitioner.objects.create(user=doctor2_user, name="Dr. Specialist", registration_number="BMDC-2222")
    PractitionerRole.objects.create(practitioner=doctor2_practitioner, facility=facility2, specialty=spec)
    Membership.objects.create(user=doctor2_user, facility=facility2, role="clinician")

    patient = Patient.objects.create(given_name="Rahim", family_name="Uddin", phone="+8801700000001")

    # Confirmed triage session linked to patient
    triage = create_triage_session(user=None, language="en", disclosure_version="v1.0")
    triage.patient = patient
    triage.state = "CONFIRMED_BY_PATIENT"
    triage.save()

    summary = TriageSummary.objects.create(
        session=triage,
        patient_words="Severe chest tightness and shortness of breath",
        structured_fields={
            "chief_complaint": "Chest tightness",
            "duration": "2 days",
            "severity": "Severe",
            "triage_level": "HIGH",
            "additional_notes": "Hypertension history",
        },
        patient_edits={"duration": "3 days"},
    )

    return {
        "facility": facility,
        "facility2": facility2,
        "doctor_user": doctor_user,
        "doctor2_user": doctor2_user,
        "patient": patient,
        "triage": triage,
        "summary": summary,
    }


@pytest.mark.django_db
def test_patient_chart_includes_triage_sessions(test_setup):
    client = APIClient()
    client.force_authenticate(user=test_setup["doctor_user"])

    # Establish care relationship with facility
    Encounter.objects.create(
        patient=test_setup["patient"],
        facility=test_setup["facility"],
        period_start="2026-11-20T10:00:00Z",
        reason="Initial consult",
    )

    r = client.get(f"/api/v1/patients/{test_setup['patient'].public_id}/chart")
    assert r.status_code == 200
    data = r.json()
    assert "triage_sessions" in data
    assert len(data["triage_sessions"]) == 1
    ts = data["triage_sessions"][0]
    assert ts["id"] == str(test_setup["triage"].public_id)
    assert ts["triage_level"] == "HIGH"
    assert ts["summary"]["structured_fields"]["chief_complaint"] == "Chest tightness"
    assert ts["summary"]["patient_edits"] == {"duration": "3 days"}


@pytest.mark.django_db
def test_referral_carries_triage_session_id(test_setup):
    client = APIClient()
    client.force_authenticate(user=test_setup["doctor_user"])

    # Establish care relationship so doctor can create referral
    Encounter.objects.create(
        patient=test_setup["patient"],
        facility=test_setup["facility"],
        period_start="2026-11-20T10:00:00Z",
        reason="Initial consult",
    )

    referral = create_referral_draft(
        user=test_setup["doctor_user"],
        validated_data={
            "patient_id": test_setup["patient"].public_id,
            "receiver_facility_id": test_setup["facility2"].public_id,
            "urgency": "urgent",
            "reason": "Cardiology escalation",
            "triage_session_id": test_setup["triage"].public_id,
        },
    )

    assert str(referral.triage_session_id) == str(test_setup["triage"].public_id)

    # Serializer test
    r = client.get(f"/api/v1/referrals/{referral.public_id}")
    assert r.status_code == 200
    assert r.json()["triage_session_id"] == str(test_setup["triage"].public_id)

    # Specialist at receiving facility can read triage summary via referral care relationship
    session, is_clinician = get_triage_session_for_read(test_setup["doctor2_user"], test_setup["triage"].public_id)
    assert is_clinician is True
    assert session.public_id == test_setup["triage"].public_id
