from datetime import timedelta
import pytest
from rest_framework.test import APIClient
from django.utils import timezone

@pytest.fixture
def api_client():
    return APIClient()
from apps.accounts.models import User, Membership
from apps.identity.models import Patient
from apps.organizations.models import Facility, Practitioner, PractitionerRole
from apps.directory.models import Specialty
from apps.scheduling.models import Schedule, Slot, Appointment
from apps.scheduling.services import create_appointment_request, execute_appointment_transition
from apps.common.exceptions import SlotUnavailableError

@pytest.fixture
def scheduling_setup(db):
    user = User.objects.create_user(email="doc@example.com", password="password123", display_name="Dr. Rahman")
    facility = Facility.objects.create(name="Dhaka Medical College Hospital", name_bn="ঢামেক", type="medical_college_hospital")
    specialty = Specialty.objects.create(code="cardiology", name_en="Cardiology", name_bn="কার্ডিওলজি")
    practitioner = Practitioner.objects.create(name="Rahman", registration_number="BMDC-12345", user=user)
    role = PractitionerRole.objects.create(practitioner=practitioner, facility=facility, specialty=specialty)
    Membership.objects.create(user=user, facility=facility, role="clinician")

    schedule = Schedule.objects.create(practitioner_role=role)
    start1 = timezone.now() + timedelta(days=1)
    end1 = start1 + timedelta(minutes=30)
    slot1 = Slot.objects.create(schedule=schedule, start=start1, end=end1, state="AVAILABLE")

    start2 = start1 + timedelta(hours=1)
    end2 = start2 + timedelta(minutes=30)
    slot2 = Slot.objects.create(schedule=schedule, start=start2, end=end2, state="AVAILABLE")

    patient = Patient.objects.create(given_name="Kamal", family_name="Hossain", phone="+8801700000000")
    return {
        "user": user,
        "facility": facility,
        "practitioner": practitioner,
        "patient": patient,
        "slot1": slot1,
        "slot2": slot2,
    }

@pytest.mark.django_db
def test_appointment_request_and_concurrency_lock(scheduling_setup):
    data = scheduling_setup
    slot1 = data["slot1"]
    patient = data["patient"]
    user = data["user"]

    # 1. Patient requests appointment
    appointment = create_appointment_request(user, patient.public_id, slot1.public_id)
    assert appointment.state == "REQUESTED"

    slot1.refresh_from_db()
    assert slot1.state == "HELD"

    # 2. Second concurrent request on same slot must fail with slot_unavailable
    with pytest.raises(SlotUnavailableError):
        create_appointment_request(user, patient.public_id, slot1.public_id)

    # 3. Clinician accepts appointment -> slot moves to BOOKED
    appt, allowed = execute_appointment_transition(user, appointment.public_id, "accept")
    assert appt.state == "CONFIRMED"

    slot1.refresh_from_db()
    assert slot1.state == "BOOKED"


@pytest.mark.django_db
def test_appointment_create_inferred_patient(api_client, scheduling_setup):
    # A-16: patient can create appointment without specifying patient_id
    data = scheduling_setup
    slot = data["slot2"]
    user = User.objects.create_user(phone="+8801755555555", display_name="Test Patient")
    from apps.accounts.models import PatientAccount
    PatientAccount.objects.create(user=user, patient=data["patient"])

    api_client.force_authenticate(user=user)
    resp = api_client.post("/api/v1/appointments", {
        "slot_id": str(slot.public_id),
    })
    assert resp.status_code == 201
    assert resp.data["state"] == "REQUESTED"
    assert resp.data["patient_id"] == str(data["patient"].public_id)

@pytest.mark.django_db
def test_appointment_propose_alternate_slot(scheduling_setup):
    data = scheduling_setup
    slot1 = data["slot1"]
    slot2 = data["slot2"]
    patient = data["patient"]
    user = data["user"]

    appointment = create_appointment_request(user, patient.public_id, slot1.public_id)
    assert slot1.state == "AVAILABLE" or slot1.state == "HELD"

    # Clinician proposes alternate slot
    appt, _ = execute_appointment_transition(
        user,
        appointment.public_id,
        "propose_alternate",
        payload={"alternate_slot_id": str(slot2.public_id)},
    )
    assert appt.state == "ALTERNATE_SLOT_PROPOSED"

    slot1.refresh_from_db()
    slot2.refresh_from_db()
    assert slot1.state == "AVAILABLE"  # original slot released
    assert slot2.state == "HELD"       # alternate slot held
    assert appt.slot == slot2
    assert appt.original_slot == slot1


@pytest.mark.django_db
def test_appointment_claims_guest_confirmed_triage_session(api_client, scheduling_setup):
    from apps.accounts.models import PatientAccount
    from apps.triage.services import create_triage_session, process_patient_turn, run_triage_action

    data = scheduling_setup
    patient_user = User.objects.create_user(phone="+8801755555561", display_name="Guest Booker")
    PatientAccount.objects.create(user=patient_user, patient=data["patient"])

    # Guest starts and confirms triage before signing in
    guest_session = create_triage_session(user=None, language="en", disclosure_version="v1.0")
    process_patient_turn(guest_session, "Fever for 2 days")
    run_triage_action(guest_session, "finish_questions")
    run_triage_action(guest_session, "confirm_summary")
    assert guest_session.patient_id is None

    api_client.force_authenticate(user=patient_user)
    resp = api_client.post("/api/v1/appointments", {
        "slot_id": str(data["slot1"].public_id),
        "triage_session_id": str(guest_session.public_id),
    })
    assert resp.status_code == 201
    assert str(resp.data["triage_session_id"]) == str(guest_session.public_id)

    guest_session.refresh_from_db()
    assert guest_session.patient_id == data["patient"].id


@pytest.mark.django_db
def test_appointment_rejects_unconfirmed_or_other_patient_triage_session(api_client, scheduling_setup):
    from apps.accounts.models import PatientAccount
    from apps.triage.services import create_triage_session, run_triage_action

    data = scheduling_setup
    patient_user = User.objects.create_user(phone="+8801755555562", display_name="Booker")
    PatientAccount.objects.create(user=patient_user, patient=data["patient"])

    other_patient = Patient.objects.create(given_name="Other", family_name="Person", phone="+8801700000099")
    other_user = User.objects.create_user(phone="+8801755555563", display_name="Other")
    PatientAccount.objects.create(user=other_user, patient=other_patient)

    # 1. Unconfirmed (ACTIVE) session rejected
    active_session = create_triage_session(user=patient_user, language="en", disclosure_version="v1.0")
    api_client.force_authenticate(user=patient_user)
    resp_unconfirmed = api_client.post("/api/v1/appointments", {
        "slot_id": str(data["slot1"].public_id),
        "triage_session_id": str(active_session.public_id),
    })
    assert resp_unconfirmed.status_code == 400

    # 2. Another patient's confirmed session rejected (IDOR guard)
    other_session = create_triage_session(user=other_user, language="en", disclosure_version="v1.0")
    run_triage_action(other_session, "finish_questions", other_user)
    run_triage_action(other_session, "confirm_summary", other_user)

    resp_other = api_client.post("/api/v1/appointments", {
        "slot_id": str(data["slot1"].public_id),
        "triage_session_id": str(other_session.public_id),
    })
    assert resp_other.status_code in (400, 404)




@pytest.mark.django_db
@pytest.mark.parametrize("level,expected", [("HIGH", "HIGH"), (None, None), ("nonsense", None)])
def test_the_triage_level_is_snapshotted_on_the_appointment(api_client, scheduling_setup, level, expected):
    from apps.accounts.models import PatientAccount
    from apps.triage.models import TriageSummary
    from apps.triage.services import create_triage_session, process_patient_turn, run_triage_action

    data = scheduling_setup
    patient_user = User.objects.create_user(phone="+8801755555570", display_name="Level Booker")
    PatientAccount.objects.create(user=patient_user, patient=data["patient"])
    session = create_triage_session(user=None, language="en", disclosure_version="v1.0")
    process_patient_turn(session, "Fever for 2 days")
    run_triage_action(session, "finish_questions")
    run_triage_action(session, "confirm_summary")
    summary = TriageSummary.objects.get(session=session)
    summary.structured_fields = {**summary.structured_fields, "triage_level": level}
    summary.save()

    api_client.force_authenticate(user=patient_user)
    resp = api_client.post("/api/v1/appointments", {"slot_id": str(data["slot1"].public_id), "triage_session_id": str(session.public_id)})
    assert resp.status_code == 201 and resp.data["triage_level"] == expected
    # read-only: it cannot be set by the client
    resp2 = api_client.post("/api/v1/appointments", {"slot_id": str(data["slot2"].public_id), "triage_level": "HIGH"})
    assert resp2.status_code in (201, 400) and (resp2.data.get("triage_level") is None if resp2.status_code == 201 else True)


@pytest.mark.django_db
def test_empty_patient_list_shows_only_the_clinicians_own_patients(scheduling_setup):
    from apps.identity.selectors import search_patients
    data = scheduling_setup
    user, patient = data["user"], data["patient"]
    other = Patient.objects.create(given_name="Rina", family_name="Akter", phone="+8801700000001")
    assert not search_patients(user).exists()  # no relationship yet

    appt = create_appointment_request(user, patient.public_id, data["slot1"].public_id)
    execute_appointment_transition(user, appt.public_id, "accept")
    assert list(search_patients(user)) == [patient] and other not in search_patients(user)

    execute_appointment_transition(user, appt.public_id, "cancel")
    assert not search_patients(user).exists()  # a cancelled appointment is no relationship
