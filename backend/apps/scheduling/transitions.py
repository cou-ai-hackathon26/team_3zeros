from apps.accounts.selectors import active_memberships
from apps.workflow.engine import Transition, is_system

def is_patient_owner(actor, obj, payload):
    if not actor or not actor.is_authenticated:
        return False
    if hasattr(actor, "patient_account"):
        return actor.patient_account.patient == obj.patient
    return False

def is_clinician_or_staff(actor, obj, payload):
    """§4.2: a clinician, or facility staff holding `schedule.manage`, at the appointment's facility. Platform admins and
    facility admins have no appointment actions. Only active memberships count."""
    if not actor or not actor.is_authenticated:
        return False
    return any(
        m.role == "clinician" or (m.role == "facility_staff" and "schedule.manage" in (m.permissions or []))
        for m in active_memberships(actor).filter(facility=obj.facility)
    )

def is_clinician(actor, obj, payload):
    if not actor or not actor.is_authenticated:
        return False
    return active_memberships(actor).filter(facility=obj.facility, role="clinician").exists()

def is_patient_or_staff(actor, obj, payload):
    return is_patient_owner(actor, obj, payload) or is_clinician_or_staff(actor, obj, payload)

def guard_require_decline_reason(actor, obj, payload):
    if not payload or not payload.get("reason"):
        return False, "A decline reason is required."
    return True, None

def guard_require_alternate_slot(actor, obj, payload):
    if not payload or not payload.get("alternate_slot_id"):
        return False, "An alternate_slot_id is required."
    return True, None

APPOINTMENT_TRANSITIONS = {
    "accept": Transition(
        source={"REQUESTED", "PATIENT_ACCEPTED"},
        target="CONFIRMED",
        permission=is_clinician_or_staff,
    ),
    "decline": Transition(
        source={"REQUESTED", "PATIENT_ACCEPTED"},
        target="DECLINED",
        permission=is_clinician_or_staff,
        requires=[guard_require_decline_reason],
    ),
    "propose_alternate": Transition(
        source={"REQUESTED"},
        target="ALTERNATE_SLOT_PROPOSED",
        permission=is_clinician_or_staff,
        requires=[guard_require_alternate_slot],
    ),
    "patient_accept": Transition(
        source={"ALTERNATE_SLOT_PROPOSED"},
        target="PATIENT_ACCEPTED",
        permission=is_patient_owner,
    ),
    "patient_decline": Transition(
        source={"ALTERNATE_SLOT_PROPOSED"},
        target="CANCELLED",
        permission=is_patient_owner,
    ),
    "expire": Transition(
        source={"REQUESTED", "ALTERNATE_SLOT_PROPOSED", "PATIENT_ACCEPTED"},
        target="EXPIRED",
        permission=is_system,  # system job only (Q-04 policy)
    ),
    "cancel": Transition(
        source={"REQUESTED", "ALTERNATE_SLOT_PROPOSED", "PATIENT_ACCEPTED", "CONFIRMED"},
        target="CANCELLED",
        permission=is_patient_or_staff,
    ),
    "complete": Transition(
        source={"CONFIRMED"},
        target="COMPLETED",
        permission=is_clinician,
    ),
    "mark_no_show": Transition(
        source={"CONFIRMED"},
        target="NO_SHOW",
        permission=is_clinician_or_staff,
    ),
}

