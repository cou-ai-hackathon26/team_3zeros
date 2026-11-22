from apps.workflow.engine import Transition, is_system
from apps.workflow.models import HistoryEntry

def is_sender_clinician(actor, obj, payload):
    if not actor or not actor.is_authenticated:
        return False
    if hasattr(actor, "platform_admin"):
        return True
    return actor.memberships.filter(facility=obj.sender_facility, role="clinician").exists()

def is_receiver_clinician(actor, obj, payload):
    if not actor or not actor.is_authenticated:
        return False
    if hasattr(actor, "platform_admin"):
        return True
    return actor.memberships.filter(facility=obj.receiver_facility, role="clinician").exists()

def is_receiver_clinician_or_coordinator(actor, obj, payload):
    if not actor or not actor.is_authenticated:
        return False
    if hasattr(actor, "platform_admin"):
        return True
    memberships = actor.memberships.filter(facility=obj.receiver_facility)
    for m in memberships:
        if m.role == "clinician":
            return True
        if m.role == "facility_staff" and "referral.acknowledge" in (m.permissions or []):
            return True
        if m.role == "facility_admin":
            return True
    return False

def is_either_clinician(actor, obj, payload):
    return is_sender_clinician(actor, obj, payload) or is_receiver_clinician(actor, obj, payload)

FHIR_GATED_ACTIONS = ("send", "record_outcome")


def retry_target(referral):
    """State reached by the FHIR-gated action that failed (MASTERPLAN §5.2 retry_sync)."""
    last = (
        HistoryEntry.objects.filter(
            aggregate_type=referral._meta.model_name,
            aggregate_id=referral.public_id,
            action__in=FHIR_GATED_ACTIONS,
        )
        .order_by("-at", "-id")
        .first()
    )
    return REFERRAL_TRANSITIONS[last.action].target if last else REFERRAL_TRANSITIONS["send"].target


def guard_require_decline_reason(actor, obj, payload):
    if not payload or not payload.get("reason"):
        return False, "A decline reason is required."
    return True, None

def guard_require_reason(actor, obj, payload):
    if not payload or not payload.get("reason"):
        return False, "A documented reason is required."
    return True, None

def guard_emergency_only(actor, obj, payload):
    if obj.urgency != "emergency":
        return False, "Only emergency referrals can be escalated."
    return True, None

def guard_active_consent(actor, obj, payload):
    if not obj.consent or obj.consent.state != "ACTIVE":
        return False, "An active patient consent is required to bypass consent request."
    if obj.consent.content_hash != obj.content_hash:
        return False, "Consent content hash does not match current referral content."
    return True, None


REFERRAL_TRANSITIONS = {
    "request_consent": Transition(
        source={"DRAFT"},
        target="AWAITING_PATIENT_CONSENT",
        permission=is_sender_clinician,
    ),
    "use_existing_consent": Transition(
        source={"DRAFT"},
        target="READY_FOR_SENDER_APPROVAL",
        permission=is_sender_clinician,
        requires=[guard_active_consent],
    ),
    "consent_granted": Transition(
        source={"AWAITING_PATIENT_CONSENT"},
        target="READY_FOR_SENDER_APPROVAL",
        permission=is_system,
    ),
    "consent_refused": Transition(
        source={"AWAITING_PATIENT_CONSENT"},
        target="DRAFT",
        permission=is_system,
    ),
    "reopen_draft": Transition(
        source={"AWAITING_PATIENT_CONSENT", "READY_FOR_SENDER_APPROVAL", "APPROVED_BY_SENDER"},
        target="DRAFT",
        permission=is_sender_clinician,
    ),
    "consent_revoked": Transition(
        source={"READY_FOR_SENDER_APPROVAL", "APPROVED_BY_SENDER"},
        target="DRAFT",
        permission=is_system,
    ),
    "approve": Transition(
        source={"READY_FOR_SENDER_APPROVAL"},
        target="APPROVED_BY_SENDER",
        permission=is_sender_clinician,
        requires=[guard_active_consent],
    ),
    "send": Transition(
        source={"APPROVED_BY_SENDER"},
        target="SENT",
        permission=is_sender_clinician,
        requires=[guard_active_consent],
        fhir_required=True,
        on_fhir_failure="FAILED_TO_SYNC",
    ),
    "acknowledge": Transition(
        source={"SENT", "ESCALATED"},
        target="ACKNOWLEDGED_BY_RECEIVER",
        permission=is_receiver_clinician_or_coordinator,
    ),
    "decline": Transition(
        source={"SENT", "ESCALATED"},
        target="DECLINED",
        permission=is_receiver_clinician_or_coordinator,
        requires=[guard_require_decline_reason],
    ),
    "start": Transition(
        source={"ACKNOWLEDGED_BY_RECEIVER"},
        target="IN_PROGRESS",
        permission=is_receiver_clinician,
    ),
    "record_outcome": Transition(
        source={"IN_PROGRESS"},
        target="OUTCOME_RECORDED",
        permission=is_receiver_clinician,
        fhir_required=True,
        on_fhir_failure="FAILED_TO_SYNC",
    ),
    "return_outcome": Transition(
        source={"OUTCOME_RECORDED"},
        target="OUTCOME_RETURNED",
        permission=is_system,
    ),
    "close": Transition(
        source={"OUTCOME_RETURNED"},
        target="CLOSED",
        permission=is_sender_clinician,
    ),
    "close_with_exception": Transition(
        source={
            "DRAFT",
            "AWAITING_PATIENT_CONSENT",
            "READY_FOR_SENDER_APPROVAL",
            "APPROVED_BY_SENDER",
            "SENT",
            "ESCALATED",
            "ACKNOWLEDGED_BY_RECEIVER",
            "IN_PROGRESS",
            "OUTCOME_RECORDED",
            "FAILED_TO_SYNC",
        },
        target="CLOSED",
        permission=is_either_clinician,
        requires=[guard_require_reason],
    ),
    "cancel": Transition(
        source={"DRAFT", "AWAITING_PATIENT_CONSENT", "READY_FOR_SENDER_APPROVAL", "APPROVED_BY_SENDER"},
        target="CANCELLED",
        permission=is_sender_clinician,
    ),
    "expire": Transition(
        source={"AWAITING_PATIENT_CONSENT"},
        target="EXPIRED",
        permission=is_system,
    ),
    "escalate": Transition(
        source={"SENT"},
        target="ESCALATED",
        permission=is_system,
        requires=[guard_emergency_only],
    ),
    "sync_failed": Transition(
        source={"APPROVED_BY_SENDER", "IN_PROGRESS"},
        target="FAILED_TO_SYNC",
        permission=is_system,
    ),
    "retry_sync": Transition(
        source={"FAILED_TO_SYNC"},
        target="SENT",  # placeholder; resolve_target picks the failed action's target
        permission=is_either_clinician,
        fhir_required=True,
        resolve_target=retry_target,
    ),
}

