from django.db import models
from django.conf import settings

class OutboxEvent(models.Model):
    """
    Outbox event table per MASTERPLAN §4.9, §7.1.
    Written atomically with state mutations and delivered asynchronously by Celery outbox dispatcher.
    """
    id = models.BigAutoField(primary_key=True)
    aggregate_type = models.CharField(max_length=50, db_index=True)
    aggregate_id = models.UUIDField(db_index=True)
    event_type = models.CharField(max_length=100, db_index=True)
    payload = models.JSONField(default=dict)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    dispatched_at = models.DateTimeField(null=True, blank=True, db_index=True)
    attempts = models.PositiveIntegerField(default=0)
    last_error = models.TextField(blank=True)

    class Meta:
        ordering = ["created_at"]

    def __str__(self):
        return f"OutboxEvent({self.event_type} on {self.aggregate_type}:{self.aggregate_id})"


class HistoryEntry(models.Model):
    """
    Tracks state machine transition history for stateful entities.
    """
    id = models.BigAutoField(primary_key=True)
    aggregate_type = models.CharField(max_length=50, db_index=True)
    aggregate_id = models.UUIDField(db_index=True)
    from_state = models.CharField(max_length=50)
    to_state = models.CharField(max_length=50)
    action = models.CharField(max_length=50)
    actor_user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
    )
    actor_role = models.CharField(max_length=50, blank=True)
    reason = models.TextField(blank=True)
    at = models.DateTimeField(auto_now_add=True, db_index=True)
    extra_data = models.JSONField(default=dict, blank=True)

    class Meta:
        ordering = ["at"]

    def __str__(self):
        return f"HistoryEntry({self.action}: {self.from_state} -> {self.to_state} on {self.aggregate_id})"

