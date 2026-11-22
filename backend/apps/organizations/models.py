from django.db import models
from django.conf import settings
from apps.common.models import TimeStamped

class Facility(TimeStamped):
    """
    Facility model per MASTERPLAN §4 / BACKEND §4.3.
    """
    FACILITY_TYPES = [
        ("community_clinic", "Community Clinic"),
        ("union_subcenter", "Union Sub-Center"),
        ("upazila_health_complex", "Upazila Health Complex"),
        ("district_hospital", "District Hospital"),
        ("medical_college_hospital", "Medical College Hospital"),
        ("specialized_hospital", "Specialized Hospital"),
        ("private_clinic", "Private Clinic"),
        ("diagnostic_center", "Diagnostic Center"),
    ]

    name = models.CharField(max_length=255)
    name_bn = models.CharField(max_length=255)
    type = models.CharField(max_length=50, choices=FACILITY_TYPES)
    area = models.ForeignKey(
        "directory.Area",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="facilities",
    )
    address = models.TextField(blank=True)
    phone = models.CharField(max_length=50, blank=True)
    fhir_id = models.CharField(max_length=100, blank=True, null=True, db_index=True)

    class Meta:
        verbose_name_plural = "Facilities"
        ordering = ["name"]

    def __str__(self):
        return self.name


class Department(TimeStamped):
    facility = models.ForeignKey(Facility, on_delete=models.CASCADE, related_name="departments")
    name = models.CharField(max_length=255)
    name_bn = models.CharField(max_length=255, blank=True)

    def __str__(self):
        return f"{self.name} ({self.facility.name})"


class Practitioner(TimeStamped):
    """
    Practitioner per BACKEND §4.3.
    """
    registration_number = models.CharField(max_length=100, unique=True, db_index=True)  # BMDC ID
    name = models.CharField(max_length=255)
    name_bn = models.CharField(max_length=255, blank=True)
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="practitioner_profile",
    )
    fhir_id = models.CharField(max_length=100, blank=True, null=True, db_index=True)

    def __str__(self):
        return f"Dr. {self.name} ({self.registration_number})"


class PractitionerRole(TimeStamped):
    """
    Role linking Practitioner to Facility and Specialty.
    """
    practitioner = models.ForeignKey(Practitioner, on_delete=models.CASCADE, related_name="roles")
    facility = models.ForeignKey(Facility, on_delete=models.CASCADE, related_name="practitioner_roles")
    specialty = models.ForeignKey(
        "directory.Specialty",
        on_delete=models.CASCADE,
        related_name="practitioner_roles",
    )
    active = models.BooleanField(default=True)

    class Meta:
        unique_together = ("practitioner", "facility", "specialty")

    def __str__(self):
        return f"{self.practitioner.name} @ {self.facility.name} ({self.specialty.name_en})"
