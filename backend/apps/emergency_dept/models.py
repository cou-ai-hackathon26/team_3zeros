import uuid
from django.db import models
from django.conf import settings
from django.utils import timezone
from apps.common.models import TimeStamped
from .transitions import ED_VISIT_TRANSITIONS

class EDVisit(TimeStamped):
    STATES = [
        ("ARRIVED", "Arrived"),
        ("TRIAGED", "Triaged"),
        ("UNDER_CARE", "Under Care"),
        ("ADMITTED", "Admitted"),
        ("DISCHARGED", "Discharged"),
        ("TRANSFERRED", "Transferred"),
        ("LEFT", "Left Without Being Seen / AMA"),
        ("DIED", "Died"),
    ]

    TRIAGE_CATEGORIES = [
        ("RED", "Immediate (Priority 1)"),
        ("ORANGE", "Very Urgent (Priority 2)"),
        ("YELLOW", "Urgent (Priority 3)"),
        ("GREEN", "Standard (Priority 4)"),
        ("BLUE", "Non-urgent (Priority 5)"),
    ]

    ARRIVAL_MODES = [
        ("AMBULANCE", "Ambulance"),
        ("WALK_IN", "Walk-in"),
        ("POLICE", "Police / Escort"),
        ("REFERRAL", "Referral"),
        ("OTHER", "Other"),
    ]

    facility = models.ForeignKey(
        "organizations.Facility",
        on_delete=models.CASCADE,
        related_name="ed_visits",
    )
    patient = models.ForeignKey(
        "identity.Patient",
        on_delete=models.CASCADE,
        related_name="ed_visits",
    )
    encounter = models.ForeignKey(
        "records.Encounter",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="ed_visits",
    )
    state = models.CharField(
        max_length=30,
        choices=STATES,
        default="ARRIVED",
        db_index=True,
    )
    triage_category = models.CharField(
        max_length=20,
        choices=TRIAGE_CATEGORIES,
        null=True,
        blank=True,
    )
    chief_complaint = models.TextField()
    arrival_mode = models.CharField(
        max_length=20,
        choices=ARRIVAL_MODES,
        default="WALK_IN",
    )
    arrived_at = models.DateTimeField(default=timezone.now, db_index=True)
    triaged_at = models.DateTimeField(null=True, blank=True)
    triaged_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="triaged_ed_visits",
    )
    disposition_at = models.DateTimeField(null=True, blank=True)
    disposition_notes = models.TextField(blank=True)
    discharge_summary = models.TextField(blank=True)
    transfer_facility = models.ForeignKey(
        "organizations.Facility",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="transferred_in_ed_visits",
    )
    transfer_referral = models.ForeignKey(
        "referrals.Referral",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="ed_visits",
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="created_ed_visits",
    )
    pending_action = models.CharField(max_length=50, null=True, blank=True)
    fhir_sync_status = models.CharField(max_length=20, default="NOT_REQUIRED")

    TRANSITIONS = ED_VISIT_TRANSITIONS

    class Meta:
        ordering = ["-arrived_at"]

    def __str__(self):
        return f"EDVisit({self.public_id}, state={self.state}, facility={self.facility.name})"

