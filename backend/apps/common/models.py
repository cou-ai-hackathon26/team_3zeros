import uuid
from django.db import models
from django.conf import settings

class TimeStamped(models.Model):
    """
    Base model for all stateful/audited entities.
    Provides BigAutoField internally, public_id (UUIDv4) exposed externally,
    created_at, updated_at, and version counter for optimistic locking (If-Match).
    """
    public_id = models.UUIDField(default=uuid.uuid4, unique=True, editable=False, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)
    version = models.PositiveIntegerField(default=1)

    class Meta:
        abstract = True

    def save(self, *args, increment_version=True, **kwargs):
        if self.pk and increment_version:
            self.version += 1
        super().save(*args, **kwargs)


class IdempotencyRecord(models.Model):
    """
    Stores request hash and response for idempotent mutations.
    Enforces that repeated requests with the same key replay the exact response,
    or fail with idempotency_conflict if the request body differs.
    """
    key = models.UUIDField(db_index=True)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, null=True, blank=True)
    endpoint = models.CharField(max_length=255)
    request_hash = models.CharField(max_length=64)
    response_status = models.IntegerField()
    response_body = models.JSONField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["key", "endpoint"],
                name="unique_idempotency_key_endpoint"
            )
        ]

    def __str__(self):
        return f"IdempotencyRecord(key={self.key}, endpoint={self.endpoint}, status={self.response_status})"
