"""Phase 3A Backend Foundation Tests:
- Patient human-readable system ID (MWP-XXXXXXXX)
- Facility-scoped standard referral idempotency
- CHW (`facility_staff` + `referral.create`) permission boundaries
- Assisted in-person consent (`assisted_verbal` / `assisted_paper`) for account-less patients
"""
import re
import uuid
from unittest import mock

import pytest
from django.db import IntegrityError
from rest_framework.test import APIClient

from apps.accounts.models import Membership, PatientAccount, PlatformAdmin, User
from apps.audit.models import AuditEvent
from apps.consent.models import Consent
from apps.identity.models import Patient, PatientIdentifier
from apps.identity.services import assign_system_patient_id, create_patient_record
from apps.organizations.models import Facility, Practitioner
from apps.referrals.models import Referral


@pytest.fixture
def phase3a_env(db):
    sender_fac = Facility.objects.create(
        name="Kaliakair UHC", name_bn="কালিয়াকৈর উপজেলা স্বাস্থ্য কমপ্লেক্স", type="upazila_health_complex"
    )
    receiver_fac = Facility.objects.create(
        name="Gazipur District Hospital", name_bn="গাজীপুর জেলা হাসপাতাল", type="district_hospital"
    )
    other_fac = Facility.objects.create(
        name="Savar UHC", name_bn="সাভার উপজেলা স্বাস্থ্য কমপ্লেক্স", type="upazila_health_complex"
    )

    clinician = User.objects.create_user(
        email="doc3a@example.com", password="Password123!", display_name="Dr. Rahim"
    )
    Membership.objects.create(user=clinician, facility=sender_fac, role="clinician")
    Practitioner.objects.create(user=clinician, name="Dr. Rahim", registration_number="BMDC-3A-1")

    chw = User.objects.create_user(
        email="chw3a@example.com", password="Password123!", display_name="Rahima CHW"
    )
    Membership.objects.create(
        user=chw,
        facility=sender_fac,
        role="facility_staff",
        permissions=["referral.create", "consent.record_assisted"],
    )

    unpriv_staff = User.objects.create_user(
        email="desk3a@example.com", password="Password123!", display_name="Front Desk"
    )
    Membership.objects.create(
        user=unpriv_staff, facility=sender_fac, role="facility_staff", permissions=[]
    )

    other_chw = User.objects.create_user(
        email="otherchw3a@example.com", password="Password123!", display_name="Other CHW"
    )
    Membership.objects.create(
        user=other_chw,
        facility=other_fac,
        role="facility_staff",
        permissions=["referral.create", "consent.record_assisted"],
    )

    receiver_doc = User.objects.create_user(
        email="recv3a@example.com", password="Password123!", display_name="Dr. Karim"
    )
    Membership.objects.create(user=receiver_doc, facility=receiver_fac, role="clinician")
    Practitioner.objects.create(user=receiver_doc, name="Dr. Karim", registration_number="BMDC-3A-2")

    platform_admin = User.objects.create_user(
        email="pa3a@example.com", password="Password123!", display_name="Platform Admin"
    )
    PlatformAdmin.objects.create(user=platform_admin)

    return {
        "sender_fac": sender_fac,
        "receiver_fac": receiver_fac,
        "other_fac": other_fac,
        "clinician": clinician,
        "chw": chw,
        "unpriv_staff": unpriv_staff,
        "other_chw": other_chw,
        "receiver_doc": receiver_doc,
        "platform_admin": platform_admin,
    }


def _client_for(user):
    c = APIClient()
    c.force_authenticate(user=user)
    return c


# ==============================================================================
# 1. Patient System ID Tests
# ==============================================================================

@pytest.mark.django_db
def test_patient_system_id_generated_without_phone_email_nid_or_brn(phase3a_env):
    client = _client_for(phase3a_env["chw"])
    resp = client.post(
        "/api/v1/patients/",
        {"given_name": "Amena", "family_name": "Begum", "sex": "female", "estimated_age": 48},
        format="json",
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["phone"] is None
    assert data["has_account"] is False
    assert re.match(r"^MWP-[0-9A-HJKMNP-TV-Z]{8}$", data["system_id"])

    # Searchable via the generated system_id
    search_resp = client.get(f"/api/v1/patients/?q={data['system_id']}")
    assert search_resp.status_code == 200
    assert len(search_resp.json()["results"]) == 1
    assert search_resp.json()["results"][0]["id"] == data["id"]


@pytest.mark.django_db
def test_patient_system_id_unique_and_preserves_existing_identifiers(phase3a_env):
    p1 = create_patient_record(
        phase3a_env["chw"],
        {
            "given_name": "Jalal",
            "sex": "male",
            "identifiers": [{"system": "nid", "value": "19801234567890"}],
        },
    )
    p2 = create_patient_record(phase3a_env["chw"], {"given_name": "Salma", "sex": "female"})

    id1 = p1.identifiers.get(system="system_id").value
    id2 = p2.identifiers.get(system="system_id").value
    assert id1 != id2
    assert p1.identifiers.filter(system="nid", value="19801234567890").exists()


@pytest.mark.django_db
def test_patient_system_id_collision_retry(phase3a_env):
    p1 = create_patient_record(phase3a_env["chw"], {"given_name": "First", "sex": "male"})
    existing_val = p1.identifiers.get(system="system_id").value

    p2 = Patient.objects.create(given_name="Second", sex="female")
    # Generator returns colliding ID twice, then a fresh ID
    seq = iter([existing_val, existing_val, "MWP-9999ZZZZ"])
    assigned = assign_system_patient_id(p2, generator=lambda: next(seq))
    assert assigned.value == "MWP-9999ZZZZ"
    assert PatientIdentifier.objects.filter(system="system_id", value=existing_val).count() == 1


@pytest.mark.django_db
def test_patient_system_id_cannot_be_spoofed_or_enumerated_by_unauthorized_users(phase3a_env):
    chw_client = _client_for(phase3a_env["chw"])
    bad_resp = chw_client.post(
        "/api/v1/patients/",
        {
            "given_name": "Spoof",
            "sex": "male",
            "identifiers": [{"system": "system_id", "value": "MWP-FAKE1234"}],
        },
        format="json",
    )
    assert bad_resp.status_code == 400

    p = create_patient_record(phase3a_env["chw"], {"given_name": "Private", "sex": "female"})
    sys_id = p.identifiers.get(system="system_id").value

    # Platform admin has no default clinical access -> cannot enumerate via system_id
    pa_client = _client_for(phase3a_env["platform_admin"])
    pa_search = pa_client.get(f"/api/v1/patients/?q={sys_id}")
    assert pa_search.status_code == 200
    assert pa_search.json()["results"] == []

    # Another patient cannot enumerate or read this patient
    other_user = User.objects.create_user(email="otherpat@example.com", password="Password123!")
    other_pat = Patient.objects.create(given_name="Other", sex="male")
    PatientAccount.objects.create(user=other_user, patient=other_pat)
    pat_client = _client_for(other_user)
    assert pat_client.get(f"/api/v1/patients/{p.public_id}").status_code == 404


# ==============================================================================
# 2. Standard Referral Idempotency Tests
# ==============================================================================

@pytest.mark.django_db
def test_standard_referral_idempotency_replay_conflict_and_scope(phase3a_env):
    patient = create_patient_record(phase3a_env["chw"], {"given_name": "Rina", "sex": "female"})
    client = _client_for(phase3a_env["chw"])
    key = str(uuid.uuid4())
    payload = {
        "patient_id": str(patient.public_id),
        "receiver_facility_id": str(phase3a_env["receiver_fac"].public_id),
        "urgency": "urgent",
        "reason": "Persistent fever for 7 days",
    }

    # 1. First request -> 201 Created
    r1 = client.post("/api/v1/referrals/", payload, format="json", HTTP_IDEMPOTENCY_KEY=key)
    assert r1.status_code == 201
    ref_id = r1.json()["id"]
    assert r1.json()["idempotency_key"] == key
    assert Referral.objects.count() == 1

    # 2. Exact retry -> 200 OK, same referral ID, no duplicate
    r2 = client.post("/api/v1/referrals/", payload, format="json", HTTP_IDEMPOTENCY_KEY=key)
    assert r2.status_code == 200
    assert r2.json()["id"] == ref_id
    assert Referral.objects.count() == 1

    # 3. Same key + different payload -> 409 Conflict
    modified = {**payload, "reason": "Completely different reason"}
    r3 = client.post("/api/v1/referrals/", modified, format="json", HTTP_IDEMPOTENCY_KEY=key)
    assert r3.status_code == 409
    assert Referral.objects.count() == 1

    # 4. Different key -> creates a distinct referral
    r4 = client.post("/api/v1/referrals/", payload, format="json", HTTP_IDEMPOTENCY_KEY=str(uuid.uuid4()))
    assert r4.status_code == 201
    assert r4.json()["id"] != ref_id
    assert Referral.objects.count() == 2

    # 5. Cross-facility scope isolation: another facility using the same key cannot steal Facility A's referral
    other_client = _client_for(phase3a_env["other_chw"])
    # The other facility's own new patient (a facility cannot refer a patient already under another facility's care: that
    # is a 404, MASTERPLAN §6.2 and SECURITY §4.3), sent with the same key: keys are scoped per facility.
    other_patient = Patient.objects.create(given_name="Other", family_name="Facility", sex="female", phone=None)
    r5 = other_client.post("/api/v1/referrals/", {**payload, "patient_id": str(other_patient.public_id)}, format="json", HTTP_IDEMPOTENCY_KEY=key)
    assert r5.status_code == 201
    assert r5.json()["id"] != ref_id
    # And it cannot reach Facility A's patient at all.
    assert other_client.post("/api/v1/referrals/", payload, format="json", HTTP_IDEMPOTENCY_KEY=str(uuid.uuid4())).status_code == 404

    # 6. Unauthorized staff cannot probe idempotency keys
    unpriv_client = _client_for(phase3a_env["unpriv_staff"])
    r6 = unpriv_client.post("/api/v1/referrals/", payload, format="json", HTTP_IDEMPOTENCY_KEY=key)
    assert r6.status_code == 403


@pytest.mark.django_db
def test_standard_referral_idempotency_concurrent_race_handling(phase3a_env):
    patient = create_patient_record(phase3a_env["chw"], {"given_name": "Race", "sex": "male"})
    key = uuid.uuid4()
    payload = {
        "patient_id": str(patient.public_id),
        "receiver_facility_id": str(phase3a_env["receiver_fac"].public_id),
        "urgency": "routine",
        "reason": "Concurrent retry test",
    }
    client = _client_for(phase3a_env["chw"])
    first = client.post("/api/v1/referrals/", payload, format="json", HTTP_IDEMPOTENCY_KEY=str(key))
    assert first.status_code == 201

    # Simulate a race where the pre-check missed the row and Referral.objects.create hits IntegrityError
    real_filter = Referral.objects.filter
    call_count = {"n": 0}

    def fake_create(**kwargs):
        raise IntegrityError("UNIQUE constraint failed: uniq_referral_facility_idempotency_key")

    with mock.patch.object(Referral.objects, "create", side_effect=fake_create):
        # Bypass pre-check on first lookup only so create() is entered and triggers IntegrityError recovery
        orig_select = Referral.objects.select_related

        def select_side_effect(*args, **kwargs):
            qs = orig_select(*args, **kwargs)
            call_count["n"] += 1
            if call_count["n"] == 1:
                return Referral.objects.none()
            return qs

        with mock.patch.object(Referral.objects, "select_related", side_effect=select_side_effect):
            raced = client.post("/api/v1/referrals/", payload, format="json", HTTP_IDEMPOTENCY_KEY=str(key))
            assert raced.status_code == 200
            assert raced.json()["id"] == first.json()["id"]


# ==============================================================================
# 3. CHW Permissions & Boundary Tests
# ==============================================================================

@pytest.mark.django_db
def test_chw_can_create_edit_and_request_consent_but_cannot_approve_or_send(phase3a_env):
    patient = create_patient_record(phase3a_env["chw"], {"given_name": "Hasina", "sex": "female"})
    chw_client = _client_for(phase3a_env["chw"])
    clinician_client = _client_for(phase3a_env["clinician"])

    # CHW creates draft
    create_resp = chw_client.post(
        "/api/v1/referrals/",
        {
            "patient_id": str(patient.public_id),
            "receiver_facility_id": str(phase3a_env["receiver_fac"].public_id),
            "urgency": "routine",
            "reason": "Anemia follow-up",
        },
        format="json",
    )
    assert create_resp.status_code == 201
    ref_id = create_resp.json()["id"]
    assert create_resp.json()["initiated_by_id"] == str(phase3a_env["chw"].public_id)

    # CHW can edit own facility draft
    patch_resp = chw_client.patch(
        f"/api/v1/referrals/{ref_id}",
        {"reason": "Severe anemia evaluation"},
        format="json",
    )
    assert patch_resp.status_code == 200

    # Other facility CHW cannot edit this draft. It is outside their scope, so it answers 404 and does not reveal that the
    # referral exists (MASTERPLAN §6.2, INV-9). A user who can see it but may not act gets 403.
    other_client = _client_for(phase3a_env["other_chw"])
    assert other_client.patch(f"/api/v1/referrals/{ref_id}", {"reason": "Hack"}, format="json").status_code == 404

    # CHW can request consent
    req_resp = chw_client.post(f"/api/v1/referrals/{ref_id}/actions/request_consent", {}, format="json")
    assert req_resp.status_code == 200
    assert req_resp.json()["state"] == "AWAITING_PATIENT_CONSENT"
    consent_req_id = req_resp.json()["consent_request_id"]

    # CHW records assisted verbal consent -> moves ONLY to READY_FOR_SENDER_APPROVAL
    consent_resp = chw_client.post(
        f"/api/v1/consents/requests/{consent_req_id}/record-assisted",
        {
            "method": "assisted_verbal",
            "patient_confirmed_in_person": True,
            "witness_name": "Fatema Begum (Sister)",
            "notes": "Explained referral sharing to Gazipur DH in Bangla; patient verbally consented.",
        },
        format="json",
    )
    assert consent_resp.status_code == 201
    assert consent_resp.json()["method"] == "assisted_verbal"

    # CHW CANNOT approve or send the referral (INV-4)
    assert chw_client.post(f"/api/v1/referrals/{ref_id}/actions/approve", {}, format="json").status_code == 403

    # Clinician reviews, approves, and sends
    approve_resp = clinician_client.post(f"/api/v1/referrals/{ref_id}/actions/approve", {}, format="json")
    assert approve_resp.status_code == 200
    assert approve_resp.json()["state"] == "APPROVED_BY_SENDER"

    send_resp = clinician_client.post(f"/api/v1/referrals/{ref_id}/actions/send", {}, format="json")
    assert send_resp.status_code in (200, 202)


# ==============================================================================
# 4. Assisted In-Person Consent Tests
# ==============================================================================

@pytest.mark.django_db
def test_assisted_paper_consent_audit_and_revocation(phase3a_env):
    patient = create_patient_record(phase3a_env["chw"], {"given_name": "Rafiq", "sex": "male"})
    chw_client = _client_for(phase3a_env["chw"])

    ref_resp = chw_client.post(
        "/api/v1/referrals/",
        {
            "patient_id": str(patient.public_id),
            "receiver_facility_id": str(phase3a_env["receiver_fac"].public_id),
            "urgency": "routine",
            "reason": "Cataract surgery referral",
        },
        format="json",
    )
    ref_id = ref_resp.json()["id"]
    req_resp = chw_client.post(f"/api/v1/referrals/{ref_id}/actions/request_consent", {}, format="json")
    consent_req_id = req_resp.json()["consent_request_id"]

    # Record assisted_paper consent
    c_resp = chw_client.post(
        f"/api/v1/consents/requests/{consent_req_id}/record-assisted",
        {
            "method": "assisted_paper",
            "patient_confirmed_in_person": True,
            "witness_name": "Ward Member Karim",
            "notes": "Signed paper consent form #442 on file at Kaliakair UHC.",
            "consent_language": "bn",
        },
        format="json",
    )
    assert c_resp.status_code == 201
    c_data = c_resp.json()
    assert c_data["method"] == "assisted_paper"
    assert c_data["verification_context"]["recorded_by_user_id"] == str(phase3a_env["chw"].public_id)
    assert c_data["verification_context"]["witness_name"] == "Ward Member Karim"

    # Audit event created
    assert AuditEvent.objects.filter(
        action="assisted_consent_granted",
        object_type="consent",
        object_id=c_data["id"],
        actor_user=phase3a_env["chw"],
    ).exists()

    # Revoking assisted consent returns referral from READY_FOR_SENDER_APPROVAL back to DRAFT
    rev_resp = chw_client.post(f"/api/v1/consents/{c_data['id']}/revoke", {}, format="json")
    assert rev_resp.status_code == 200
    assert rev_resp.json()["state"] == "REVOKED"
    ref_obj = Referral.objects.get(public_id=ref_id)
    assert ref_obj.state == "DRAFT"


@pytest.mark.django_db
def test_assisted_consent_rejects_invalid_methods_unauthorized_users_and_account_holders(phase3a_env):
    # 1. Account-less patient: test invalid method, missing confirmation, and unauthorized user
    no_acct_patient = create_patient_record(phase3a_env["chw"], {"given_name": "NoAcct", "sex": "female"})
    chw_client = _client_for(phase3a_env["chw"])
    ref_resp = chw_client.post(
        "/api/v1/referrals/",
        {
            "patient_id": str(no_acct_patient.public_id),
            "receiver_facility_id": str(phase3a_env["receiver_fac"].public_id),
            "reason": "Checkup",
        },
        format="json",
    )
    req_id = chw_client.post(
        f"/api/v1/referrals/{ref_resp.json()['id']}/actions/request_consent", {}, format="json"
    ).json()["consent_request_id"]

    # Invalid method
    assert chw_client.post(
        f"/api/v1/consents/requests/{req_id}/record-assisted",
        {"method": "sms_reply", "patient_confirmed_in_person": True, "notes": "Bad method"},
        format="json",
    ).status_code == 400

    # Missing explicit in-person confirmation
    assert chw_client.post(
        f"/api/v1/consents/requests/{req_id}/record-assisted",
        {"method": "assisted_verbal", "patient_confirmed_in_person": False, "notes": "Not confirmed"},
        format="json",
    ).status_code == 400

    # Unprivileged staff rejected
    unpriv_client = _client_for(phase3a_env["unpriv_staff"])
    assert unpriv_client.post(
        f"/api/v1/consents/requests/{req_id}/record-assisted",
        {"method": "assisted_verbal", "patient_confirmed_in_person": True, "notes": "Trying anyway"},
        format="json",
    ).status_code == 403

    # Other facility CHW rejected
    other_client = _client_for(phase3a_env["other_chw"])
    assert other_client.post(
        f"/api/v1/consents/requests/{req_id}/record-assisted",
        {"method": "assisted_verbal", "patient_confirmed_in_person": True, "notes": "Wrong facility"},
        format="json",
    ).status_code == 403

    # 2. Patient WITH a PatientAccount cannot be bypassed via assisted consent
    acct_user = User.objects.create_user(email="hasacct@example.com", password="Password123!")
    acct_patient = create_patient_record(phase3a_env["chw"], {"given_name": "HasAcct", "sex": "male"})
    PatientAccount.objects.create(user=acct_user, patient=acct_patient)

    ref2_id = chw_client.post(
        "/api/v1/referrals/",
        {
            "patient_id": str(acct_patient.public_id),
            "receiver_facility_id": str(phase3a_env["receiver_fac"].public_id),
            "reason": "Account holder test",
        },
        format="json",
    ).json()["id"]
    req2_id = chw_client.post(
        f"/api/v1/referrals/{ref2_id}/actions/request_consent", {}, format="json"
    ).json()["consent_request_id"]

    bypass_resp = chw_client.post(
        f"/api/v1/consents/requests/{req2_id}/record-assisted",
        {"method": "assisted_verbal", "patient_confirmed_in_person": True, "notes": "Bypass attempt"},
        format="json",
    )
    assert bypass_resp.status_code == 409
    assert not Consent.objects.filter(patient=acct_patient).exists()
