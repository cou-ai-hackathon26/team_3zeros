"""
Phase 3C.2 (F-1) Regression Suite: Authentication & Idempotency Consistency.
Verifies user-scoped idempotency replay, payload-mismatch detection (409), and cross-user isolation
under BOTH Django SessionAuthentication (production web) and DRF-layer authentication (force_authenticate).
"""

import uuid
import pytest
from rest_framework.test import APIClient

from apps.accounts.models import User, Membership
from apps.identity.models import Patient
from apps.organizations.models import Facility, Practitioner
from apps.referrals.models import Referral


@pytest.fixture
def idemp_users(db):
    fac_a = Facility.objects.create(name="Hardening UHC A", type="hospital")
    fac_b = Facility.objects.create(name="Hardening DH B", type="hospital")

    chw_a = User.objects.create_user(
        username="hardening_chw_a",
        password="Password123!",
        display_name="CHW A",
    )
    Membership.objects.create(
        user=chw_a,
        facility=fac_a,
        role="facility_staff",
        permissions=["referral.create", "consent.record_assisted"],
    )

    chw_b = User.objects.create_user(
        username="hardening_chw_b",
        password="Password123!",
        display_name="CHW B",
    )
    Membership.objects.create(
        user=chw_b,
        facility=fac_b,
        role="facility_staff",
        permissions=["referral.create"],
    )

    doc_b = User.objects.create_user(
        username="hardening_doc_b",
        password="Password123!",
        display_name="Doc B",
    )
    Membership.objects.create(
        user=doc_b,
        facility=fac_b,
        role="clinician",
        permissions=["referral.acknowledge", "referral.create"],
    )
    Practitioner.objects.create(
        user=doc_b,
        name="Dr. B",
        registration_number="BMDC-HARDEN-B",
    )

    return {"fac_a": fac_a, "fac_b": fac_b, "chw_a": chw_a, "chw_b": chw_b, "doc_b": doc_b}


@pytest.mark.django_db
class TestPhase3C2IdempotencyHardening:
    @pytest.mark.parametrize("auth_mode", ["session", "drf_force_authenticate"])
    def test_patient_creation_idempotency_consistent_across_auth_layers(self, idemp_users, auth_mode):
        client = APIClient()
        if auth_mode == "session":
            client.force_login(idemp_users["chw_a"])
        else:
            client.force_authenticate(user=idemp_users["chw_a"])

        key = str(uuid.uuid4())
        payload = {"given_name": "Hasina", "sex": "female", "estimated_age": 40, "phone": None}

        r1 = client.post("/api/v1/patients/", payload, format="json", HTTP_IDEMPOTENCY_KEY=key)
        assert r1.status_code == 201
        pat_id = r1.json()["id"]
        sys_id = r1.json()["system_id"]
        count_after_r1 = Patient.objects.count()

        # Retry with exact same key & payload -> replays 201 with 0 duplicates
        r2 = client.post("/api/v1/patients/", payload, format="json", HTTP_IDEMPOTENCY_KEY=key)
        assert r2.status_code == 201
        assert r2.headers.get("X-Idempotent-Replay") == "true"
        assert r2.json()["id"] == pat_id
        assert r2.json()["system_id"] == sys_id
        assert Patient.objects.count() == count_after_r1

        # Same key + different payload -> 409 idempotency_conflict
        r3 = client.post(
            "/api/v1/patients/",
            {**payload, "given_name": "Different"},
            format="json",
            HTTP_IDEMPOTENCY_KEY=key,
        )
        assert r3.status_code == 409
        assert r3.json()["error"]["code"] == "idempotency_conflict"

        # Cross-user isolation: CHW B reusing the same Idempotency-Key must NOT receive CHW A's patient
        client_b = APIClient()
        if auth_mode == "session":
            client_b.force_login(idemp_users["chw_b"])
        else:
            client_b.force_authenticate(user=idemp_users["chw_b"])
        r_b = client_b.post("/api/v1/patients/", payload, format="json", HTTP_IDEMPOTENCY_KEY=key)
        assert r_b.status_code == 201
        assert r_b.headers.get("X-Idempotent-Replay") is None
        assert r_b.json()["id"] != pat_id

    def test_referral_action_idempotency_works_with_drf_force_authenticate(self, idemp_users):
        pat = Patient.objects.create(given_name="Kamal", sex="male", phone=None)
        prac = Practitioner.objects.get(user=idemp_users["doc_b"])
        ref = Referral.objects.create(
            patient=pat,
            sender_facility=idemp_users["fac_a"],
            sender_practitioner=prac,
            receiver_facility=idemp_users["fac_b"],
            urgency="urgent",
            reason="Test action replay",
            state="SENT",
            version=2,
        )

        client = APIClient()
        client.force_authenticate(user=idemp_users["doc_b"])
        key = str(uuid.uuid4())

        r1 = client.post(
            f"/api/v1/referrals/{ref.public_id}/actions/acknowledge",
            {},
            format="json",
            HTTP_IDEMPOTENCY_KEY=key,
            HTTP_IF_MATCH="2",
        )
        assert r1.status_code == 200
        assert r1.json()["state"] == "ACKNOWLEDGED_BY_RECEIVER"

        r2 = client.post(
            f"/api/v1/referrals/{ref.public_id}/actions/acknowledge",
            {},
            format="json",
            HTTP_IDEMPOTENCY_KEY=key,
            HTTP_IF_MATCH="2",
        )
        assert r2.status_code == 200
        assert r2.headers.get("X-Idempotent-Replay") == "true"
