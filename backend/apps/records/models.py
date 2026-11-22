from django.db import models
from apps.common.models import TimeStamped

class Encounter(TimeStamped):
    """
    Encounter model per BACKEND §4.6 / MASTERPLAN §7.
    """
    ENCOUNTER_TYPES = [
        ("outpatient", "Outpatient Consultation"),
        ("emergency", "Emergency Department"),
        ("inpatient", "Inpatient Admission"),
        ("teleconsult", "Teleconsultation"),
    ]

    patient = models.ForeignKey("identity.Patient", on_delete=models.CASCADE, related_name="encounters")
    facility = models.ForeignKey("organizations.Facility", on_delete=models.CASCADE, related_name="encounters")
    practitioner = models.ForeignKey(
        "organizations.Practitioner",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="encounters",
    )
    period_start = models.DateTimeField(db_index=True)
    period_end = models.DateTimeField(null=True, blank=True)
    encounter_type = models.CharField(max_length=50, choices=ENCOUNTER_TYPES, default="outpatient")
    reason = models.TextField(blank=True)
    fhir_id = models.CharField(max_length=100, blank=True, null=True, db_index=True)
    fhir_version = models.CharField(max_length=50, blank=True, null=True)
    fhir_sync_status = models.CharField(max_length=20, default="NOT_REQUIRED")

    class Meta:
        ordering = ["-period_start"]

    def __str__(self):
        return f"Encounter({self.public_id}, patient={self.patient_id}, type={self.encounter_type})"


class ClinicalObservation(TimeStamped):
    """
    Local index/cache for Observation records per BACKEND §4.6.
    """
    encounter = models.ForeignKey(Encounter, on_delete=models.CASCADE, related_name="observations")
    patient = models.ForeignKey("identity.Patient", on_delete=models.CASCADE, related_name="observations")
    code = models.CharField(max_length=100)  # LOINC or local code
    display_name = models.CharField(max_length=255)
    value_string = models.CharField(max_length=255, blank=True)
    value_numeric = models.FloatField(null=True, blank=True)
    unit = models.CharField(max_length=50, blank=True)
    observed_date = models.DateTimeField(null=True, blank=True)
    fhir_id = models.CharField(max_length=100, blank=True, null=True, db_index=True)

    class Meta:
        ordering = ["-observed_date"]

    def __str__(self):
        return f"Observation({self.code}: {self.value_string or self.value_numeric} {self.unit})"
