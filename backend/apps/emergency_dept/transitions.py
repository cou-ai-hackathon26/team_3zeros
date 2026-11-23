from apps.workflow.engine import Transition

def has_ed_manage_permission(actor, obj, payload):
    if not actor or not actor.is_authenticated:
        return False
    if hasattr(actor, "platform_admin") or getattr(actor, "is_platform_admin", False):
        return True
    facility = getattr(obj, "facility", None)
    if not facility:
        return False
    memberships = actor.memberships.filter(facility=facility)
    for m in memberships:
        if m.role in ("clinician", "facility_admin"):
            return True
        if m.role == "facility_staff" and "ed.manage" in (m.permissions or []):
            return True
    return False

ED_VISIT_TRANSITIONS = {
    "triage": Transition(
        source={"ARRIVED"},
        target="TRIAGED",
        permission=has_ed_manage_permission,
    ),
    "start_care": Transition(
        source={"ARRIVED", "TRIAGED"},
        target="UNDER_CARE",
        permission=has_ed_manage_permission,
    ),
    "admit": Transition(
        source={"TRIAGED", "UNDER_CARE"},
        target="ADMITTED",
        permission=has_ed_manage_permission,
    ),
    "discharge": Transition(
        source={"UNDER_CARE"},
        target="DISCHARGED",
        permission=has_ed_manage_permission,
    ),
    "transfer": Transition(
        source={"ARRIVED", "TRIAGED", "UNDER_CARE"},
        target="TRANSFERRED",
        permission=has_ed_manage_permission,
    ),
    "mark_left": Transition(
        source={"ARRIVED", "TRIAGED", "UNDER_CARE"},
        target="LEFT",
        permission=has_ed_manage_permission,
    ),
    "mark_died": Transition(
        source={"ARRIVED", "TRIAGED", "UNDER_CARE"},
        target="DIED",
        permission=has_ed_manage_permission,
    ),
}

