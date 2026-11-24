import uuid
from django.db import models
from apps.common.models import TimeStamped

class RuleSet(TimeStamped):
    version = models.CharField(max_length=50, unique=True)
    status = models.CharField(max_length=20, default="approved")  # draft | approved | retired
    approved_by = models.CharField(max_length=255, default="Clinician Review Board")
    approved_at = models.DateTimeField(auto_now_add=True)
    rules = models.JSONField(default=list)

    def __str__(self):
        return f"RuleSet(v{self.version}, {self.status})"


class TriageSession(TimeStamped):
    """
    TriageSession model per MASTERPLAN §5.3 / BACKEND §4.5, §8.
    """
    STATE_CHOICES = [
        ("CREATED", "Created"),
        ("ACTIVE", "Active"),
        ("PAUSED", "Paused"),
        ("EMERGENCY_PATHWAY", "Emergency Pathway"),
        ("SUMMARY_PENDING_REVIEW", "Summary Pending Review"),
        ("CONFIRMED_BY_PATIENT", "Confirmed by Patient"),
        ("ENDED_BY_PATIENT", "Ended by Patient"),
        ("ABANDONED", "Abandoned"),
    ]

    patient = models.ForeignKey(
        "identity.Patient",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="triage_sessions",
    )
    language = models.CharField(max_length=5, default="bn")  # bn | en
    mode = models.CharField(max_length=10, default="text")   # voice | text
    triage_disclosure_version = models.CharField(max_length=50)
    triage_disclosure_accepted_at = models.DateTimeField()
    state = models.CharField(max_length=30, choices=STATE_CHOICES, default="CREATED", db_index=True)
    ruleset_version = models.CharField(max_length=50, default="1.0.0")
    kb_version = models.CharField(max_length=50, default="1.0.0")
    model_version = models.CharField(max_length=50, default="v1")
    provider = models.CharField(max_length=50, default="internal")
    provider_session_ref = models.CharField(max_length=100, default=uuid.uuid4)
    started_at = models.DateTimeField(auto_now_add=True)
    ended_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-started_at"]

    def __str__(self):
        return f"TriageSession({self.public_id}, {self.state}, {self.language})"


class Turn(TimeStamped):
    session = models.ForeignKey(TriageSession, on_delete=models.CASCADE, related_name="turns")
    role = models.CharField(max_length=20)  # patient | assistant | system
    text = models.TextField()
    language_detected = models.CharField(max_length=10, default="bn")
    red_flag_hits = models.JSONField(default=list, blank=True)
    passage_ids = models.JSONField(default=list, blank=True)  # knowledge passages shown to the model for this reply (BACKEND §4.5)
    response_policy = models.CharField(max_length=30, default="question")  # grounded | declined | emergency | question
    at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["at"]

    def __str__(self):
        return f"Turn({self.role} in {self.session_id})"


class TriageSummary(TimeStamped):
    session = models.OneToOneField(TriageSession, on_delete=models.CASCADE, related_name="summary")
    patient_words = models.TextField(blank=True)
    structured_fields = models.JSONField(default=dict)
    guidance_given = models.TextField(blank=True)
    patient_confirmed_at = models.DateTimeField(null=True, blank=True)
    patient_edits = models.JSONField(default=dict, blank=True)

    def __str__(self):
        return f"TriageSummary for {self.session_id}"

