from dataclasses import dataclass, field
from typing import Callable, List, Optional, Set, Any
from django.db import transaction
from django.contrib.auth import get_user_model
from apps.common.exceptions import (
    TransitionNotAllowedError,
    PermissionDeniedError,
    StaleVersionError,
    SyncPendingError,
)
from apps.audit.services import record_audit_event
from .models import OutboxEvent, HistoryEntry

@dataclass
class Transition:
    source: Set[str]
    target: str
    permission: Optional[Callable[[Any, Any, Any], bool]] = None
    requires: List[Any] = field(default_factory=list)
    fhir_required: bool = False
    on_fhir_failure: Optional[str] = None

def compute_allowed_actions(obj: Any, actor: Any) -> List[str]:
    """
    Computes which actions the given actor is permitted to perform on the object
    in its current state, without side effects.
    """
    table = getattr(obj, "TRANSITIONS", {})
    if not table:
        return []

    # If pending_action is set (e.g., FHIR sync pending), no other action is allowed
    if getattr(obj, "pending_action", None):
        return []

    current_state = getattr(obj, "state", None)
    allowed = []

    for action_name, transition in table.items():
        if current_state not in transition.source:
            continue
        if transition.permission and not transition.permission(actor, obj, None):
            continue
        # Check requirements/guards if any
        guards_passed = True
        for guard in transition.requires:
            if callable(guard):
                ok, _ = guard(actor, obj, None)
                if not ok:
                    guards_passed = False
                    break
            elif isinstance(guard, str):
                guard_fn = getattr(obj, f"guard_{guard}", None)
                if guard_fn:
                    ok, _ = guard_fn(actor, None)
                    if not ok:
                        guards_passed = False
                        break
        if guards_passed:
            allowed.append(action_name)

    return allowed


def execute_transition(
    obj: Any,
    action: str,
    actor: Any,
    payload: Optional[dict] = None,
    idempotency_key: Optional[str] = None,
    expected_version: Optional[int] = None,
    request_id: Optional[str] = None,
) -> tuple[Any, List[str]]:
    """
    Executes a state transition following MASTERPLAN §5 and BACKEND §6.2:
    1. Check expected_version against obj.version -> stale_version
    2. Check action in transition table & obj.state in source -> transition_not_allowed
    3. Check permission -> permission_denied
    4. Check requires guards -> transition_not_allowed
    5. Handle FHIR-gated transitions or apply target state
    6. Record HistoryEntry, AuditEvent, OutboxEvent in atomic transaction
    7. Return updated obj with allowed_actions
    """
    payload = payload or {}

    # 1. Optimistic concurrency check
    if expected_version is not None and getattr(obj, "version", None) != expected_version:
        raise StaleVersionError(
            f"Stale version: expected {expected_version}, but current version is {obj.version}."
        )

    # 2. Check pending FHIR actions
    if getattr(obj, "pending_action", None) and action != "retry_sync":
        raise SyncPendingError(
            f"Resource has a pending sync action '{obj.pending_action}'. Other actions are locked."
        )

    # 3. Lookup transition
    table = getattr(obj, "TRANSITIONS", {})
    if action not in table:
        raise TransitionNotAllowedError(
            f"Action '{action}' is not defined for {obj.__class__.__name__}."
        )

    transition: Transition = table[action]
    current_state = getattr(obj, "state", None)

    if current_state not in transition.source:
        raise TransitionNotAllowedError(
            f"Cannot perform action '{action}' from current state '{current_state}'."
        )

    # 4. Permission check
    if transition.permission and not transition.permission(actor, obj, payload):
        raise PermissionDeniedError(
            f"Actor does not have permission to execute '{action}' on {obj.__class__.__name__}."
        )

    # 5. Requires guards check
    for guard in transition.requires:
        if callable(guard):
            ok, err_msg = guard(actor, obj, payload)
            if not ok:
                raise TransitionNotAllowedError(err_msg or f"Guard check failed for action '{action}'.")
        elif isinstance(guard, str):
            guard_fn = getattr(obj, f"guard_{guard}", None)
            if guard_fn:
                ok, err_msg = guard_fn(actor, payload)
                if not ok:
                    raise TransitionNotAllowedError(err_msg or f"Guard '{guard}' failed.")

    old_state = current_state

    # 6. Apply state change inside atomic block
    with transaction.atomic():
        if transition.fhir_required:
            # FHIR-gated transition: mark pending_action & PENDING sync status
            obj.pending_action = action
            obj.fhir_sync_status = "PENDING"
            new_state = old_state  # stays until FHIR write succeeds
        else:
            new_state = transition.target
            obj.state = new_state
            obj.pending_action = None

        obj.save(increment_version=True)

        User = get_user_model()
        actor_user_instance = actor if isinstance(actor, User) and getattr(actor, "is_authenticated", False) else None

        # Record HistoryEntry
        HistoryEntry.objects.create(
            aggregate_type=obj._meta.model_name,
            aggregate_id=obj.public_id,
            from_state=old_state,
            to_state=new_state,
            action=action,
            actor_user=actor_user_instance,
            actor_role=getattr(actor, "current_role", "") if actor else "",
            reason=payload.get("reason", ""),
            extra_data={"payload": payload},
        )

        # Record AuditEvent
        patient_ref = getattr(obj, "patient_id", None) or getattr(getattr(obj, "patient", None), "public_id", None)
        record_audit_event(
            action="transition",
            object_type=obj._meta.model_name,
            object_id=str(obj.public_id),
            actor_user=actor_user_instance,
            actor_role=getattr(actor, "current_role", "") if actor else "",
            patient_id=str(patient_ref) if patient_ref else None,
            outcome="success",
            reason=payload.get("reason", ""),
            request_id=request_id or "",
        )

        # Record OutboxEvent
        OutboxEvent.objects.create(
            aggregate_type=obj._meta.model_name,
            aggregate_id=obj.public_id,
            event_type=f"{obj._meta.model_name}.state_changed",
            payload={
                "id": str(obj.public_id),
                "state": obj.state,
                "version": obj.version,
                "action": action,
            },
        )

    allowed_actions = compute_allowed_actions(obj, actor)
    return obj, allowed_actions
