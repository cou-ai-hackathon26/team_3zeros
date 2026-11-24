"""Referral creation, editing and AI draft rules (D-30)."""
import uuid
from datetime import timedelta

import pytest
from django.utils import timezone

from apps.accounts.models import Membership, User
from apps.ai.referral_context import build_referral_context
from apps.common.exceptions import NotFoundError, PermissionDeniedError, StaleVersionError, TransitionNotAllowedError, ValidationError
from apps.identity.models import Patient
from apps.organizations.models import Facility, Practitioner
from apps.records.models import Encounter
from apps.referrals.models import Referral
from apps.referrals.services import create_emergency_referral, create_referral_draft, update_referral_draft

from tests.test_referral_lifecycle import world  # noqa: F401


def _data(w, **kw):
    fac_r = Referral.objects.get(pk=w["referral"].pk).receiver_facility
    return {"patient_id": w["patient"].public_id, "receiver_facility_id": fac_r.public_id, "urgency": "routine", "reason": "Cardiac consultation", **kw}


@pytest.mark.django_db
def test_only_a_sending_clinician_can_edit_a_draft(world):  # noqa: F811
    w = world
    for who in (w["receiver"], w["outsider"], w["patient_user"]):
        with pytest.raises((PermissionDeniedError, NotFoundError)):
            update_referral_draft(who, w["referral"].public_id, {"reason": "changed"})
    assert update_referral_draft(w["sender"], w["referral"].public_id, {"reason": "ok"}).reason == "ok"


@pytest.mark.django_db
def test_editing_honours_if_match(world):  # noqa: F811
    w = world
    with pytest.raises(StaleVersionError):
        update_referral_draft(w["sender"], w["referral"].public_id, {"reason": "x"}, if_match=w["referral"].version + 5)


@pytest.mark.django_db
def test_only_the_draft_state_is_editable(world):  # noqa: F811
    from apps.referrals.services import execute_referral_transition
    w = world
    execute_referral_transition(w["sender"], w["referral"].public_id, "request_consent")
    with pytest.raises(TransitionNotAllowedError):
        update_referral_draft(w["sender"], w["referral"].public_id, {"reason": "x"})


@pytest.mark.django_db
def test_creating_needs_a_care_relationship_a_practitioner_and_a_different_facility(world):  # noqa: F811
    w = world
    # A patient already under another facility's care is not visible to this clinician (404). A brand-new patient with no
    # care anywhere is allowed: registering them is what starts the relationship (CHW intake).
    other_fac = Facility.objects.create(name="Elsewhere Clinic", type="upazila_health_complex")
    elsewhere = Patient.objects.create(given_name="Under", family_name="OtherCare")
    Encounter.objects.create(patient=elsewhere, facility=other_fac, period_start=timezone.now())
    with pytest.raises(NotFoundError):
        create_referral_draft(w["sender"], {**_data(w), "patient_id": elsewhere.public_id})
    brand_new = Patient.objects.create(given_name="Brand", family_name="New")
    assert create_referral_draft(w["sender"], {**_data(w), "patient_id": brand_new.public_id}).state == "DRAFT"

    fac_s = Membership.objects.get(user=w["sender"]).facility
    with pytest.raises(ValidationError):
        create_referral_draft(w["sender"], {**_data(w), "receiver_facility_id": fac_s.public_id})

    no_profile = User.objects.create_user(email="np@example.com", password="x")
    Membership.objects.create(user=no_profile, facility=fac_s, role="clinician")
    with pytest.raises(PermissionDeniedError):
        create_referral_draft(no_profile, _data(w))


@pytest.mark.django_db
def test_an_expired_membership_cannot_create(world):  # noqa: F811
    w = world
    Membership.objects.filter(user=w["sender"]).update(active_to=timezone.now() - timedelta(minutes=1))
    with pytest.raises(PermissionDeniedError):
        create_referral_draft(w["sender"], _data(w))


@pytest.mark.django_db
def test_the_encounter_is_linked_and_must_belong_to_the_patient_here(world):  # noqa: F811
    w = world
    enc = Encounter.objects.get(patient=w["patient"])
    r = create_referral_draft(w["sender"], _data(w, encounter_id=enc.public_id))
    assert r.encounter_id == enc.pk
    other = Encounter.objects.create(patient=Patient.objects.create(given_name="O", family_name="P"), facility=enc.facility, period_start=timezone.now())
    with pytest.raises(ValidationError):
        create_referral_draft(w["sender"], _data(w, encounter_id=other.public_id))


@pytest.mark.django_db
def test_no_practitioner_is_invented(world):  # noqa: F811
    before = Practitioner.objects.count()
    create_referral_draft(world["sender"], _data(world))
    assert Practitioner.objects.count() == before


def _emergency(w, key=None):
    fac_r = Referral.objects.get(pk=w["referral"].pk).receiver_facility
    return {"idempotency_key": key or uuid.uuid4(), "facility_id": fac_r.public_id, "reason": "Collapse", "urgency": "emergency", "created_at_device": timezone.now(),
            "vitals": {}, "treatment_given": ""}


@pytest.mark.django_db
def test_emergency_referral_permissions_follow_the_matrix(world):  # noqa: F811
    w = world
    fac_s = Membership.objects.get(user=w["sender"]).facility
    for who in (w["outsider"], w["patient_user"]):
        with pytest.raises(PermissionDeniedError):
            create_emergency_referral(who, _emergency(w))

    staff = User.objects.create_user(email="desk@example.com", password="x")
    Membership.objects.create(user=staff, facility=fac_s, role="facility_staff", permissions=[])
    with pytest.raises(PermissionDeniedError):
        create_emergency_referral(staff, _emergency(w))
    Membership.objects.filter(user=staff).update(permissions=["emergency.create"])
    r = create_emergency_referral(staff, _emergency(w))
    assert r.state == "SENT" and r.sender_practitioner is None  # staff have no Practitioner; none is invented


@pytest.mark.django_db
def test_the_ai_draft_context_has_no_patient_name_and_cites_sources(world):  # noqa: F811
    w = world
    lines, refs = build_referral_context(Referral.objects.get(pk=w["referral"].pk))
    text = "\n".join(lines)
    assert "Anisur" not in text and "Rahman" not in text
    assert any(r.startswith("encounter:") for r in refs)


@pytest.mark.django_db
def test_a_confirmed_triage_report_is_cited_as_a_source(world):  # noqa: F811
    from apps.triage.models import TriageSession, TriageSummary
    w = world
    s = TriageSession.objects.create(patient=w["patient"], language="en", state="CONFIRMED_BY_PATIENT", ended_at=timezone.now(), triage_disclosure_version="v1.0", triage_disclosure_accepted_at=timezone.now())
    TriageSummary.objects.create(session=s, structured_fields={"report": {"conversation_summary": {"overview": "Three days of fever."}, "health_assessment": {"primary_concern": "Fever", "reported_symptoms": ["fever"], "triage_level": "MODERATE"}}})
    lines, refs = build_referral_context(Referral.objects.get(pk=w["referral"].pk))
    assert f"triage:{s.public_id}" in refs
    assert "not a diagnosis" in "\n".join(lines)


def test_an_unsupported_provider_fails_instead_of_returning_the_mock(settings):
    from apps.ai.adapters import ChatLLMAdapter, MockLLMAdapter, get_llm_adapter
    settings.LLM_PROVIDER = "cerebras"
    assert isinstance(get_llm_adapter(), ChatLLMAdapter)
    settings.LLM_PROVIDER = "typo"
    with pytest.raises(ValidationError):
        get_llm_adapter()
    settings.LLM_PROVIDER = "mock"
    assert isinstance(get_llm_adapter(), MockLLMAdapter)
