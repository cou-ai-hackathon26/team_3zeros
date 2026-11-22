from django.db import models
from django.conf import settings
from apps.common.models import TimeStamped

class Schedule(TimeStamped):
    practitioner_role = models.ForeignKey(
        "organizations.PractitionerRole",
        on_delete=models.CASCADE,
        related_name="schedules",
    )
    recurrence_rules = models.JSONField(default=dict, blank=True)

    def __str__(self):
        return f"Schedule for {self.practitioner_role}"


class Slot(TimeStamped):
    """
    Slot model per MASTERPLAN §5.1 / BACKEND §4.4.
    States: AVAILABLE | HELD | BOOKED | BLOCKED
    """
    STATE_CHOICES = [
        ("AVAILABLE", "Available"),
        ("HELD", "Held"),
        ("BOOKED", "Booked"),
        ("BLOCKED", "Blocked"),
    ]

    schedule = models.ForeignKey(Schedule, on_delete=models.CASCADE, related_name="slots")
    start = models.DateTimeField(db_index=True)
    end = models.DateTimeField(db_index=True)
    state = models.CharField(max_length=20, choices=STATE_CHOICES, default="AVAILABLE", db_index=True)

    class Meta:
        ordering = ["start"]

    def __str__(self):
        return f"Slot({self.start} - {self.end}, {self.state})"


class Appointment(TimeStamped):
    """
    Appointment model per MASTERPLAN §5.1 / BACKEND §4.4.
    Enforces partial unique index on slot for active appointments.
    """
    STATE_CHOICES = [
        ("REQUESTED", "Requested"),
        ("CONFIRMED", "Confirmed"),
        ("ALTERNATE_SLOT_PROPOSED", "Alternate Slot Proposed"),
        ("PATIENT_ACCEPTED", "Patient Accepted"),
        ("DECLINED", "Declined"),
        ("EXPIRED", "Expired"),
        ("CANCELLED", "Cancelled"),
        ("COMPLETED", "Completed"),
        ("NO_SHOW", "No Show"),
    ]

    patient = models.ForeignKey("identity.Patient", on_delete=models.CASCADE, related_name="appointments")
    practitioner = models.ForeignKey("organizations.Practitioner", on_delete=models.CASCADE, related_name="appointments")
    facility = models.ForeignKey("organizations.Facility", on_delete=models.CASCADE, related_name="appointments")
    slot = models.ForeignKey(Slot, on_delete=models.PROTECT, related_name="appointments")
    original_slot = models.ForeignKey(
        Slot,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="alternate_appointments",
    )
    state = models.CharField(max_length=30, choices=STATE_CHOICES, default="REQUESTED", db_index=True)
    triage_session_id = models.UUIDField(null=True, blank=True)
    decline_reason = models.TextField(blank=True)
    expires_at = models.DateTimeField(null=True, blank=True)
    fhir_id = models.CharField(max_length=100, blank=True, null=True, db_index=True)
    fhir_sync_status = models.CharField(max_length=20, default="NOT_REQUIRED")
    pending_action = models.CharField(max_length=50, null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["slot"],
                condition=models.Q(state__in=["REQUESTED", "ALTERNATE_SLOT_PROPOSED", "PATIENT_ACCEPTED", "CONFIRMED"]),
                name="unique_active_appointment_per_slot",
            )
        ]

    def __str__(self):
        return f"Appointment({self.public_id}, {self.state}, patient={self.patient_id})"
