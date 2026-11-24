"""
Phase 3B: Partial Referral Intake & Deterministic Reconciliation Engine.

Strictly preserves Medi Waypoint workflow invariants:
- Never matches automatically on patient name, age, symptoms, or fuzzy heuristics.
- Never fabricates missing clinical information; explicitly tracks `missing_fields`.
- Never regresses receiving-facility progress during reconciliation.
- Enforces facility-level authorization, DB-backed uniqueness, and full auditability.
"""
import json
from django.db import IntegrityError, transaction
from django.utils import timezone

from apps.accounts.selectors import active_memberships
from apps.audit.services import record_audit_event
from apps.common.exceptions import (
    IdempotencyConflictError,
    NotFoundError,
    PermissionDeniedError,
    ValidationError,
)
from apps.identity.models import DuplicateCandidate, Patient, PatientIdentifier
from apps.identity.services import assign_system_patient_id
from apps.organizations.models import Facility
from apps.workflow.models import HistoryEntry
from .models import Referral, ReferralDraftVersion, compute_content_hash

RECEIVER_PROGRESSED_STATES = {
    "ACKNOWLEDGED_BY_RECEIVER",
    "IN_PROGRESS",
    "OUTCOME_RECORDED",
    "OUTCOME_RETURNED",
    "CLOSED",
}

TERMINAL_CONFLICT_STATES = {
    "DECLINED",
    "CANCELLED",
    "EXPIRED",
}


def normalize_provisional_code(code) -> str:
    cleaned = (code or "").strip()
    if cleaned.upper().startswith("MW-REF:"):
        cleaned = cleaned[7:].strip()
    return cleaned


def compute_missing_fields(referral: Referral) -> list[str]:
    """
    Deterministically identify missing clinical and provenance fields without
    confusing missing values with explicit negative findings (e.g. allergies=[]).
    """
    missing = []
    summary = referral.summary or {}

    if referral.sender_facility_id is None:
        missing.append("sender_facility")
    if referral.sender_practitioner_id is None:
        missing.append("sender_practitioner")
    if summary.get("patient_identity_unverified") is True:
        missing.append("patient_verified_identity")
    if not summary.get("sections") and not summary.get("clinical_notes") and not summary.get("presenting_symptoms"):
        missing.append("clinical_summary")
    if "vitals" not in summary or summary.get("vitals") in (None, {}):
        missing.append("vitals")
    if "allergies" not in summary or summary.get("allergies") is None:
        missing.append("allergies")
    if "treatment_given" not in summary or not summary.get("treatment_given"):
        missing.append("treatment_given")
    if referral.consent_id is None and not referral.emergency_mode:
        missing.append("consent")

    return missing


def _resolve_receiver_intake_membership(user, receiver_facility_id=None):
    """
    Verify caller has an active `clinician` or `facility_staff` (with `referral.acknowledge`)
    membership at the target receiving facility.
    """
    if not user or not getattr(user, "is_authenticated", False):
        raise PermissionDeniedError("Authentication required to create a partial referral intake.")
    if hasattr(user, "patient_account"):
        raise PermissionDeniedError("Patients cannot create partial referral intakes.")

    qs = active_memberships(user).select_related("facility")
    if receiver_facility_id is not None:
        qs = qs.filter(facility__public_id=receiver_facility_id)

    for m in qs:
        if m.role == "clinician":
            return m
        if m.role == "facility_staff" and "referral.acknowledge" in (m.permissions or []):
            return m

    raise PermissionDeniedError(
        "Only an active clinician or authorized receiving-facility staff (with referral.acknowledge) can perform partial intake."
    )


def _canonical_partial_fingerprint(validated_data, provisional_code, receiver_facility_id):
    return json.dumps({
        "provisional_code": provisional_code,
        "receiver_facility_id": str(receiver_facility_id),
        "reason": validated_data["reason"],
        "urgency": validated_data.get("urgency", "urgent"),
        "patient_id": str(validated_data["patient_id"]) if validated_data.get("patient_id") else None,
        "patient_system_id": (validated_data.get("patient_system_id") or "").strip() or None,
        "patient_name": (validated_data.get("patient_name") or "").strip() or None,
    }, sort_keys=True)


def create_partial_referral_intake(user, validated_data, request_id="", idempotency_key=None) -> Referral:
    """
    Create a partial referral record at the receiving facility when the patient arrives
    before the sender's full referral has synchronized (Challenge 2).
    """
    membership = _resolve_receiver_intake_membership(user, validated_data.get("receiver_facility_id"))
    receiver_facility = membership.facility

    provisional_code = normalize_provisional_code(validated_data.get("provisional_code"))
    if not provisional_code:
        raise ValidationError("A non-empty provisional_code is required for partial referral intake.")

    # Optional sender facility (only if known on the slip)
    sender_facility = None
    if validated_data.get("sender_facility_id"):
        sender_facility = Facility.objects.filter(public_id=validated_data["sender_facility_id"]).first()
        if not sender_facility:
            raise NotFoundError("Specified sender facility not found.")

    fingerprint = _canonical_partial_fingerprint(validated_data, provisional_code, receiver_facility.public_id)

    # Check for existing record with same (receiver_facility, provisional_code)
    existing = (
        Referral.objects.select_related("patient", "receiver_facility", "sender_facility")
        .filter(receiver_facility=receiver_facility, provisional_code=provisional_code)
        .first()
    )
    if existing:
        stored_fp = (existing.reconciliation_metadata or {}).get("partial_intake_fingerprint")
        if existing.is_partial and stored_fp == fingerprint:
            existing._idempotency_replayed = True
            return existing
        raise IdempotencyConflictError(
            f"A referral with provisional code '{provisional_code}' already exists at this facility with conflicting data."
        )

    # Resolve or create minimal patient record (no phone, email, or NID required; never fabricate data)
    patient = None
    patient_identity_unverified = False
    if validated_data.get("patient_id"):
        patient = Patient.objects.filter(public_id=validated_data["patient_id"]).first()
        if not patient:
            raise NotFoundError("Patient not found.")
    elif validated_data.get("patient_system_id"):
        sys_val = validated_data["patient_system_id"].strip()
        ident = PatientIdentifier.objects.select_related("patient").filter(
            system="system_id", value=sys_val
        ).first()
        if ident:
            patient = ident.patient

    summary = {"intake_source": "partial_receiving_facility"}
    if validated_data.get("presenting_symptoms"):
        summary["presenting_symptoms"] = validated_data["presenting_symptoms"].strip()
    if validated_data.get("referring_worker_name"):
        summary["referring_worker_name"] = validated_data["referring_worker_name"].strip()
    if validated_data.get("referred_at_device"):
        summary["referred_at_device"] = validated_data["referred_at_device"].isoformat()
    if validated_data.get("vitals") is not None:
        summary["vitals"] = validated_data["vitals"]
    if "allergies" in validated_data and validated_data["allergies"] is not None:
        # Preserve explicit list (even [] = known no allergies) vs omitted = missing
        summary["allergies"] = validated_data["allergies"]
    if validated_data.get("treatment_given"):
        summary["treatment_given"] = validated_data["treatment_given"].strip()
    if validated_data.get("unverified_identity_description"):
        summary["unverified_identity_description"] = validated_data["unverified_identity_description"].strip()

    now = timezone.now()

    try:
        with transaction.atomic():
            if patient is None:
                patient_identity_unverified = True
                raw_name = (validated_data.get("patient_name") or "").strip()
                patient = Patient.objects.create(
                    given_name=raw_name or "Unidentified",
                    name_bn=(validated_data.get("patient_name_bn") or "").strip(),
                    estimated_age=validated_data.get("estimated_age"),
                    birth_date=validated_data.get("birth_date"),
                    sex=validated_data.get("sex", "unknown"),
                    phone=None,
                )
                assign_system_patient_id(patient)

            summary["patient_identity_unverified"] = patient_identity_unverified

            referral = Referral(
                patient=patient,
                sender_facility=sender_facility,
                sender_practitioner=None,
                initiated_by=user,
                receiver_facility=receiver_facility,
                urgency=validated_data.get("urgency", "urgent"),
                reason=validated_data["reason"],
                state="ACKNOWLEDGED_BY_RECEIVER",
                acknowledged_at=now,
                summary=summary,
                content_hash=compute_content_hash(summary),
                summary_origin="partial_intake",
                provisional_code=provisional_code,
                is_partial=True,
                completeness_status="partial",
                reconciliation_metadata={
                    "partial_created_by_user_id": str(user.public_id),
                    "partial_intake_at": now.isoformat(),
                    "partial_intake_fingerprint": fingerprint,
                    "conflicts_detected": [],
                },
            )
            referral.missing_fields = compute_missing_fields(referral)
            referral.save()

            HistoryEntry.objects.create(
                aggregate_type=referral._meta.model_name,
                aggregate_id=referral.public_id,
                action="partial_intake",
                from_state="",
                to_state="ACKNOWLEDGED_BY_RECEIVER",
                actor_user=user,
                reason=f"Partial referral accepted using provisional code {provisional_code}",
            )

            record_audit_event(
                action="partial_intake_create",
                object_type="referral",
                object_id=str(referral.public_id),
                actor_user=user,
                patient_id=str(patient.public_id),
                outcome="success",
                reason=f"Partial referral intake at {receiver_facility.name} (provisional={provisional_code}, missing={len(referral.missing_fields)} fields)",
                request_id=request_id,
            )
            referral._idempotency_replayed = False
            return referral
    except IntegrityError:
        existing = (
            Referral.objects.select_related("patient", "receiver_facility", "sender_facility")
            .filter(receiver_facility=receiver_facility, provisional_code=provisional_code)
            .first()
        )
        if existing:
            stored_fp = (existing.reconciliation_metadata or {}).get("partial_intake_fingerprint")
            if existing.is_partial and stored_fp == fingerprint:
                existing._idempotency_replayed = True
                return existing
        raise IdempotencyConflictError(
            f"Concurrent partial intake conflict for provisional code '{provisional_code}'."
        )


def reconcile_partial_referral(
    *,
    user,
    provisional_code: str,
    sender_facility,
    sender_practitioner,
    receiver_facility,
    receiver_practitioner,
    patient: Patient,
    urgency: str,
    reason: str,
    summary: dict,
    idempotency_key=None,
    emergency_mode: bool = False,
    sender_payload_hash: str = "",
    request_id: str = "",
):
    """
    Deterministically reconcile an arriving full referral into an existing partial
    intake record matching (receiver_facility, provisional_code).

    Returns:
    - Reconciled `Referral` (with `_idempotency_replayed = True`) if a matching
      partial/existing referral was found and reconciled.
    - `None` if no matching partial referral exists (caller proceeds with normal creation).
    Raises `IdempotencyConflictError` (409) on any unsafe, cross-facility, terminal,
    or ambiguous match, persisting an audit event outside the rolled-back transaction.
    """
    code = normalize_provisional_code(provisional_code)
    if not code:
        return None

    conflict_audit = None
    conflict_message = None

    with transaction.atomic():
        matches = list(
            Referral.objects.select_for_update()
            .select_related("patient", "sender_facility", "receiver_facility")
            .filter(receiver_facility=receiver_facility, provisional_code=code)
        )
        if not matches:
            return None

        if len(matches) > 1:
            conflict_audit = (code, str(patient.public_id), "Multiple partial referral candidates matched provisional code; automatic reconciliation rejected.")
            conflict_message = "Ambiguous reconciliation match; manual review required."
        else:
            existing = matches[0]

            # 1. Cross-facility sender check
            if existing.sender_facility_id is not None and existing.sender_facility_id != sender_facility.id:
                conflict_audit = (str(existing.public_id), str(existing.patient.public_id), "Sender facility mismatch during reconciliation attempt.")
                conflict_message = "Reconciliation rejected: sending facility does not match the recorded partial intake."
            # 2. Already reconciled / already full check
            elif not existing.is_partial:
                if (
                    idempotency_key is not None
                    and existing.idempotency_key == idempotency_key
                    and existing.sender_facility_id == sender_facility.id
                ):
                    existing._idempotency_replayed = True
                    return existing
                conflict_audit = (str(existing.public_id), str(existing.patient.public_id), "Provisional code is already linked to a complete/reconciled referral.")
                conflict_message = "This provisional code has already been reconciled to a complete referral."
            # 3. Terminal state conflict check (never force a transition out of DECLINED/CANCELLED/EXPIRED)
            elif existing.state in TERMINAL_CONFLICT_STATES:
                conflict_audit = (str(existing.public_id), str(existing.patient.public_id), f"Cannot reconcile into terminal state '{existing.state}'.")
                conflict_message = f"Reconciliation conflict: partial referral is in terminal state '{existing.state}'."
            else:
                # 4. Verified patient identity protection (cannot arbitrarily swap a verified patient)
                existing_summary = dict(existing.summary or {})
                was_unverified_patient = existing_summary.get("patient_identity_unverified") is True
                if not was_unverified_patient and existing.patient_id != patient.id:
                    conflict_audit = (str(existing.public_id), str(existing.patient.public_id), "Verified patient identity mismatch during reconciliation.")
                    conflict_message = "Reconciliation rejected: verified patient identity does not match the partial referral."

        if conflict_message is None:
            # If partial intake created a temporary unverified patient, link the verified sender patient
            # and flag a non-destructive DuplicateCandidate (INV-13) for human review.
            if was_unverified_patient and existing.patient_id != patient.id:
                temp_patient = existing.patient
                existing.patient = patient
                DuplicateCandidate.objects.get_or_create(
                    patient_a=patient,
                    patient_b=temp_patient,
                    defaults={
                        "score": 0.90,
                        "reasons": ["partial_referral_reconciliation"],
                        "status": "open",
                    },
                )

            # 5. Non-destructive clinical enrichment + explicit conflict recording
            conflicts = list((existing.reconciliation_metadata or {}).get("conflicts_detected", []))
            if existing.urgency != urgency:
                conflicts.append({
                    "field": "urgency",
                    "partial_value": existing.urgency,
                    "sender_value": urgency,
                    "resolution": "preserved_receiver_or_higher_visibility",
                })
            if existing.reason and reason and existing.reason.strip() != reason.strip():
                conflicts.append({
                    "field": "reason",
                    "partial_value": existing.reason,
                    "sender_value": reason,
                    "resolution": "enriched_with_sender_reason_partial_preserved_in_snapshot",
                })

            partial_snapshot = {
                "reason": existing.reason,
                "urgency": existing.urgency,
                "summary": existing_summary,
            }
            merged_summary = {
                **existing_summary,
                **(summary or {}),
                "patient_identity_unverified": False,
                "partial_intake_snapshot": partial_snapshot,
            }

            # 6. Explicit State Preservation Policy: NEVER regress receiver-progressed states!
            preserved_state = existing.state
            if existing.state not in RECEIVER_PROGRESSED_STATES:
                existing.state = "SENT" if emergency_mode else existing.state

            existing.sender_facility = sender_facility
            existing.sender_practitioner = sender_practitioner
            existing.initiated_by = user
            if receiver_practitioner and not existing.receiver_practitioner_id:
                existing.receiver_practitioner = receiver_practitioner
            if idempotency_key is not None:
                existing.idempotency_key = idempotency_key
            if emergency_mode:
                existing.emergency_mode = True
            if reason:
                existing.reason = reason
            existing.summary = merged_summary
            existing.content_hash = compute_content_hash(merged_summary)
            existing.is_partial = False
            existing.completeness_status = "complete"
            existing.reconciled_at = timezone.now()
            existing.missing_fields = compute_missing_fields(existing)
            existing.reconciliation_metadata = {
                **(existing.reconciliation_metadata or {}),
                "reconciled_by_user_id": str(user.public_id),
                "reconciled_at": existing.reconciled_at.isoformat(),
                "matched_on": "receiver_facility+provisional_code",
                "preserved_receiver_state": preserved_state,
                "reconciled_sender_payload_hash": sender_payload_hash,
                "conflicts_detected": conflicts,
            }
            existing.save(increment_version=True)

            next_version = existing.draft_versions.count() + 1
            ReferralDraftVersion.objects.create(
                referral=existing,
                version_number=next_version,
                summary=merged_summary,
                created_by=user,
                origin="reconciled_full_sync",
            )

            HistoryEntry.objects.create(
                aggregate_type=existing._meta.model_name,
                aggregate_id=existing.public_id,
                action="reconciled_full_record",
                from_state=preserved_state,
                to_state=existing.state,
                actor_user=user,
                reason=f"Reconciled full referral from {sender_facility.name}; preserved state '{existing.state}'.",
            )

            record_audit_event(
                action="reconciliation_succeeded",
                object_type="referral",
                object_id=str(existing.public_id),
                actor_user=user,
                patient_id=str(existing.patient.public_id),
                outcome="success",
                reason=f"Reconciled partial referral {existing.reference_code} (provisional={code}), preserved state={existing.state}, conflicts={len(conflicts)}.",
                request_id=request_id,
            )

            existing._idempotency_replayed = True
            return existing

    # Persist conflict audit event OUTSIDE the atomic block so it is never rolled back
    if conflict_audit is not None:
        obj_id, pat_id, audit_reason = conflict_audit
        record_audit_event(
            action="reconciliation_conflict",
            object_type="referral",
            object_id=obj_id,
            actor_user=user,
            patient_id=pat_id,
            outcome="failure",
            reason=audit_reason,
            request_id=request_id,
        )
    raise IdempotencyConflictError(conflict_message)
