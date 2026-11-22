from .models import AuditEvent

def record_audit_event(
    action: str,
    object_type: str,
    object_id: str,
    actor_user=None,
    actor_role: str = "",
    actor_facility: str = "",
    patient_id: str = None,
    outcome: str = "success",
    reason: str = "",
    request_id: str = "",
    ip: str = None,
    user_agent_hash: str = "",
) -> AuditEvent:
    """Helper to record an immutable AuditEvent."""
    return AuditEvent.objects.create(
        action=action,
        object_type=object_type,
        object_id=str(object_id),
        actor_user=actor_user if getattr(actor_user, "is_authenticated", False) else None,
        actor_role=actor_role,
        actor_facility=actor_facility,
        patient_id=str(patient_id) if patient_id else None,
        outcome=outcome,
        reason=reason,
        request_id=request_id,
        ip=ip,
        user_agent_hash=user_agent_hash,
    )

