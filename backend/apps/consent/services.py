from django.db import transaction
from django.utils import timezone
from .models import ConsentRequest, Consent
from apps.accounts.selectors import active_memberships
from apps.audit.services import record_audit_event
from apps.common.exceptions import (
    NotFoundError,
    TransitionNotAllowedError,
    PermissionDeniedError,
    ValidationError,
)

ASSISTED_CONSENT_METHODS = ("assisted_verbal", "assisted_paper")


def _require_patient(user, patient, message):
    """Only the patient who owns the record may decide on consent (INV-10)."""
    account = getattr(user, "patient_account", None) if user and getattr(user, "is_authenticated", False) else None
    if account is None or account.patient_id != patient.id:
        raise PermissionDeniedError(message)


def _require_assisted_consent_staff(user, facility):
    """
    Only an active clinician or authorized facility_staff (`consent.record_assisted` or `referral.create`)
    at the sending facility may document a patient's in-person assisted consent.
    """
    if not user or not getattr(user, "is_authenticated", False):
        raise PermissionDeniedError("Authentication required to record assisted consent.")
    if hasattr(user, "patient_account"):
        raise PermissionDeniedError("Patients must use the direct consent flow.")
    memberships = active_memberships(user)
    if facility is not None:
        memberships = memberships.filter(facility=facility)
    for m in memberships.select_related("facility"):
        if m.role == "clinician":
            return m
        if m.role == "facility_staff" and (
            "consent.record_assisted" in (m.permissions or [])
            or "referral.create" in (m.permissions or [])
        ):
            return m
    raise PermissionDeniedError(
        "Not authorized to record assisted in-person consent for this facility."
    )


def create_consent_request_for_referral(referral, request_id=""):
    """Create the patient's pending consent request for the referral's current content."""
    with transaction.atomic():
        req = ConsentRequest.objects.create(
            patient=referral.patient,
            recipient_facility=referral.receiver_facility,
            recipient_practitioner=referral.receiver_practitioner,
            purpose="referral_treatment",
            categories=["demographics", "observations", "conditions", "reports"],
            content_hash=referral.content_hash,
        )
        type(referral).objects.filter(pk=referral.pk).update(consent_request=req)
        referral.consent_request = req
        return req


def supersede_pending_consent_request(referral):
    """Referral content changed or was reopened: the pending request no longer matches it."""
    req = referral.consent_request
    if req and req.state == "PENDING":
        req.state = "SUPERSEDED"
        req.save()


def grant_consent_request(user, request_public_id, method="web_app", request_id=""):
    req = ConsentRequest.objects.filter(public_id=request_public_id).first()
    if not req:
        raise NotFoundError("Consent request not found.")

    _require_patient(user, req.patient, "Only the patient can grant consent.")

    if req.state != "PENDING":
        raise TransitionNotAllowedError(f"Cannot grant consent request in state '{req.state}'.")

    with transaction.atomic():
        req.state = "GRANTED"
        req.save()

        consent = Consent.objects.create(
            request=req,
            patient=req.patient,
            recipient_facility=req.recipient_facility,
            recipient_practitioner=req.recipient_practitioner,
            purpose=req.purpose,
            categories=req.categories,
            content_hash=req.content_hash,
            method=method,
            state="ACTIVE",
        )

        # Notify / trigger referral transition if linked
        if hasattr(req, "referral"):
            referral = req.referral
            if referral.state == "AWAITING_PATIENT_CONSENT":
                from apps.referrals.services import execute_referral_transition
                type(referral).objects.filter(pk=referral.pk).update(consent=consent)
                execute_referral_transition(user, referral.public_id, "consent_granted", request_id=request_id, as_system=True)

        record_audit_event(
            action="transition",
            object_type="consent",
            object_id=str(consent.public_id),
            actor_user=user,
            patient_id=str(req.patient.public_id),
            outcome="success",
            reason="Patient granted consent",
            request_id=request_id,
        )
        return consent


def refuse_consent_request(user, request_public_id, request_id=""):
    req = ConsentRequest.objects.filter(public_id=request_public_id).first()
    if not req:
        raise NotFoundError("Consent request not found.")

    _require_patient(user, req.patient, "Only the patient can refuse consent.")

    if req.state != "PENDING":
        raise TransitionNotAllowedError(f"Cannot refuse consent request in state '{req.state}'.")

    with transaction.atomic():
        req.state = "REFUSED"
        req.save()

        if hasattr(req, "referral"):
            referral = req.referral
            if referral.state == "AWAITING_PATIENT_CONSENT":
                from apps.referrals.services import execute_referral_transition
                execute_referral_transition(user, referral.public_id, "consent_refused", request_id=request_id, as_system=True)

        record_audit_event(
            action="transition",
            object_type="consent_request",
            object_id=str(req.public_id),
            actor_user=user,
            patient_id=str(req.patient.public_id),
            outcome="success",
            reason="Patient refused consent",
            request_id=request_id,
        )
        return req


def record_assisted_consent(
    user,
    request_public_id,
    method: str,
    patient_confirmed_in_person: bool,
    witness_name: str = "",
    notes: str = "",
    consent_language: str = "bn",
    request_id: str = "",
):
    """
    Document witnessed in-person patient consent (`assisted_verbal` or `assisted_paper`)
    for a patient who does not have a platform PatientAccount (Challenge 1, INV-10).

    - Does NOT require the patient to log in.
    - Rejected if the patient has an active PatientAccount (they must grant directly).
    - Strictly separate from clinician approval: advances referral only to READY_FOR_SENDER_APPROVAL.
    - Reuses Consent.method and Consent.verification_context with full audit trail.
    """
    if method not in ASSISTED_CONSENT_METHODS:
        raise ValidationError(
            f"Unsupported assisted consent method '{method}'. Must be one of: {', '.join(ASSISTED_CONSENT_METHODS)}."
        )

    if patient_confirmed_in_person is not True:
        raise ValidationError("Explicit in-person patient confirmation is required to record assisted consent.")

    cleaned_notes = (notes or "").strip()
    cleaned_witness = (witness_name or "").strip()
    if not cleaned_notes and not cleaned_witness:
        raise ValidationError(
            "Provide either a witness name or confirmation notes explaining how in-person consent was obtained."
        )

    req = (
        ConsentRequest.objects.select_related("patient", "recipient_facility", "recipient_practitioner")
        .filter(public_id=request_public_id)
        .first()
    )
    if not req:
        raise NotFoundError("Consent request not found.")

    # Scope authorization to the linked referral's sending facility (when linked)
    linked_referral = getattr(req, "referral", None)
    sender_facility = linked_referral.sender_facility if linked_referral else None
    membership = _require_assisted_consent_staff(user, sender_facility)

    # Do not allow staff to bypass direct patient consent when the patient has a platform account
    if hasattr(req.patient, "account") and req.patient.account is not None:
        raise TransitionNotAllowedError(
            "Patient has a platform account and must grant consent directly."
        )

    if req.state != "PENDING":
        raise TransitionNotAllowedError(f"Cannot record assisted consent for request in state '{req.state}'.")

    recorded_at = timezone.now()
    verification_context = {
        "recorded_by_user_id": str(user.public_id),
        "recorded_by_name": user.display_name or user.email or str(user.public_id),
        "recorded_by_role": membership.role,
        "facility_id": str(membership.facility.public_id),
        "facility_name": membership.facility.name,
        "witness_name": cleaned_witness,
        "patient_confirmed_in_person": True,
        "consent_language": consent_language or "bn",
        "notes": cleaned_notes,
        "recorded_at": recorded_at.isoformat(),
    }

    with transaction.atomic():
        req.state = "GRANTED"
        req.save()

        consent = Consent.objects.create(
            request=req,
            patient=req.patient,
            recipient_facility=req.recipient_facility,
            recipient_practitioner=req.recipient_practitioner,
            purpose=req.purpose,
            categories=req.categories,
            content_hash=req.content_hash,
            method=method,
            verification_context=verification_context,
            state="ACTIVE",
        )

        # Advance linked referral ONLY to READY_FOR_SENDER_APPROVAL (never approves or sends)
        if linked_referral and linked_referral.state == "AWAITING_PATIENT_CONSENT":
            from apps.referrals.services import execute_referral_transition
            type(linked_referral).objects.filter(pk=linked_referral.pk).update(consent=consent)
            execute_referral_transition(
                user,
                linked_referral.public_id,
                "consent_granted",
                request_id=request_id,
                as_system=True,
            )

        record_audit_event(
            action="assisted_consent_granted",
            object_type="consent",
            object_id=str(consent.public_id),
            actor_user=user,
            patient_id=str(req.patient.public_id),
            outcome="success",
            reason=f"Assisted consent ({method}) recorded by {verification_context['recorded_by_name']}. Witness: {cleaned_witness or 'none'}.",
            request_id=request_id,
        )
        return consent


def revoke_consent(user, consent_public_id, request_id=""):
    consent = Consent.objects.select_related("patient", "request").filter(public_id=consent_public_id).first()
    if not consent:
        raise NotFoundError("Consent not found.")

    # Direct patient revocation (always allowed for patient's own record)
    # OR authorized sending-facility staff revocation for assisted consents of account-less patients
    is_assisted_accountless = (
        consent.method in ASSISTED_CONSENT_METHODS
        and not (hasattr(consent.patient, "account") and consent.patient.account is not None)
    )
    if is_assisted_accountless and not hasattr(user, "patient_account"):
        linked_referral = getattr(consent.request, "referral", None) if consent.request else None
        sender_facility = linked_referral.sender_facility if linked_referral else None
        _require_assisted_consent_staff(user, sender_facility)
        audit_reason = "Staff recorded patient's in-person withdrawal of assisted consent"
    else:
        _require_patient(user, consent.patient, "Only the patient can revoke consent.")
        audit_reason = "Patient revoked consent"

    if consent.state != "ACTIVE":
        raise TransitionNotAllowedError(f"Cannot revoke consent in state '{consent.state}'.")

    with transaction.atomic():
        consent.state = "REVOKED"
        consent.revoked_at = timezone.now()
        consent.save()

        # If referral linked to this consent request is in READY_FOR_SENDER_APPROVAL or APPROVED_BY_SENDER,
        # it drops back to DRAFT per MASTERPLAN §5.2
        if consent.request and hasattr(consent.request, "referral"):
            referral = consent.request.referral
            if referral.state in ("READY_FOR_SENDER_APPROVAL", "APPROVED_BY_SENDER"):
                from apps.referrals.services import execute_referral_transition
                execute_referral_transition(user, referral.public_id, "consent_revoked", request_id=request_id, as_system=True)

        record_audit_event(
            action="transition",
            object_type="consent",
            object_id=str(consent.public_id),
            actor_user=user,
            patient_id=str(consent.patient.public_id),
            outcome="success",
            reason=audit_reason,
            request_id=request_id,
        )
        return consent

