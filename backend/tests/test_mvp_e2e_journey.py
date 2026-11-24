"""
Medi Waypoint MVP — Integrated End-to-End Backend Journey Tests.

Verifies the complete patient-to-outcome thread across:
1. Phone-less patient registration (MWP-*) -> network drop -> receiving-facility partial intake ->
   receiver acknowledge + start (IN_PROGRESS) -> sender full referral sync & deterministic reconciliation
   (zero duplicates, zero status regression) -> record_outcome (auto-return) -> CHW outcome visibility -> close.
2. Phone-less patient registration -> CHW standard referral draft -> request_consent ->
   assisted in-person consent (verbal) -> READY_FOR_SENDER_APPROVAL -> clinician send ->
   QR token lookup (MW-REF:) -> receiver acknowledge -> start -> outcome -> close.
"""

import uuid
import pytest
from rest_framework.test import APIClient

from apps.accounts.models import User, Membership
from apps.identity.models import Patient
from apps.organizations.models import Facility, Practitioner
from apps.referrals.models import Referral


@pytest.fixture
def mvp_actors(db):
    sender_fac = Facility.objects.create(name="Mirzapur UHC", type="hospital")
    receiver_fac = Facility.objects.create(name="Tangail District Hospital", type="hospital")

    chw = User.objects.create_user(
        username="mvp_e2e_chw",
        password="MvpPassword123!",
        display_name="CHW Nasrin",
    )
    Membership.objects.create(
        user=chw,
        facility=sender_fac,
        role="facility_staff",
        permissions=["referral.create", "consent.record_assisted"],
    )

    sender_doc = User.objects.create_user(
        username="mvp_e2e_sender_doc",
        password="MvpPassword123!",
        display_name="Dr. Sender",
    )
    Membership.objects.create(
        user=sender_doc,
        facility=sender_fac,
        role="clinician",
        permissions=["referral.create", "referral.acknowledge"],
    )
    Practitioner.objects.create(
        user=sender_doc,
        name="Dr. Sender",
        registration_number="BMDC-MVP-SEND",
    )

    receiver_doc = User.objects.create_user(
        username="mvp_e2e_receiver_doc",
        password="MvpPassword123!",
        display_name="Dr. Receiver",
    )
    Membership.objects.create(
        user=receiver_doc,
        facility=receiver_fac,
        role="clinician",
        permissions=["referral.acknowledge", "referral.create"],
    )
    Practitioner.objects.create(
        user=receiver_doc,
        name="Dr. Receiver",
        registration_number="BMDC-MVP-RECV",
    )

    return {
        "sender_fac": sender_fac,
        "receiver_fac": receiver_fac,
        "chw": chw,
        "sender_doc": sender_doc,
        "receiver_doc": receiver_doc,
    }


@pytest.mark.django_db
class TestMediWaypointMvpEndToEnd:
    def test_full_partial_intake_reconciliation_outcome_and_closure_journey(self, mvp_actors):
        chw_client = APIClient()
        chw_client.force_login(mvp_actors["chw"])

        recv_client = APIClient()
        recv_client.force_login(mvp_actors["receiver_doc"])

        sender_doc_client = APIClient()
        sender_doc_client.force_login(mvp_actors["sender_doc"])

        # 1-3. CHW registers phone-less patient (no phone, email, NID, birth_reg) -> receives MWP-*
        pat_key = str(uuid.uuid4())
        r_pat = chw_client.post(
            "/api/v1/patients/",
            {"given_name": "Rahima", "family_name": "Begum", "sex": "female", "estimated_age": 28, "phone": None},
            format="json",
            HTTP_IDEMPOTENCY_KEY=pat_key,
        )
        assert r_pat.status_code == 201
        pat_id = r_pat.json()["id"]
        mwp_id = r_pat.json()["system_id"]
        assert mwp_id.startswith("MWP-")
        assert r_pat.json()["has_account"] is False

        # 4. Simulate network drop: receiver scans QR MW-REF:UHC01-1124-0777 before sender syncs -> 404
        prov_code = "UHC01-1124-0777"
        r_lookup_missing = recv_client.get(f"/api/v1/referrals/by-reference/MW-REF:{prov_code}")
        assert r_lookup_missing.status_code == 404

        # 5. Receiver accepts partial referral without waiting for complete record
        r_partial = recv_client.post(
            "/api/v1/referrals/partial-intake",
            {
                "provisional_code": prov_code,
                "reason": "Severe pre-eclampsia with headache",
                "urgency": "urgent",
                "patient_system_id": mwp_id,
                "presenting_symptoms": "BP 170/110, blurred vision",
            },
            format="json",
            HTTP_IDEMPOTENCY_KEY=str(uuid.uuid4()),
        )
        assert r_partial.status_code == 201
        partial_data = r_partial.json()
        ref_id = partial_data["id"]
        assert partial_data["is_partial"] is True
        assert partial_data["completeness_status"] == "partial"
        assert len(partial_data["missing_fields"]) > 0
        assert partial_data["state"] == "ACKNOWLEDGED_BY_RECEIVER"

        # 6. Receiver starts clinical care while still partial
        r_start = recv_client.post(
            f"/api/v1/referrals/{ref_id}/actions/start",
            {},
            format="json",
            HTTP_IDEMPOTENCY_KEY=str(uuid.uuid4()),
            HTTP_IF_MATCH=str(partial_data["version"]),
        )
        assert r_start.status_code == 200
        assert r_start.json()["state"] == "IN_PROGRESS"

        # 7. Sender reconnects & syncs full referral with the same provisional_code -> deterministic reconciliation!
        ref_count_before = Referral.objects.count()
        sender_ref_key = str(uuid.uuid4())
        r_sync = chw_client.post(
            "/api/v1/referrals/",
            {
                "patient_id": pat_id,
                "receiver_facility_id": str(mvp_actors["receiver_fac"].public_id),
                "urgency": "urgent",
                "reason": "Severe pre-eclampsia with headache",
                "provisional_code": prov_code,
                "idempotency_key": sender_ref_key,
                "summary": {"symptoms": "BP 170/110", "allergy_status": "none_known"},
            },
            format="json",
            HTTP_IDEMPOTENCY_KEY=sender_ref_key,
        )
        assert r_sync.status_code == 200
        reconciled = r_sync.json()
        assert reconciled["id"] == ref_id
        assert Referral.objects.count() == ref_count_before  # Zero duplicates!
        assert reconciled["is_partial"] is False
        assert reconciled["completeness_status"] == "complete"
        assert reconciled["reconciled_at"] is not None
        assert reconciled["state"] == "IN_PROGRESS"  # Receiver progress preserved (zero regression)!

        # 8. Receiver records clinical outcome -> auto-returns outcome to sending facility
        r_outcome = recv_client.post(
            f"/api/v1/referrals/{ref_id}/actions/record_outcome",
            {"outcome": {"summary": "Stabilized with MgSO4; safe delivery completed"}},
            format="json",
            HTTP_IDEMPOTENCY_KEY=str(uuid.uuid4()),
            HTTP_IF_MATCH=str(reconciled["version"]),
        )
        assert r_outcome.status_code == 200
        assert r_outcome.json()["state"] == "OUTCOME_RETURNED"

        # 9. CHW can see the returned outcome on the outgoing referral
        r_chw_view = chw_client.get(f"/api/v1/referrals/{ref_id}")
        assert r_chw_view.status_code == 200
        assert r_chw_view.json()["state"] == "OUTCOME_RETURNED"
        assert "MgSO4" in str(r_chw_view.json()["outcome"])

        # 10. Sender clinician closes the referral
        r_close = sender_doc_client.post(
            f"/api/v1/referrals/{ref_id}/actions/close",
            {},
            format="json",
            HTTP_IDEMPOTENCY_KEY=str(uuid.uuid4()),
            HTTP_IF_MATCH=str(r_chw_view.json()["version"]),
        )
        assert r_close.status_code == 200
        assert r_close.json()["state"] == "CLOSED"

    def test_online_assisted_consent_approval_qr_lookup_and_closure_journey(self, mvp_actors):
        chw_client = APIClient()
        chw_client.force_login(mvp_actors["chw"])

        sender_doc_client = APIClient()
        sender_doc_client.force_login(mvp_actors["sender_doc"])

        recv_client = APIClient()
        recv_client.force_login(mvp_actors["receiver_doc"])

        # 1. Phone-less patient registration
        r_pat = chw_client.post(
            "/api/v1/patients/",
            {"given_name": "Karim", "sex": "male", "estimated_age": 55, "phone": None},
            format="json",
            HTTP_IDEMPOTENCY_KEY=str(uuid.uuid4()),
        )
        assert r_pat.status_code == 201
        pat_id = r_pat.json()["id"]

        # 2. CHW creates standard referral draft
        r_ref = chw_client.post(
            "/api/v1/referrals/",
            {
                "patient_id": pat_id,
                "receiver_facility_id": str(mvp_actors["receiver_fac"].public_id),
                "urgency": "routine",
                "reason": "Uncontrolled diabetes follow-up",
            },
            format="json",
            HTTP_IDEMPOTENCY_KEY=str(uuid.uuid4()),
        )
        assert r_ref.status_code == 201
        ref_id = r_ref.json()["id"]
        ref_code = r_ref.json()["reference_code"]
        assert r_ref.json()["state"] == "DRAFT"

        # 3. CHW requests consent -> AWAITING_PATIENT_CONSENT
        r_req_c = chw_client.post(
            f"/api/v1/referrals/{ref_id}/actions/request_consent",
            {},
            format="json",
            HTTP_IDEMPOTENCY_KEY=str(uuid.uuid4()),
        )
        assert r_req_c.status_code == 200
        assert r_req_c.json()["state"] == "AWAITING_PATIENT_CONSENT"
        cr_id = r_req_c.json()["consent_request_id"]
        assert cr_id is not None

        # 4. CHW records assisted verbal consent -> advances ONLY to READY_FOR_SENDER_APPROVAL
        r_assisted = chw_client.post(
            f"/api/v1/consents/requests/{cr_id}/record-assisted",
            {
                "method": "assisted_verbal",
                "patient_confirmed_in_person": True,
                "witness_name": "Shafiqul Islam",
                "notes": "Explained in Bangla",
                "consent_language": "bn",
            },
            format="json",
            HTTP_IDEMPOTENCY_KEY=str(uuid.uuid4()),
        )
        assert r_assisted.status_code == 201
        r_after_consent = chw_client.get(f"/api/v1/referrals/{ref_id}")
        assert r_after_consent.json()["state"] == "READY_FOR_SENDER_APPROVAL"

        # 5. Clinician approves (approve) then sends (send) -> SENT
        r_approve = sender_doc_client.post(
            f"/api/v1/referrals/{ref_id}/actions/approve",
            {},
            format="json",
            HTTP_IDEMPOTENCY_KEY=str(uuid.uuid4()),
            HTTP_IF_MATCH=str(r_after_consent.json()["version"]),
        )
        assert r_approve.status_code == 200
        assert r_approve.json()["state"] == "APPROVED_BY_SENDER"

        r_send = sender_doc_client.post(
            f"/api/v1/referrals/{ref_id}/actions/send",
            {},
            format="json",
            HTTP_IDEMPOTENCY_KEY=str(uuid.uuid4()),
            HTTP_IF_MATCH=str(r_approve.json()["version"]),
        )
        assert r_send.status_code == 200
        assert r_send.json()["state"] == "SENT"

        # 6. Receiving facility retrieves referral using MW-REF: QR token
        r_qr = recv_client.get(f"/api/v1/referrals/by-reference/MW-REF:{ref_code}")
        assert r_qr.status_code == 200
        assert r_qr.json()["id"] == ref_id
