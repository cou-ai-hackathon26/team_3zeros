from django.db import models
from apps.common.models import TimeStamped

class FhirIndex(TimeStamped):
    """
    Index row per BACKEND §4.6 / §5.4.
    Points to canonical HAPI FHIR resource for listing and permission filtering without duplicating full clinical JSON.
    """
    resource_type = models.CharField(max_length=50, db_index=True)
    fhir_id = models.CharField(max_length=100, db_index=True)
    version = models.CharField(max_length=20, default="1")
    patient = models.ForeignKey("identity.Patient", on_delete=models.CASCADE, related_name="fhir_indices")
    encounter = models.ForeignKey("records.Encounter", on_delete=models.SET_NULL, null=True, blank=True, related_name="fhir_indices")

    class Meta:
        unique_together = ("resource_type", "fhir_id")
        indexes = [
            models.Index(fields=["resource_type", "patient"]),
        ]

    def __str__(self):
        return f"FhirIndex({self.resource_type}/{self.fhir_id})"
