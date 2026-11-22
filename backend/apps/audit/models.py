import uuid
from django.db import models
from django.conf import settings

class AuditEvent(models.Model):
    """
    Append-only audit log per MASTERPLAN §4.9, §12.
    Tracks every access to patient data, state transitions, authentication events,
    and administrative actions.
    """
    ACTION_CHOICES = [
        ("read", "Read"),
        ("create", "Create"),
        ("update", "Update"),
        ("transition", "Transition"),
        ("export", "Export"),
        ("share", "Share"),
        ("download", "Download"),
        ("break_glass", "Break Glass"),
        ("login", "Login"),
        ("login_failed", "Login Failed"),
    ]

    id = models.BigAutoField(primary_key=True)
    at = models.DateTimeField(auto_now_add=True, db_index=True)
    actor_user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="audit_events",
    )
    actor_role = models.CharField(max_length=50, blank=True)
    actor_facility = models.CharField(max_length=100, blank=True)
    action = models.CharField(max_length=30, choices=ACTION_CHOICES, db_index=True)
    object_type = models.CharField(max_length=100, db_index=True)
    object_id = models.CharField(max_length=100, db_index=True)
    patient_id = models.CharField(max_length=100, blank=True, null=True, db_index=True)
    outcome = models.CharField(max_length=20, default="success")  # success | failure
    reason = models.TextField(blank=True)
    request_id = models.CharField(max_length=64, blank=True, db_index=True)
    ip = models.GenericIPAddressField(null=True, blank=True)
    user_agent_hash = models.CharField(max_length=64, blank=True)

    class Meta:
        ordering = ["-at"]

    def __str__(self):
        return f"AuditEvent({self.action} on {self.object_type}:{self.object_id} by {self.actor_user_id})"
