from django.db import transaction
from django.utils import timezone
from .models import ConsentRequest, Consent
from apps.audit.services import record_audit_event
from apps.common.exceptions import NotFoundError, TransitionNotAllowedError, PermissionDeniedError

def grant_consent_request(user, request_public_id, method="web_app", request_id=""):
    req = ConsentRequest.objects.filter(public_id=request_public_id).first()
    if not req:
        raise NotFoundError("Consent request not found.")

    if hasattr(user, "patient_account") and user.patient_account.patient != req.patient:
        raise PermissionDeniedError("Only the patient can grant consent.")

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
                execute_referral_transition(user, referral.public_id, "consent_granted", request_id=request_id)

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

    if hasattr(user, "patient_account") and user.patient_account.patient != req.patient:
        raise PermissionDeniedError("Only the patient can refuse consent.")

    if req.state != "PENDING":
        raise TransitionNotAllowedError(f"Cannot refuse consent request in state '{req.state}'.")

    with transaction.atomic():
        req.state = "REFUSED"
        req.save()

        if hasattr(req, "referral"):
            referral = req.referral
            if referral.state == "AWAITING_PATIENT_CONSENT":
                from apps.referrals.services import execute_referral_transition
                execute_referral_transition(user, referral.public_id, "consent_refused", request_id=request_id)

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


def revoke_consent(user, consent_public_id, request_id=""):
    consent = Consent.objects.filter(public_id=consent_public_id).first()
    if not consent:
        raise NotFoundError("Consent not found.")

    if hasattr(user, "patient_account") and user.patient_account.patient != consent.patient:
        raise PermissionDeniedError("Only the patient can revoke consent.")

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
                execute_referral_transition(user, referral.public_id, "consent_revoked", request_id=request_id)

        record_audit_event(
            action="transition",
            object_type="consent",
            object_id=str(consent.public_id),
            actor_user=user,
            patient_id=str(consent.patient.public_id),
            outcome="success",
            reason="Patient revoked consent",
            request_id=request_id,
        )
        return consent
