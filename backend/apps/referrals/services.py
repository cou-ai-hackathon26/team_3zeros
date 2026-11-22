import hashlib
import json
from django.db import transaction
from django.utils import timezone
from .models import Referral, EmergencyReferral, ReferralDraftVersion, compute_content_hash
from .transitions import REFERRAL_TRANSITIONS
from apps.workflow.engine import execute_transition
from apps.common.exceptions import (
    NotFoundError,
    ValidationError,
    TransitionNotAllowedError,
    PermissionDeniedError,
    IdempotencyConflictError,
)
from apps.audit.services import record_audit_event
from apps.identity.models import Patient
from apps.organizations.models import Facility, Practitioner

def create_referral_draft(user, validated_data, request_id=""):
    patient = Patient.objects.filter(public_id=validated_data["patient_id"]).first()
    if not patient:
        raise NotFoundError("Patient not found.")

    receiver_facility = Facility.objects.filter(public_id=validated_data["receiver_facility_id"]).first()
    if not receiver_facility:
        raise NotFoundError("Receiver facility not found.")

    # Sender practitioner and facility from active user context
    membership = user.memberships.filter(role="clinician").first()
    if not membership:
        raise PermissionDeniedError("Only a clinician can create a referral draft.")

    sender_facility = membership.facility
    sender_practitioner = user.practitioner_profile if hasattr(user, "practitioner_profile") else Practitioner.objects.filter(user=user).first()
    if not sender_practitioner:
        # Fallback if testing without dedicated practitioner profile
        sender_practitioner = Practitioner.objects.create(
            user=user,
            name=user.display_name or "Doctor",
            registration_number=f"DOC-{user.id}",
        )

    receiver_practitioner = None
    if validated_data.get("receiver_practitioner_id"):
        receiver_practitioner = Practitioner.objects.filter(public_id=validated_data["receiver_practitioner_id"]).first()

    summary = validated_data.get("summary", {})
    content_hash = compute_content_hash(summary)

    with transaction.atomic():
        referral = Referral.objects.create(
            patient=patient,
            sender_facility=sender_facility,
            sender_practitioner=sender_practitioner,
            receiver_facility=receiver_facility,
            receiver_practitioner=receiver_practitioner,
            urgency=validated_data.get("urgency", "routine"),
            reason=validated_data["reason"],
            state="DRAFT",
            summary=summary,
            content_hash=content_hash,
            summary_origin="manual",
        )

        ReferralDraftVersion.objects.create(
            referral=referral,
            version_number=1,
            summary=summary,
            created_by=user,
            origin="clinician_edit",
        )

        record_audit_event(
            action="create",
            object_type="referral",
            object_id=str(referral.public_id),
            actor_user=user,
            patient_id=str(patient.public_id),
            request_id=request_id,
        )
        return referral


def update_referral_draft(user, referral_public_id, validated_data, request_id=""):
    referral = Referral.objects.filter(public_id=referral_public_id).first()
    if not referral:
        raise NotFoundError("Referral not found.")

    # Enforce MASTERPLAN §5.2 rule: Content is editable (PATCH) ONLY in DRAFT
    if referral.state != "DRAFT":
        raise TransitionNotAllowedError("Referral content can only be edited in DRAFT state. Use reopen_draft first.")

    with transaction.atomic():
        if "reason" in validated_data:
            referral.reason = validated_data["reason"]
        if "urgency" in validated_data:
            referral.urgency = validated_data["urgency"]
        if "summary" in validated_data:
            referral.summary = validated_data["summary"]
            referral.content_hash = compute_content_hash(referral.summary)

            # Record draft version
            next_version = referral.draft_versions.count() + 1
            ReferralDraftVersion.objects.create(
                referral=referral,
                version_number=next_version,
                summary=referral.summary,
                created_by=user,
                origin="clinician_edit",
            )

        referral.save(increment_version=True)

        record_audit_event(
            action="update",
            object_type="referral",
            object_id=str(referral.public_id),
            actor_user=user,
            patient_id=str(referral.patient.public_id),
            request_id=request_id,
        )
        return referral


def create_emergency_referral(user, validated_data, request_id=""):
    """
    Creates an emergency referral per MASTERPLAN INV-16, §6.3, §13 / BACKEND §13.
    Requires only 5 minimum fields; idempotent and enters SENT state directly.
    """
    idempotency_key = validated_data["idempotency_key"]

    # Check for existing idempotency key
    existing_em = EmergencyReferral.objects.select_related("referral").filter(idempotency_key=idempotency_key).first()
    if existing_em:
        # Check payload equality
        canonical_input = json.dumps({
            "reason": validated_data["reason"],
            "urgency": validated_data["urgency"],
            "vitals": validated_data.get("vitals", {}),
            "treatment_given": validated_data.get("treatment_given", ""),
        }, sort_keys=True)
        stored_data = json.dumps({
            "reason": existing_em.referral.reason,
            "urgency": existing_em.referral.urgency,
            "vitals": existing_em.vitals,
            "treatment_given": existing_em.treatment_given,
        }, sort_keys=True)

        if canonical_input != stored_data:
            raise IdempotencyConflictError("Idempotency key was reused with different emergency referral payload.")
        return existing_em.referral

    facility = Facility.objects.filter(public_id=validated_data["facility_id"]).first()
    if not facility:
        raise NotFoundError("Facility not found.")

    sender_facility = user.memberships.first().facility if user.memberships.exists() else facility
    sender_practitioner = user.practitioner_profile if hasattr(user, "practitioner_profile") else Practitioner.objects.filter(user=user).first()
    if not sender_practitioner:
        sender_practitioner = Practitioner.objects.create(
            user=user,
            name=user.display_name or "Emergency Staff",
            registration_number=f"STAFF-{user.id}",
        )

    # Patient lookup or unverified patient record
    patient = None
    if validated_data.get("patient_id"):
        patient = Patient.objects.filter(public_id=validated_data["patient_id"]).first()
    if not patient:
        patient = Patient.objects.create(
            given_name="Emergency",
            family_name="Patient",
            name_bn="জরুরী রোগী",
            sex="unknown",
        )

    summary = {
        "vitals": validated_data.get("vitals", {}),
        "treatment_given": validated_data.get("treatment_given", ""),
    }

    with transaction.atomic():
        referral = Referral.objects.create(
            patient=patient,
            sender_facility=sender_facility,
            sender_practitioner=sender_practitioner,
            receiver_facility=facility,
            urgency=validated_data["urgency"],
            emergency_mode=True,
            reason=validated_data["reason"],
            state="SENT",  # Enters SENT directly per §13
            sent_at=timezone.now(),
            summary=summary,
            content_hash=compute_content_hash(summary),
            provisional_code=validated_data.get("provisional_code", ""),
            summary_origin="manual",
        )

        EmergencyReferral.objects.create(
            referral=referral,
            idempotency_key=idempotency_key,
            created_at_device=validated_data["created_at_device"],
            unverified_identity_description=validated_data.get("unverified_description", ""),
            vitals=validated_data.get("vitals", {}),
            treatment_given=validated_data.get("treatment_given", ""),
        )

        record_audit_event(
            action="create",
            object_type="emergency_referral",
            object_id=str(referral.public_id),
            actor_user=user,
            patient_id=str(patient.public_id),
            request_id=request_id,
        )
        return referral


def execute_referral_transition(user, referral_public_id, action, payload=None, if_match=None, request_id=""):
    payload = payload or {}

    with transaction.atomic():
        referral = Referral.objects.select_for_update().filter(public_id=referral_public_id).first()
        if not referral:
            raise NotFoundError("Referral not found.")

        referral.TRANSITIONS = REFERRAL_TRANSITIONS

        # Handle specific side-effects
        if action == "send":
            referral.sent_at = timezone.now()
        elif action == "acknowledge":
            referral.acknowledged_at = timezone.now()
        elif action == "escalate":
            referral.escalated_at = timezone.now()
        elif action == "decline":
            referral.decline_reason = payload.get("reason", "")
        elif action == "record_outcome":
            referral.outcome = payload.get("outcome", {})

        referral, allowed_actions = execute_transition(
            obj=referral,
            action=action,
            actor=user,
            payload=payload,
            expected_version=if_match,
            request_id=request_id,
        )

        # If outcome recorded, auto-trigger return_outcome per MASTERPLAN §5.2
        if action == "record_outcome" and referral.state == "OUTCOME_RECORDED":
            referral, allowed_actions = execute_transition(
                obj=referral,
                action="return_outcome",
                actor=user,
                payload={},
                request_id=request_id,
            )

        return referral, allowed_actions
