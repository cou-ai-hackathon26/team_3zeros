"""
Phase 3C.1 Isolated Reliability & Failure-Recovery Audit Suite (Backend).
Independently verifies Audit 2 (Lost HTTP response & idempotency for Patient and Referral creation)
and Audit 6 (Server-side Referral Action concurrency: If-Match / expected_version, action idempotency,
and receiver state-change races) against real Django views and middleware.

Read-only audit: does NOT modify any backend models, views, services, or migrations.
"""

import uuid
import pytest
from rest_framework.test import APIClient

from apps.accounts.models import User, Membership
from apps.identity.models import Patient
from apps.organizations.models import Facility, Practitioner
from apps.referrals.models import Referral


@pytest.fixture
def audit_setup(db):
    sender_fac = Facility.objects.create(
        name="Audit Sender UHC",
        type="hospital",
    )
    receiver_fac = Facility.objects.create(
        name="Audit Receiver DH",
        type="hospital",
    )

    chw = User.objects.create_user(
        username="audit_chw_3c1",
        password="AuditPassword123!",
        display_name="Audit CHW",
    )
    Membership.objects.create(
        user=chw,
        facility=sender_fac,
        role="facility_staff",
        permissions=["referral.create", "consent.record_assisted"],
    )

    receiver_doc = User.objects.create_user(
        username="audit_recv_doc_3c1",
        password="AuditPassword123!",
        display_name="Audit Receiver Doc",
    )
    Membership.objects.create(
        user=receiver_doc,
        facility=receiver_fac,
        role="clinician",
        permissions=["referral.acknowledge", "referral.create"],
    )
    Practitioner.objects.create(
        user=receiver_doc,
        name="Dr. Receiver Audit",
        registration_number="BMDC-AUDIT-3C1",
    )

    sender_doc = User.objects.create_user(
        username="audit_send_doc_3c1",
        password="AuditPassword123!",
        display_name="Audit Sender Doc",
    )
    Membership.objects.create(
        user=sender_doc,
        facility=sender_fac,
        role="clinician",
        permissions=["referral.create", "referral.acknowledge"],
    )
    Practitioner.objects.create(
        user=sender_doc,
        name="Dr. Sender Audit",
        registration_number="BMDC-AUDIT-SEND-3C1",
    )

    return {
        "sender_fac": sender_fac,
        "receiver_fac": receiver_fac,
        "chw": chw,
        "sender_doc": sender_doc,
        "receiver_doc": receiver_doc,
    }


@pytest.mark.django_db
class TestPhase3C1BackendReliabilityAudit:
    # ── Audit 2: Lost HTTP Response & Idempotency ──────────────────────────────
    def test_patient_creation_lost_response_retry_with_session_auth_is_idempotent(self, audit_setup):
        client = APIClient()
        client.force_login(audit_setup["chw"])

        idemp_key = str(uuid.uuid4())
        payload = {
            "given_name": "Rahima",
            "family_name": "Begum",
            "sex": "female",
            "estimated_age": 31,
            "phone": None,
        }

        # 1st request: server commits patient, suppose HTTP response drops on wire
        r1 = client.post(
            "/api/v1/patients/",
            payload,
            format="json",
            HTTP_IDEMPOTENCY_KEY=idemp_key,
        )
        assert r1.status_code == 201
        pat_id_1 = r1.json()["id"]
        sys_id_1 = r1.json()["system_id"]
        assert sys_id_1.startswith("MWP-")
        assert Patient.objects.filter(public_id=pat_id_1).count() == 1
        total_before_retry = Patient.objects.count()

        # 2nd request (retry after lost response with exact same Idempotency-Key and payload)
        r2 = client.post(
            "/api/v1/patients/",
            payload,
            format="json",
            HTTP_IDEMPOTENCY_KEY=idemp_key,
        )
        assert r2.status_code == 201
        assert r2.headers.get("X-Idempotent-Replay") == "true"
        assert r2.json()["id"] == pat_id_1
        assert r2.json()["system_id"] == sys_id_1
        assert Patient.objects.count() == total_before_retry

        # 3rd request: same key with DIFFERENT payload must return 409 idempotency_conflict
        r3 = client.post(
            "/api/v1/patients/",
            {**payload, "given_name": "ModifiedName"},
            format="json",
            HTTP_IDEMPOTENCY_KEY=idemp_key,
        )
        assert r3.status_code == 409
        assert r3.json()["error"]["code"] == "idempotency_conflict"

    def test_audit_probe_drf_non_session_auth_bypasses_idempotency_middleware(self, audit_setup):
        """
        Audit Probe: When a caller authenticates at the DRF layer (after Django middleware),
        IdempotencyMiddleware.process_request sees AnonymousUser while process_response saves user_id,
        causing retries to miss replay and create a duplicate Patient!
        """
        client = APIClient()
        client.force_authenticate(user=audit_setup["chw"])
        idemp_key = str(uuid.uuid4())
        payload = {"given_name": "Probe", "sex": "female", "phone": None}

        r1 = client.post("/api/v1/patients/", payload, format="json", HTTP_IDEMPOTENCY_KEY=idemp_key)
        assert r1.status_code == 201
        count_after_r1 = Patient.objects.count()

        r2 = client.post("/api/v1/patients/", payload, format="json", HTTP_IDEMPOTENCY_KEY=idemp_key)
        assert r2.status_code == 201
        # Post Phase 3C.2 (F-1 fixed): DRF-layer auth now replays idempotently with 0 duplicate patients
        assert r2.headers.get("X-Idempotent-Replay") == "true"
        assert Patient.objects.count() == count_after_r1

    def test_standard_referral_lost_response_retry_creates_single_referral(self, audit_setup):
        client = APIClient()
        client.force_authenticate(user=audit_setup["chw"])

        pat = Patient.objects.create(given_name="Karim", sex="male", phone=None)
        idemp_key = str(uuid.uuid4())
        payload = {
            "patient_id": str(pat.public_id),
            "receiver_facility_id": str(audit_setup["receiver_fac"].public_id),
            "urgency": "urgent",
            "reason": "Severe dehydration",
            "provisional_code": "UHC01-1124-0099",
            "idempotency_key": idemp_key,
        }

        r1 = client.post(
            "/api/v1/referrals/",
            payload,
            format="json",
            HTTP_IDEMPOTENCY_KEY=idemp_key,
        )
        assert r1.status_code == 201
        ref_id_1 = r1.json()["id"]
        ref_code_1 = r1.json()["reference_code"]
        count_after_first = Referral.objects.count()

        # Retry after simulated lost response
        r2 = client.post(
            "/api/v1/referrals/",
            payload,
            format="json",
            HTTP_IDEMPOTENCY_KEY=idemp_key,
        )
        assert r2.status_code == 200
        assert r2.json()["id"] == ref_id_1
        assert r2.json()["reference_code"] == ref_code_1
        assert Referral.objects.count() == count_after_first

    # ── Audit 6: Server-Side Referral Action Concurrency ───────────────────────
    def test_referral_action_enforces_if_match_version_and_idempotency(self, audit_setup):
        pat = Patient.objects.create(given_name="Salma", sex="female", phone=None)
        sender_prac = Practitioner.objects.get(user=audit_setup["sender_doc"])
        referral = Referral.objects.create(
            patient=pat,
            sender_facility=audit_setup["sender_fac"],
            sender_practitioner=sender_prac,
            receiver_facility=audit_setup["receiver_fac"],
            urgency="urgent",
            reason="Acute respiratory distress",
            state="SENT",
            version=3,
        )

        recv_client = APIClient()
        recv_client.force_login(audit_setup["receiver_doc"])

        # 1. Valid acknowledge with matching If-Match: 3 succeeds and increments version to 4
        ack_key = str(uuid.uuid4())
        r_ack = recv_client.post(
            f"/api/v1/referrals/{referral.public_id}/actions/acknowledge",
            {},
            format="json",
            HTTP_IDEMPOTENCY_KEY=ack_key,
            HTTP_IF_MATCH="3",
        )
        assert r_ack.status_code == 200
        assert r_ack.json()["state"] == "ACKNOWLEDGED_BY_RECEIVER"
        assert r_ack.json()["version"] == 4

        # 2. Repeating the exact same action with the same Idempotency-Key replays cached 200
        r_replay = recv_client.post(
            f"/api/v1/referrals/{referral.public_id}/actions/acknowledge",
            {},
            format="json",
            HTTP_IDEMPOTENCY_KEY=ack_key,
            HTTP_IF_MATCH="3",
        )
        assert r_replay.status_code == 200
        assert r_replay.headers.get("X-Idempotent-Replay") == "true"

        # 3. Stale offline action queued against old version 3 (e.g. decline) -> 412 stale_version
        r_stale = recv_client.post(
            f"/api/v1/referrals/{referral.public_id}/actions/decline",
            {"reason": "No ICU bed"},
            format="json",
            HTTP_IDEMPOTENCY_KEY=str(uuid.uuid4()),
            HTTP_IF_MATCH="3",
        )
        assert r_stale.status_code == 412
        assert r_stale.json()["error"]["code"] == "stale_version"

        # 4. Invalid transition WITHOUT If-Match header -> 409 transition_not_allowed
        r_invalid = recv_client.post(
            f"/api/v1/referrals/{referral.public_id}/actions/decline",
            {"reason": "No ICU bed"},
            format="json",
            HTTP_IDEMPOTENCY_KEY=str(uuid.uuid4()),
        )
        assert r_invalid.status_code == 409
        assert r_invalid.json()["error"]["code"] == "transition_not_allowed"

        # Confirm server state was NOT regressed or overwritten
        referral.refresh_from_db()
        assert referral.state == "ACKNOWLEDGED_BY_RECEIVER"
        assert referral.version == 4
