import hashlib
import json
import uuid
from django.db import IntegrityError, transaction
from django.utils import timezone
from .models import Referral, EmergencyReferral, ReferralDraftVersion, compute_content_hash
from .reconciliation import (
    create_partial_referral_intake,
    normalize_provisional_code,
    reconcile_partial_referral,
)
from .transitions import REFERRAL_TRANSITIONS
from apps.accounts.selectors import active_memberships
from apps.workflow.engine import execute_transition, compute_allowed_actions
from apps.fhir.sync import complete_fhir_transition
from apps.consent.services import create_consent_request_for_referral, supersede_pending_consent_request
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
from apps.accounts.selectors import active_memberships
from apps.identity.relationship import has_care_relationship
from .selectors import get_referral_by_public_id
from .transitions import is_sender_clinician
from apps.common.exceptions import StaleVersionError

def _sender_membership(user, active_facility_id=None, allow_staff_permission=None):
    """The user's active membership that lets them send: a clinician, or (when `allow_staff_permission` is given) staff
    holding it. The active facility is preferred; expired memberships never count."""
    if not user or not getattr(user, "is_authenticated", False):
        return None
    found = []
    for m in active_memberships(user).select_related("facility"):
        if m.role == "clinician" or (allow_staff_permission and m.role == "facility_staff" and allow_staff_permission in (m.permissions or [])):
            found.append(m)
    if active_facility_id:
        found = [m for m in found if str(m.facility.public_id) == str(active_facility_id)] or found
    # Prefer clinician membership over facility_staff when both exist
    found.sort(key=lambda m: 0 if m.role == "clinician" else 1)
    return found[0] if found else None


def _resolve_sender_membership(user, active_facility_id=None):
    """
    Resolve an active membership authorized to initiate a referral draft:
    - Any active `clinician` membership (preferred), OR
    - An active `facility_staff` (CHW) membership holding `referral.create`.
    Never grants clinician approval or send rights (those remain clinician-only in transitions.py).
    """
    membership = _sender_membership(user, active_facility_id=active_facility_id, allow_staff_permission="referral.create")
    if not membership:
        raise PermissionDeniedError(
            "Only a clinician or authorized facility staff (with referral.create) can create a referral draft."
        )
    return membership


def _canonical_referral_payload(patient_public_id, receiver_facility_public_id, receiver_practitioner_public_id, urgency, reason, summary):
    return json.dumps({
        "patient_id": str(patient_public_id),
        "receiver_facility_id": str(receiver_facility_public_id),
        "receiver_practitioner_id": str(receiver_practitioner_public_id) if receiver_practitioner_public_id else None,
        "urgency": urgency,
        "reason": reason,
        "summary": summary or {},
    }, sort_keys=True)


def _verify_idempotent_match(existing: Referral, canonical_input: str):
    reconciled_hash = (existing.reconciliation_metadata or {}).get("reconciled_sender_payload_hash")
    if existing.reconciled_at is not None and reconciled_hash:
        if reconciled_hash != canonical_input:
            raise IdempotencyConflictError(
                "Idempotency key was reused with a different referral payload."
            )
        existing._idempotency_replayed = True
        return existing

    stored = _canonical_referral_payload(
        existing.patient.public_id,
        existing.receiver_facility.public_id,
        existing.receiver_practitioner.public_id if existing.receiver_practitioner else None,
        existing.urgency,
        existing.reason,
        existing.summary,
    )
    if canonical_input != stored:
        raise IdempotencyConflictError(
            "Idempotency key was reused with a different referral payload."
        )
    existing._idempotency_replayed = True
    return existing


def _parse_idempotency_key(header_key=None, body_key=None):
    parsed_header = None
    parsed_body = None
    if header_key is not None and str(header_key).strip():
        try:
            parsed_header = uuid.UUID(str(header_key).strip())
        except ValueError:
            raise ValidationError("Invalid Idempotency-Key header; must be a valid UUID.")
    if body_key is not None and str(body_key).strip():
        try:
            parsed_body = body_key if isinstance(body_key, uuid.UUID) else uuid.UUID(str(body_key).strip())
        except ValueError:
            raise ValidationError("Invalid idempotency_key; must be a valid UUID.")
    if parsed_header and parsed_body and parsed_header != parsed_body:
        raise ValidationError("Idempotency-Key header does not match body idempotency_key.")
    return parsed_header or parsed_body


def create_referral_draft(user, validated_data, request_id="", idempotency_key=None, active_facility_id=None):
    # Authorization & facility scope check FIRST (prevents cross-tenant idempotency probing)
    membership = _resolve_sender_membership(user, active_facility_id=active_facility_id)
    sender_facility = membership.facility

    effective_key = _parse_idempotency_key(
        header_key=idempotency_key,
        body_key=validated_data.get("idempotency_key"),
    )
    patient = Patient.objects.filter(public_id=validated_data["patient_id"]).first()
    if not patient:
        raise NotFoundError("Patient not found.")

    receiver_facility = Facility.objects.filter(public_id=validated_data["receiver_facility_id"]).first()
    if not receiver_facility:
        raise NotFoundError("Receiver facility not found.")

    if receiver_facility.pk == sender_facility.pk:
        raise ValidationError("The receiving facility must be different from your own.")

    # SECURITY §4.3: reject cross-facility probing for patients already bound to another facility's care,
    # while still allowing newly registered phone-less patients and partial-intake reconciliation.
    if not has_care_relationship(patient, [sender_facility.pk]):
        from apps.records.models import Encounter
        from apps.scheduling.models import Appointment
        has_other_care = (
            Appointment.objects.filter(patient=patient).exists()
            or Encounter.objects.filter(patient=patient).exists()
            or Referral.objects.filter(patient=patient, is_partial=False).exists()
        )
        if has_other_care:
            raise NotFoundError("Patient not found.")

    encounter = None
    if validated_data.get("encounter_id"):
        from apps.records.models import Encounter
        encounter = Encounter.objects.filter(
            public_id=validated_data["encounter_id"],
            patient=patient,
            facility=sender_facility,
        ).first()
        if not encounter:
            raise ValidationError("The encounter does not belong to this patient at your facility.")
    receiver_practitioner = None
    if validated_data.get("receiver_practitioner_id"):
        receiver_practitioner = Practitioner.objects.filter(public_id=validated_data["receiver_practitioner_id"]).first()

    urgency = validated_data.get("urgency", "routine")
    reason = validated_data["reason"]
    summary = validated_data.get("summary") or {}
    summary_origin = "manual"
    if not summary.get("sections"):
        from apps.ai.report_analysis import get_or_build_patient_report_history

        report_history = get_or_build_patient_report_history(patient)
        if report_history["reports_count"] > 0:
            doc_refs = [f"document:{d['id']}" for d in report_history["documents"]]
            statements = []
            if report_history["concise_summary"]:
                statements.append({"text": report_history["concise_summary"], "source_refs": doc_refs})
            if report_history["positive_or_abnormal"]:
                pos_refs = list({f"document:{x['document_id']}#page={x['page']}" for x in report_history["positive_or_abnormal"]})
                pos_text = "Positive / abnormal findings: " + "; ".join(
                    f"{x['name']}: {x['value']}{(' ' + x['unit']) if x['unit'] else ''} ({x['interpretation']})"
                    for x in report_history["positive_or_abnormal"][:8]
                )
                statements.append({"text": pos_text, "source_refs": pos_refs})
            if report_history["negative_or_normal"]:
                neg_refs = list({f"document:{x['document_id']}#page={x['page']}" for x in report_history["negative_or_normal"]})
                neg_text = "Negative / normal findings: " + "; ".join(
                    f"{x['name']}: {x['value']}{(' ' + x['unit']) if x['unit'] else ''} ({x['interpretation']})"
                    for x in report_history["negative_or_normal"][:8]
                )
                statements.append({"text": neg_text, "source_refs": neg_refs})
            if statements:
                summary = {
                    **summary,
                    "sections": [
                        {
                            "name": "Prior Tests & Report History",
                            "statements": statements,
                        }
                    ],
                }
                summary_origin = "ai_draft_edited"

    canonical_input = _canonical_referral_payload(
        patient.public_id,
        receiver_facility.public_id,
        receiver_practitioner.public_id if receiver_practitioner else None,
        urgency,
        reason,
        summary,
    )

    # Scoped idempotency lookup before creation
    if effective_key is not None:
        existing = (
            Referral.objects.select_related("patient", "receiver_facility", "receiver_practitioner")
            .filter(sender_facility=sender_facility, idempotency_key=effective_key)
            .first()
        )
        if existing:
            return _verify_idempotent_match(existing, canonical_input)

    sender_practitioner = (
        user.practitioner_profile
        if hasattr(user, "practitioner_profile")
        else Practitioner.objects.filter(user=user).first()
    )
    if not sender_practitioner:
        if membership.role == "clinician":
            raise PermissionDeniedError("Your account has no practitioner profile. Ask your facility admin to create one.")
        sender_practitioner = Practitioner.objects.create(
            user=user,
            name=user.display_name or "Health Worker",
            registration_number=f"CHW-{user.id}",
        )

    content_hash = compute_content_hash(summary)
    provisional_code = normalize_provisional_code(validated_data.get("provisional_code")) or None

    # Deterministic reconciliation with any existing partial intake for (receiver_facility, provisional_code)
    if provisional_code:
        reconciled = reconcile_partial_referral(
            user=user,
            provisional_code=provisional_code,
            sender_facility=sender_facility,
            sender_practitioner=sender_practitioner,
            receiver_facility=receiver_facility,
            receiver_practitioner=receiver_practitioner,
            patient=patient,
            urgency=urgency,
            reason=reason,
            summary=summary,
            idempotency_key=effective_key,
            emergency_mode=False,
            sender_payload_hash=canonical_input,
            request_id=request_id,
        )
        if reconciled is not None:
            return reconciled

    try:
        with transaction.atomic():
            referral = Referral.objects.create(
                patient=patient,
                encounter=encounter,
                sender_facility=sender_facility,
                sender_practitioner=sender_practitioner,
                initiated_by=user,
                receiver_facility=receiver_facility,
                receiver_practitioner=receiver_practitioner,
                urgency=urgency,
                reason=reason,
                state="DRAFT",
                summary=summary,
                content_hash=content_hash,
                summary_origin=summary_origin,
                provisional_code=provisional_code,
                idempotency_key=effective_key,
                triage_session_id=validated_data.get("triage_session_id"),
            )

            ReferralDraftVersion.objects.create(
                referral=referral,
                version_number=1,
                summary=summary,
                created_by=user,
                origin="clinician_edit" if membership.role == "clinician" else "chw_draft",
            )

            record_audit_event(
                action="create",
                object_type="referral",
                object_id=str(referral.public_id),
                actor_user=user,
                patient_id=str(patient.public_id),
                request_id=request_id,
            )
            referral._idempotency_replayed = False
            return referral
    except IntegrityError:
        # Concurrent request race on (sender_facility, idempotency_key) or (receiver_facility, provisional_code)
        if effective_key is not None:
            existing = (
                Referral.objects.select_related("patient", "receiver_facility", "receiver_practitioner")
                .filter(sender_facility=sender_facility, idempotency_key=effective_key)
                .first()
            )
            if existing:
                return _verify_idempotent_match(existing, canonical_input)
        if provisional_code:
            reconciled = reconcile_partial_referral(
                user=user,
                provisional_code=provisional_code,
                sender_facility=sender_facility,
                sender_practitioner=sender_practitioner,
                receiver_facility=receiver_facility,
                receiver_practitioner=receiver_practitioner,
                patient=patient,
                urgency=urgency,
                reason=reason,
                summary=summary,
                idempotency_key=effective_key,
                emergency_mode=False,
                request_id=request_id,
            )
            if reconciled is not None:
                return reconciled
        raise


def update_referral_draft(user, referral_public_id, validated_data, request_id="", if_match=None):
    referral = get_referral_by_public_id(user, referral_public_id)  # 404 outside the user's scope
    has_access = is_sender_clinician(user, referral, None) or any(
        m.role == "facility_staff" and "referral.create" in (m.permissions or [])
        for m in active_memberships(user).filter(facility=referral.sender_facility)
    )
    if not has_access:
        raise PermissionDeniedError("Only a clinician or authorized staff at the sending facility can edit this referral.")

    with transaction.atomic():
        referral = Referral.objects.select_for_update().get(pk=referral.pk)
        if if_match is not None and referral.version != if_match:
            raise StaleVersionError(f"Stale version: expected {if_match}, but current version is {referral.version}.")
        # MASTERPLAN §5.2: content is editable (PATCH) only in DRAFT.
        if referral.state != "DRAFT":
            raise TransitionNotAllowedError("Referral content can only be edited in DRAFT state. Use reopen_draft first.")

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


def create_emergency_referral(user, validated_data, request_id="", active_facility_id=None):
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

    # §4.2: a clinician, or staff holding `emergency.create`, at an active membership. Staff have no Practitioner record,
    # so sender_practitioner stays empty for them instead of inventing one.
    membership = _sender_membership(user, active_facility_id, allow_staff_permission="emergency.create")
    if not membership:
        raise PermissionDeniedError("Only a clinician, or staff with emergency.create, can send an emergency referral.")
    sender_facility = membership.facility
    sender_practitioner = Practitioner.objects.filter(user=user).first()

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


def execute_referral_transition(user, referral_public_id, action, payload=None, if_match=None, request_id="", as_system=False):
    """
    Run a referral action. `as_system=True` is for internal callers (consent
    service, jobs) and executes with no user actor, which is the only way
    system-only actions pass their permission check.
    """
    payload = payload or {}
    actor = None if as_system else user

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
            actor=actor,
            payload=payload,
            expected_version=if_match,
            request_id=request_id,
        )

        if action == "request_consent":
            create_consent_request_for_referral(referral, request_id=request_id)
        elif action == "reopen_draft":
            supersede_pending_consent_request(referral)

        # FHIR-gated actions (send, record_outcome, retry_sync) apply their
        # target state only after the FHIR write succeeds (INV-12). If FHIR is
        # unavailable the referral stays pending and the view answers 202.
        if referral.pending_action:
            complete_fhir_transition(referral, actor=actor, request_id=request_id)
            allowed_actions = compute_allowed_actions(referral, user)

        # If outcome recorded, auto-trigger return_outcome per MASTERPLAN §5.2
        if action == "record_outcome" and referral.state == "OUTCOME_RECORDED":
            referral, allowed_actions = execute_transition(
                obj=referral,
                action="return_outcome",
                actor=None,
                payload={},
                request_id=request_id,
            )

        return referral, allowed_actions

