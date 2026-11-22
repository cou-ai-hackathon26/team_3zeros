from django.db import models
from django.conf import settings
from apps.common.models import TimeStamped

class Patient(TimeStamped):
    """
    Patient identity model per BACKEND §4.2 / MASTERPLAN §7.
    """
    SEX_CHOICES = [
        ("male", "Male"),
        ("female", "Female"),
        ("other", "Other"),
        ("unknown", "Unknown"),
    ]

    given_name = models.CharField(max_length=150)
    family_name = models.CharField(max_length=150, blank=True)
    name_bn = models.CharField(max_length=255, blank=True)
    birth_date = models.DateField(null=True, blank=True)
    estimated_age = models.PositiveIntegerField(null=True, blank=True)
    sex = models.CharField(max_length=10, choices=SEX_CHOICES, default="unknown")
    phone = models.CharField(max_length=20, null=True, blank=True, db_index=True)
    area = models.ForeignKey(
        "directory.Area",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="patients",
    )
    fhir_id = models.CharField(max_length=100, blank=True, null=True, db_index=True)
    fhir_version = models.CharField(max_length=50, blank=True, null=True)

    class Meta:
        ordering = ["family_name", "given_name"]

    def __str__(self):
        full_name = f"{self.given_name} {self.family_name}".strip()
        return f"{full_name} ({self.public_id})"


class PatientIdentifier(TimeStamped):
    """
    National IDs, birth registration, or facility MRN per BACKEND §4.2.
    """
    SYSTEM_CHOICES = [
        ("nid", "National ID"),
        ("birth_reg", "Birth Registration"),
        ("health_id", "National Health ID"),
        ("facility_mrn", "Facility Medical Record Number"),
    ]

    patient = models.ForeignKey(Patient, on_delete=models.CASCADE, related_name="identifiers")
    system = models.CharField(max_length=50, choices=SYSTEM_CHOICES)
    value = models.CharField(max_length=100, db_index=True)
    verified = models.BooleanField(default=False)

    class Meta:
        unique_together = ("system", "value")

    def __str__(self):
        return f"{self.system}:{self.value}"


class DuplicateCandidate(TimeStamped):
    """
    Candidate duplicate identity per MASTERPLAN INV-13 and BACKEND §4.2.
    Merging is always a separate, audited, human-triggered operation.
    """
    STATUS_CHOICES = [
        ("open", "Open"),
        ("same_person", "Confirmed Same Person"),
        ("different", "Confirmed Different"),
    ]

    patient_a = models.ForeignKey(Patient, on_delete=models.CASCADE, related_name="duplicates_as_a")
    patient_b = models.ForeignKey(Patient, on_delete=models.CASCADE, related_name="duplicates_as_b")
    score = models.FloatField()
    reasons = models.JSONField(default=list)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="open")
    resolved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="resolved_duplicates",
    )
    resolved_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-score"]

    def __str__(self):
        return f"DuplicateCandidate({self.patient_a.public_id} <-> {self.patient_b.public_id}, score={self.score})"
