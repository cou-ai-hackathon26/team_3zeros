"""Referral lifecycle with real consent and FHIR-gated completion (INV-10, INV-12)."""
import pytest
from django.utils import timezone
from apps.accounts.models import User, Membership, PatientAccount
from apps.common.exceptions import PermissionDeniedError, SyncPendingError, TransitionNotAllowedError, FhirUnavailableError
from apps.consent.services import grant_consent_request, refuse_consent_request, revoke_consent
from apps.fhir.client import FhirClient
from apps.fhir.sync import complete_fhir_transition
from apps.identity.models import Patient
from apps.organizations.models import Facility, Practitioner
from apps.records.models import Encounter
from apps.referrals.models import Referral
from apps.referrals.services import create_referral_draft, execute_referral_transition


@pytest.fixture
def world(db):
    sender = User.objects.create_user(email="s@example.com", password="x")
    receiver = User.objects.create_user(email="r@example.com", password="x")
    outsider = User.objects.create_user(email="o@example.com", password="x")
    patient_user = User.objects.create_user(phone="+8801811111111", password="x")
    fac_s = Facility.objects.create(name="Upazila Health Complex", type="upazila_health_complex")
    fac_r = Facility.objects.create(name="District Hospital", type="district_hospital")
    Membership.objects.create(user=sender, facility=fac_s, role="clinician")
    Membership.objects.create(user=receiver, facility=fac_r, role="clinician")
    Practitioner.objects.create(user=sender, name="Dr Sender", registration_number="BMDC-S-1")
    patient = Patient.objects.create(given_name="Anisur", family_name="Rahman")
    PatientAccount.objects.create(user=patient_user, patient=patient)
    # Care relationship (SECURITY §4.3): the patient was seen at the sending facility.
    Encounter.objects.create(patient=patient, facility=fac_s, period_start=timezone.now())
    draft = create_referral_draft(sender, {
        "patient_id": patient.public_id,
        "receiver_facility_id": fac_r.public_id,
        "urgency": "routine",
        "reason": "Cardiac consultation",
        "summary": {"complaints": "chest discomfort"},
    })
    return dict(sender=sender, receiver=receiver, outsider=outsider, patient_user=patient_user,
                patient=patient, referral=draft)


def act(user, referral, action, **kw):
    return execute_referral_transition(user, referral.public_id, action, **kw)[0]


def to_ready(w):
    r = act(w["sender"], w["referral"], "request_consent")
    req = r.consent_request
    assert req is not None and req.state == "PENDING"
    grant_consent_request(w["patient_user"], req.public_id)
    r.refresh_from_db()
    return r


@pytest.mark.django_db
def test_full_lifecycle_with_patient_consent(world):
    w = world
    r = to_ready(w)
    assert r.state == "READY_FOR_SENDER_APPROVAL"
    assert r.consent.state == "ACTIVE"

    r = act(w["sender"], r, "approve")
    r = act(w["sender"], r, "send")
    assert r.state == "SENT" and r.pending_action is None and r.fhir_sync_status == "SYNCED"

    r = act(w["receiver"], r, "acknowledge")
    r = act(w["receiver"], r, "start")
    r = act(w["receiver"], r, "record_outcome", payload={"outcome": {"summary": "stent placed"}})
    assert r.state == "OUTCOME_RETURNED"  # return_outcome ran as the system
    r = act(w["sender"], r, "close")
    assert r.state == "CLOSED"


@pytest.mark.django_db
def test_users_cannot_run_system_only_actions(world):
    w = world
    r = act(w["sender"], w["referral"], "request_consent")
    # The sender must not be able to grant the patient's consent (INV-10).
    for user in (w["sender"], w["receiver"], w["outsider"], w["patient_user"]):
        with pytest.raises(PermissionDeniedError):
            act(user, r, "consent_granted")
    r.refresh_from_db()
    assert r.state == "AWAITING_PATIENT_CONSENT"


@pytest.mark.django_db
def test_only_the_patient_can_decide_consent(world):
    w = world
    r = act(w["sender"], w["referral"], "request_consent")
    for user in (w["sender"], w["outsider"]):
        with pytest.raises(PermissionDeniedError):
            grant_consent_request(user, r.consent_request.public_id)
    other = User.objects.create_user(phone="+8801822222222", password="x")
    PatientAccount.objects.create(user=other, patient=Patient.objects.create(given_name="Other", family_name="P"))
    with pytest.raises(PermissionDeniedError):
        grant_consent_request(other, r.consent_request.public_id)


@pytest.mark.django_db
def test_approve_requires_active_matching_consent(world):
    w = world
    r = to_ready(w)
    Referral.objects.filter(pk=r.pk).update(content_hash="changed")  # content no longer matches consent
    with pytest.raises(TransitionNotAllowedError):
        act(w["sender"], r, "approve")


@pytest.mark.django_db
def test_refusal_and_revocation_return_referral_to_draft(world):
    w = world
    r = act(w["sender"], w["referral"], "request_consent")
    refuse_consent_request(w["patient_user"], r.consent_request.public_id)
    r.refresh_from_db()
    assert r.state == "DRAFT"

    r = to_ready(w)
    revoke_consent(w["patient_user"], r.consent.public_id)
    r.refresh_from_db()
    assert r.state == "DRAFT"


@pytest.mark.django_db
def test_reopen_supersedes_pending_consent_request(world):
    w = world
    r = act(w["sender"], w["referral"], "request_consent")
    req = r.consent_request
    r = act(w["sender"], r, "reopen_draft")
    req.refresh_from_db()
    assert r.state == "DRAFT" and req.state == "SUPERSEDED"


@pytest.mark.django_db
def test_send_stays_pending_until_fhir_write_succeeds(world, settings, monkeypatch):
    w = world
    settings.FHIR_SYNC_MODE = "live"
    r = to_ready(w)
    r = act(w["sender"], r, "approve")

    def down(self, bundle):
        raise FhirUnavailableError("down")

    monkeypatch.setattr(FhirClient, "execute_transaction_bundle", down)
    r = act(w["sender"], r, "send")
    # INV-12: not SENT, so the receiver cannot see it, and nothing else may run.
    assert r.state == "APPROVED_BY_SENDER" and r.pending_action == "send"
    assert r.fhir_sync_status == "PENDING"
    with pytest.raises(SyncPendingError):
        act(w["sender"], r, "cancel")

    sent = []
    monkeypatch.setattr(FhirClient, "execute_transaction_bundle", lambda self, bundle: sent.append(bundle) or {})
    assert complete_fhir_transition(r) is True
    r.refresh_from_db()
    assert r.state == "SENT" and r.pending_action is None
    types = [e["resource"]["resourceType"] for e in sent[0]["entry"]]
    assert types == ["ServiceRequest", "Task"]
    assert all("ifNoneExist" in e["request"] for e in sent[0]["entry"])  # retry-safe


@pytest.mark.django_db
def test_retry_sync_reapplies_the_failed_action(world):
    w = world
    r = to_ready(w)
    r = act(w["sender"], r, "approve")
    Referral.objects.filter(pk=r.pk).update(state="APPROVED_BY_SENDER")
    r = act(w["sender"], r, "send")
    assert r.state == "SENT"
    # Simulate: the worker exhausted retries of a `send`.
    r.TRANSITIONS = __import__("apps.referrals.transitions", fromlist=["x"]).REFERRAL_TRANSITIONS
    Referral.objects.filter(pk=r.pk).update(state="FAILED_TO_SYNC")
    r.refresh_from_db()
    r = act(w["sender"], r, "retry_sync")
    assert r.state == "SENT"
