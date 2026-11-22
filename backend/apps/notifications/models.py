from django.db import models
from django.conf import settings
from apps.common.models import TimeStamped

class Notification(TimeStamped):
    CHANNEL_CHOICES = [
        ("in_app", "In-App"),
        ("sms", "SMS"),
        ("email", "Email"),
    ]

    STATE_CHOICES = [
        ("PENDING", "Pending"),
        ("SENT", "Sent"),
        ("READ", "Read"),
    ]

    recipient = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="notifications",
    )
    type = models.CharField(max_length=100, db_index=True)
    title = models.CharField(max_length=255)
    body = models.TextField()
    object_ref = models.UUIDField(null=True, blank=True)
    channel = models.CharField(max_length=20, choices=CHANNEL_CHOICES, default="in_app")
    state = models.CharField(max_length=20, choices=STATE_CHOICES, default="PENDING", db_index=True)
    sent_at = models.DateTimeField(null=True, blank=True)
    read_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"Notification({self.type} to user={self.recipient_id})"
