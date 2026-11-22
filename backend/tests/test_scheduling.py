from datetime import timedelta
import pytest
from django.utils import timezone
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

