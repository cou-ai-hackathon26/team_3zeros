"""Phase 3B Tests:
- Receiving-facility partial referral intake (POST /api/v1/referrals/partial-intake)
- Deterministic missing-field tracking (missing vs known negative)
- Deterministic reconciliation on (receiver_facility, provisional_code)
- Explicit receiver-state preservation (zero regression)
- Conflict rejection (cross-facility, already reconciled, verified patient mismatch, terminal state)
- Security & authorization boundaries
"""
import uuid
import pytest
from rest_framework.test import APIClient

from apps.accounts.models import Membership, PatientAccount, PlatformAdmin, User
from apps.audit.models import AuditEvent
from apps.identity.models import DuplicateCandidate, Patient
from apps.identity.services import create_patient_record
from apps.organizations.models import Facility, Practitioner
from apps.referrals.models import Referral
from apps.workflow.models import HistoryEntry


@pytest.fixture
def phase3b_env(db):
    sender_fac = Facility.objects.create(
        name="Kaliakair UHC", name_bn="কালিয়াকৈর উপজেলা স্বাস্থ্য কমপ্লেক্স", type="upazila_health_complex"
    )
    receiver_fac = Facility.objects.create(
        name="Gazipur District Hospital", name_bn="গাজীপুর জেলা হাসপাতাল", type="district_hospital"
    )
    other_fac = Facility.objects.create(
        name="Savar UHC", name_bn="সাভার উপজেলা স্বাস্থ্য কমপ্লেক্স", type="upazila_health_complex"
    )

    sender_chw = User.objects.create_user(
        email="chw3b@example.com", password="Password123!", display_name="Rahima CHW"
    )
    Membership.objects.create(
        user=sender_chw,
        facility=sender_fac,
        role="facility_staff",
        permissions=["referral.create", "consent.record_assisted"],
    )

    other_sender = User.objects.create_user(
        email="other3b@example.com", password="Password123!", display_name="Other CHW"
    )
    Membership.objects.create(
        user=other_sender,
        facility=other_fac,
        role="facility_staff",
        permissions=["referral.create"],
    )

    receiver_doc = User.objects.create_user(
        email="recvdoc3b@example.com", password="Password123!", display_name="Dr. Karim"
    )
    Membership.objects.create(user=receiver_doc, facility=receiver_fac, role="clinician")
    Practitioner.objects.create(user=receiver_doc, name="Dr. Karim", registration_number="BMDC-3B-1")

    receiver_coord = User.objects.create_user(
        email="recvcoord3b@example.com", password="Password123!", display_name="Intake Desk"
    )
    Membership.objects.create(
        user=receiver_coord,
        facility=receiver_fac,
        role="facility_staff",
        permissions=["referral.acknowledge"],
    )

    unpriv_receiver = User.objects.create_user(
        email="unpriv3b@example.com", password="Password123!", display_name="Unprivileged Staff"
    )
    Membership.objects.create(
        user=unpriv_receiver, facility=receiver_fac, role="facility_staff", permissions=[]
    )

    other_receiver = User.objects.create_user(
        email="otherrecv3b@example.com", password="Password123!", display_name="Other Hospital Doc"
    )
    Membership.objects.create(user=other_receiver, facility=other_fac, role="clinician")

    platform_admin = User.objects.create_user(
        email="pa3b@example.com", password="Password123!", display_name="Platform Admin"
    )
    PlatformAdmin.objects.create(user=platform_admin)

    return {
        "sender_fac": sender_fac,
        "receiver_fac": receiver_fac,
        "other_fac": other_fac,
        "sender_chw": sender_chw,
        "other_sender": other_sender,
        "receiver_doc": receiver_doc,
        "receiver_coord": receiver_coord,
        "unpriv_receiver": unpriv_receiver,
        "other_receiver": other_receiver,
        "platform_admin": platform_admin,
    }


def _client_for(user):
    c = APIClient()
    c.force_authenticate(user=user)
    return c


# ==============================================================================
# 1. Partial Intake, Missing Fields & Retrieval Tests
# ==============================================================================

@pytest.mark.django_db
def test_partial_intake_minimum_fields_no_phone_and_missing_fields_tracking(phase3b_env):
    coord_client = _client_for(phase3b_env["receiver_coord"])
    code = "KHC-261124-001"

    resp = coord_client.post(
        "/api/v1/referrals/partial-intake",
        {
            "provisional_code": f"MW-REF:{code}",
            "reason": "High fever and dehydration from rural clinic slip",
            "urgency": "urgent",
            "patient_name": "Momena",
            "estimated_age": 35,
            "sex": "female",
        },
        format="json",
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["is_partial"] is True
    assert data["completeness_status"] == "partial"
    assert data["state"] == "ACKNOWLEDGED_BY_RECEIVER"
    assert data["provisional_code"] == code
    assert data["sender_facility_id"] is None
    assert data["sender_practitioner_id"] is None
    assert data["patient_system_id"].startswith("MWP-")

    # Missing fields accurately tracked (allergies omitted -> missing; never fabricated)
    assert "sender_facility" in data["missing_fields"]
    assert "sender_practitioner" in data["missing_fields"]
    assert "patient_verified_identity" in data["missing_fields"]
    assert "allergies" in data["missing_fields"]
    assert "vitals" in data["missing_fields"]
    assert "treatment_given" in data["missing_fields"]

    # Audit & history recorded
    assert AuditEvent.objects.filter(
        action="partial_intake_create", object_type="referral", object_id=data["id"]
    ).exists()
    assert HistoryEntry.objects.filter(aggregate_id=data["id"], action="partial_intake").exists()

    # Retrievable by authorized receiving facility with MW-REF: QR prefix
    lookup = coord_client.get(f"/api/v1/referrals/by-reference/MW-REF:{code}")
    assert lookup.status_code == 200
    assert lookup.json()["id"] == data["id"]

    # Exact duplicate partial intake -> idempotent 200 OK (no duplicate row)
    replay = coord_client.post(
        "/api/v1/referrals/partial-intake",
        {
            "provisional_code": code,
            "reason": "High fever and dehydration from rural clinic slip",
            "urgency": "urgent",
            "patient_name": "Momena",
            "estimated_age": 35,
            "sex": "female",
        },
        format="json",
    )
    assert replay.status_code == 200
    assert replay.json()["id"] == data["id"]
    assert Referral.objects.count() == 1

    # Conflicting partial intake with same provisional code -> 409 Conflict
    conflict = coord_client.post(
        "/api/v1/referrals/partial-intake",
        {
            "provisional_code": code,
            "reason": "Different patient reason",
            "urgency": "emergency",
        },
        format="json",
    )
    assert conflict.status_code == 409


@pytest.mark.django_db
def test_partial_intake_distinguishes_known_negative_allergies_from_missing(phase3b_env):
    coord_client = _client_for(phase3b_env["receiver_coord"])
    resp = coord_client.post(
        "/api/v1/referrals/partial-intake",
        {
            "provisional_code": "KHC-261124-NEG",
            "reason": "Fractured wrist",
            "urgency": "routine",
            "allergies": [],  # Explicit known negative (no known allergies)
            "vitals": {"bp": "120/80"},
        },
        format="json",
    )
    assert resp.status_code == 201
    missing = resp.json()["missing_fields"]
    assert "allergies" not in missing
    assert "vitals" not in missing
    assert "treatment_given" in missing


# ==============================================================================
# 2. Deterministic Reconciliation & Receiver-State Preservation Tests
# ==============================================================================

@pytest.mark.django_db
def test_reconciliation_enriches_data_and_preserves_receiver_progress_without_regression(phase3b_env):
    recv_client = _client_for(phase3b_env["receiver_doc"])
    chw_client = _client_for(phase3b_env["sender_chw"])
    code = "KHC-261124-REC1"

    # 1. Patient arrives at Gazipur DH while Kaliakair UHC CHW is offline -> Partial intake
    partial_resp = recv_client.post(
        "/api/v1/referrals/partial-intake",
        {
            "provisional_code": code,
            "reason": "Acute abdominal pain (from paper slip)",
            "urgency": "urgent",
            "patient_name": "Kamal",
            "sex": "male",
            "sender_facility_id": str(phase3b_env["sender_fac"].public_id),
        },
        format="json",
    )
    assert partial_resp.status_code == 201
    ref_id = partial_resp.json()["id"]
    temp_patient_id = partial_resp.json()["patient_id"]

    # 2. Receiving doctor treats patient BEFORE sender regains internet:
    #    ACKNOWLEDGED_BY_RECEIVER -> IN_PROGRESS -> OUTCOME_RECORDED -> OUTCOME_RETURNED
    assert recv_client.post(f"/api/v1/referrals/{ref_id}/actions/start", {}, format="json").status_code == 200
    outcome_resp = recv_client.post(
        f"/api/v1/referrals/{ref_id}/actions/record_outcome",
        {"outcome": {"summary": "Appendectomy completed; patient stable."}},
        format="json",
    )
    assert outcome_resp.status_code in (200, 202)
    ref_before = Referral.objects.get(public_id=ref_id)
    progressed_state = ref_before.state
    assert progressed_state in ("OUTCOME_RECORDED", "OUTCOME_RETURNED")

    # 3. Sender regains connectivity and syncs full referral with matching provisional_code
    verified_patient = create_patient_record(
        phase3b_env["sender_chw"], {"given_name": "Kamal", "family_name": "Hossain", "sex": "male"}
    )
    idem_key = str(uuid.uuid4())
    sync_payload = {
        "patient_id": str(verified_patient.public_id),
        "receiver_facility_id": str(phase3b_env["receiver_fac"].public_id),
        "urgency": "emergency",  # Deliberate urgency difference to verify conflict logging
        "reason": "Suspected acute appendicitis with rebound tenderness",
        "provisional_code": code,
        "summary": {
            "clinical_notes": "Fever 101F, tender RIF for 18 hours",
            "vitals": {"bp": "110/70", "pulse": "102"},
            "allergies": ["Penicillin"],
            "treatment_given": "IV Normal Saline 500ml",
        },
    }
    sync_resp = chw_client.post(
        "/api/v1/referrals/", sync_payload, format="json", HTTP_IDEMPOTENCY_KEY=idem_key
    )
    assert sync_resp.status_code == 200  # Reconciled into existing referral, NOT a duplicate!
    synced = sync_resp.json()

    assert synced["id"] == ref_id
    assert Referral.objects.count() == 1
    assert synced["is_partial"] is False
    assert synced["completeness_status"] == "complete"
    assert synced["reconciled_at"] is not None
    # State NEVER regressed to DRAFT or SENT; receiver outcome preserved!
    assert synced["state"] == progressed_state
    assert synced["outcome"]["summary"] == "Appendectomy completed; patient stable."
    # Clinical enrichment + partial snapshot preserved + field differences logged
    assert synced["summary"]["allergies"] == ["Penicillin"]
    assert "partial_intake_snapshot" in synced["summary"]
    assert len(synced["reconciliation_metadata"]["conflicts_detected"]) >= 1
    # Unverified intake patient linked via DuplicateCandidate for human review (INV-13)
    assert synced["patient_id"] == str(verified_patient.public_id)
    assert DuplicateCandidate.objects.filter(
        patient_a=verified_patient, patient_b__public_id=temp_patient_id
    ).exists()
    # Audit & history logged
    assert AuditEvent.objects.filter(action="reconciliation_succeeded", object_id=ref_id).exists()
    assert HistoryEntry.objects.filter(aggregate_id=ref_id, action="reconciled_full_record").exists()

    # 4. Repeated sync with same idempotency_key is idempotent (no duplicate, no error)
    retry_resp = chw_client.post(
        "/api/v1/referrals/", sync_payload, format="json", HTTP_IDEMPOTENCY_KEY=idem_key
    )
    assert retry_resp.status_code == 200
    assert retry_resp.json()["id"] == ref_id
    assert Referral.objects.count() == 1


# ==============================================================================
# 3. Conflict & Anti-Fuzzy-Matching Tests
# ==============================================================================

@pytest.mark.django_db
def test_never_auto_reconciles_by_patient_name_alone(phase3b_env):
    recv_client = _client_for(phase3b_env["receiver_coord"])
    chw_client = _client_for(phase3b_env["sender_chw"])

    recv_client.post(
        "/api/v1/referrals/partial-intake",
        {
            "provisional_code": "KHC-261124-NAME1",
            "reason": "Chest pain",
            "patient_name": "Abdul Karim",
            "sex": "male",
        },
        format="json",
    )

    p = create_patient_record(phase3b_env["sender_chw"], {"given_name": "Abdul Karim", "sex": "male"})
    # Different provisional code -> MUST NOT auto-merge based on identical name
    resp = chw_client.post(
        "/api/v1/referrals/",
        {
            "patient_id": str(p.public_id),
            "receiver_facility_id": str(phase3b_env["receiver_fac"].public_id),
            "reason": "Chest pain",
            "provisional_code": "KHC-261124-DIFFERENT",
        },
        format="json",
    )
    assert resp.status_code == 201
    assert Referral.objects.count() == 2


@pytest.mark.django_db
def test_reconciliation_rejects_cross_facility_sender_already_reconciled_and_verified_patient_mismatch(phase3b_env):
    recv_client = _client_for(phase3b_env["receiver_coord"])
    chw_client = _client_for(phase3b_env["sender_chw"])
    other_sender_client = _client_for(phase3b_env["other_sender"])

    p1 = create_patient_record(phase3b_env["sender_chw"], {"given_name": "VerifiedOne", "sex": "female"})
    p2 = create_patient_record(phase3b_env["sender_chw"], {"given_name": "VerifiedTwo", "sex": "male"})

    # Partial intake pinned to sender_fac AND verified patient p1
    code = "KHC-261124-CONF"
    partial_resp = recv_client.post(
        "/api/v1/referrals/partial-intake",
        {
            "provisional_code": code,
            "reason": "Obstetric emergency",
            "patient_id": str(p1.public_id),
            "sender_facility_id": str(phase3b_env["sender_fac"].public_id),
        },
        format="json",
    )
    assert partial_resp.status_code == 201

    # 1. Wrong sending facility attempts to reconcile -> 409 Conflict
    wrong_fac = other_sender_client.post(
        "/api/v1/referrals/",
        {
            "patient_id": str(p1.public_id),
            "receiver_facility_id": str(phase3b_env["receiver_fac"].public_id),
            "reason": "Hijack attempt",
            "provisional_code": code,
        },
        format="json",
    )
    assert wrong_fac.status_code == 409
    assert AuditEvent.objects.filter(action="reconciliation_conflict", outcome="failure").exists()

    # 2. Correct sending facility but DIFFERENT verified patient -> 409 Conflict (cannot swap verified patient)
    wrong_pat = chw_client.post(
        "/api/v1/referrals/",
        {
            "patient_id": str(p2.public_id),
            "receiver_facility_id": str(phase3b_env["receiver_fac"].public_id),
            "reason": "Wrong patient",
            "provisional_code": code,
        },
        format="json",
    )
    assert wrong_pat.status_code == 409

    # 3. Legitimate reconciliation succeeds
    ok = chw_client.post(
        "/api/v1/referrals/",
        {
            "patient_id": str(p1.public_id),
            "receiver_facility_id": str(phase3b_env["receiver_fac"].public_id),
            "reason": "Obstetric emergency full summary",
            "provisional_code": code,
        },
        format="json",
        HTTP_IDEMPOTENCY_KEY=str(uuid.uuid4()),
    )
    assert ok.status_code == 200

    # 4. Second full referral with DIFFERENT idempotency_key targeting already-reconciled code -> 409 Conflict
    second = chw_client.post(
        "/api/v1/referrals/",
        {
            "patient_id": str(p1.public_id),
            "receiver_facility_id": str(phase3b_env["receiver_fac"].public_id),
            "reason": "Duplicate incompatible sync",
            "provisional_code": code,
        },
        format="json",
        HTTP_IDEMPOTENCY_KEY=str(uuid.uuid4()),
    )
    assert second.status_code == 409


@pytest.mark.django_db
def test_reconciliation_rejects_terminal_state_conflict(phase3b_env):
    recv_client = _client_for(phase3b_env["receiver_doc"])
    chw_client = _client_for(phase3b_env["sender_chw"])
    code = "KHC-261124-TERM"

    p_resp = recv_client.post(
        "/api/v1/referrals/partial-intake",
        {"provisional_code": code, "reason": "Test terminal conflict"},
        format="json",
    )
    ref = Referral.objects.get(public_id=p_resp.json()["id"])
    ref.state = "DECLINED"
    ref.save(update_fields=["state"])

    p = create_patient_record(phase3b_env["sender_chw"], {"given_name": "Term", "sex": "male"})
    resp = chw_client.post(
        "/api/v1/referrals/",
        {
            "patient_id": str(p.public_id),
            "receiver_facility_id": str(phase3b_env["receiver_fac"].public_id),
            "reason": "Late sync",
            "provisional_code": code,
        },
        format="json",
    )
    assert resp.status_code == 409


# ==============================================================================
# 4. Security & Authorization Tests
# ==============================================================================

@pytest.mark.django_db
def test_partial_intake_and_code_lookup_enforce_strict_facility_authorization(phase3b_env):
    payload = {"provisional_code": "KHC-261124-SEC", "reason": "Security test"}

    # Unprivileged staff at receiver facility -> 403
    assert _client_for(phase3b_env["unpriv_receiver"]).post(
        "/api/v1/referrals/partial-intake", payload, format="json"
    ).status_code == 403

    # Sending CHW (no referral.acknowledge at receiver facility) -> 403
    assert _client_for(phase3b_env["sender_chw"]).post(
        "/api/v1/referrals/partial-intake",
        {**payload, "receiver_facility_id": str(phase3b_env["receiver_fac"].public_id)},
        format="json",
    ).status_code == 403

    # Platform admin -> 403
    assert _client_for(phase3b_env["platform_admin"]).post(
        "/api/v1/referrals/partial-intake", payload, format="json"
    ).status_code == 403

    # Authorized receiver creates partial intake
    ok = _client_for(phase3b_env["receiver_coord"]).post(
        "/api/v1/referrals/partial-intake", payload, format="json"
    )
    assert ok.status_code == 201

    # Another hospital guessing the exact provisional_code gets 404 (not exposed!)
    other_lookup = _client_for(phase3b_env["other_receiver"]).get(
        "/api/v1/referrals/by-reference/KHC-261124-SEC"
    )
    assert other_lookup.status_code == 404
