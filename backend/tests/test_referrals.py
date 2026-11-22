import uuid
import pytest
from django.utils import timezone
from apps.accounts.models import User, Membership
from apps.identity.models import Patient
from apps.organizations.models import Facility, Practitioner
from apps.referrals.models import Referral, EmergencyReferral
from apps.referrals.services import (
    create_referral_draft,
    update_referral_draft,
    create_emergency_referral,
    execute_referral_transition,
)
from apps.common.exceptions import TransitionNotAllowedError, IdempotencyConflictError

@pytest.fixture
def referral_setup(db):
    user_sender = User.objects.create_user(email="sender@example.com", password="password", display_name="Dr. Sender")
    user_receiver = User.objects.create_user(email="receiver@example.com", password="password", display_name="Dr. Receiver")

    facility_sender = Facility.objects.create(name="Upazila Health Complex", type="upazila_health_complex")
    facility_receiver = Facility.objects.create(name="District Hospital", type="district_hospital")

    Membership.objects.create(user=user_sender, facility=facility_sender, role="clinician")
    Membership.objects.create(user=user_receiver, facility=facility_receiver, role="clinician")

    patient = Patient.objects.create(given_name="Anisur", family_name="Rahman", phone="+8801811111111")

    return {
        "user_sender": user_sender,
        "user_receiver": user_receiver,
        "facility_sender": facility_sender,
        "facility_receiver": facility_receiver,
        "patient": patient,
    }

@pytest.mark.django_db
def test_referral_draft_and_transitions(referral_setup):
    data = referral_setup
    user_s = data["user_sender"]
    user_r = data["user_receiver"]
    patient = data["patient"]
    fac_r = data["facility_receiver"]

    # 1. Create draft
    draft_data = {
        "patient_id": patient.public_id,
        "receiver_facility_id": fac_r.public_id,
        "urgency": "routine",
        "reason": "Cardiac consultation needed",
        "summary": {"complaints": "chest discomfort on exertion"},
    }
    referral = create_referral_draft(user_s, draft_data)
    assert referral.state == "DRAFT"
    assert len(referral.reference_code) == 8

    # 2. Update draft
    referral = update_referral_draft(user_s, referral.public_id, {"reason": "Updated cardiac consultation"})
    assert referral.reason == "Updated cardiac consultation"

    # 3. Transition DRAFT -> AWAITING_PATIENT_CONSENT
    referral, _ = execute_referral_transition(user_s, referral.public_id, "request_consent")
    assert referral.state == "AWAITING_PATIENT_CONSENT"

    # Content cannot be edited outside DRAFT
    with pytest.raises(TransitionNotAllowedError):
        update_referral_draft(user_s, referral.public_id, {"reason": "Should fail"})

    # 4. Patient grants consent -> READY_FOR_SENDER_APPROVAL
    referral, _ = execute_referral_transition(user_s, referral.public_id, "consent_granted")
    assert referral.state == "READY_FOR_SENDER_APPROVAL"

    # 5. Sender approves -> APPROVED_BY_SENDER
    referral, _ = execute_referral_transition(user_s, referral.public_id, "approve")
    assert referral.state == "APPROVED_BY_SENDER"

@pytest.mark.django_db
def test_emergency_referral_idempotency_and_state(referral_setup):
    data = referral_setup
    user_s = data["user_sender"]
    fac_r = data["facility_receiver"]

    key = uuid.uuid4()
    payload = {
        "reason": "Acute myocardial infarction",
        "urgency": "emergency",
        "vitals": {"bp": "90/60", "hr": "115"},
        "treatment_given": "Aspirin 300mg, Oxygen",
        "facility_id": fac_r.public_id,
        "idempotency_key": key,
        "created_at_device": timezone.now(),
    }

    # 1. Create emergency referral
    ref1 = create_emergency_referral(user_s, payload)
    assert ref1.state == "SENT"
    assert ref1.emergency_mode is True
    assert ref1.urgency == "emergency"

    # 2. Replay with exact same payload -> returns same referral
    ref2 = create_emergency_referral(user_s, payload)
    assert ref1.public_id == ref2.public_id

    # 3. Replay with different payload -> 409 idempotency conflict
    conflict_payload = dict(payload)
    conflict_payload["reason"] = "Different reason entirely"
    with pytest.raises(IdempotencyConflictError):
        create_emergency_referral(user_s, conflict_payload)
