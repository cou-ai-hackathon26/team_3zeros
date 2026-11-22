"""Triage session transitions, mirroring MASTERPLAN §5.3."""
from apps.workflow.engine import Transition, is_system

OPEN_STATES = {"CREATED", "ACTIVE", "PAUSED", "SUMMARY_PENDING_REVIEW"}


def is_session_patient(actor, obj, payload):
    """The session's patient. Guest sessions (no patient, Q-03) are controlled by
    whoever holds the unguessable session ID, so any caller may act on them."""
    if obj.patient_id is None:
        return True
    account = getattr(actor, "patient_account", None) if actor and getattr(actor, "is_authenticated", False) else None
    return account is not None and account.patient_id == obj.patient_id


def is_session_patient_or_system(actor, obj, payload):
    return is_system(actor, obj, payload) or is_session_patient(actor, obj, payload)


TRIAGE_TRANSITIONS = {
    "connect": Transition(source={"CREATED"}, target="ACTIVE", permission=is_system),
    "pause": Transition(source={"ACTIVE"}, target="PAUSED", permission=is_session_patient_or_system),
    "resume": Transition(source={"PAUSED"}, target="ACTIVE", permission=is_session_patient),
    "red_flag": Transition(source={"ACTIVE", "PAUSED"}, target="EMERGENCY_PATHWAY", permission=is_system),
    "finish_questions": Transition(
        source={"ACTIVE"}, target="SUMMARY_PENDING_REVIEW", permission=is_session_patient_or_system
    ),
    "confirm_summary": Transition(
        source={"SUMMARY_PENDING_REVIEW"}, target="CONFIRMED_BY_PATIENT", permission=is_session_patient
    ),
    "end": Transition(source=OPEN_STATES, target="ENDED_BY_PATIENT", permission=is_session_patient),
    "abandon": Transition(source=OPEN_STATES, target="ABANDONED", permission=is_system),
}
