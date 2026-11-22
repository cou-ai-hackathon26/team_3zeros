from datetime import timedelta
from django.db import models
from django.conf import settings
from django.utils import timezone
from apps.common.models import TimeStamped

class Area(TimeStamped):
    """
    Hierarchical administrative area (division -> district -> upazila) per BACKEND §4.3.
    """
    LEVEL_CHOICES = [
        ("division", "Division"),
        ("district", "District"),
        ("upazila", "Upazila"),
    ]

    level = models.CharField(max_length=20, choices=LEVEL_CHOICES)
    parent = models.ForeignKey(
        "self",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="children",
    )
    name_en = models.CharField(max_length=100)
    name_bn = models.CharField(max_length=100)
    code = models.CharField(max_length=50, blank=True)

    class Meta:
        ordering = ["level", "name_en"]

    def __str__(self):
        return f"{self.name_en} ({self.name_bn}) [{self.level}]"


class Specialty(TimeStamped):
    """
    Clinical specialty per BACKEND §4.3.
    """
    code = models.CharField(max_length=50, unique=True, db_index=True)
    name_en = models.CharField(max_length=100)
    name_bn = models.CharField(max_length=100)

    class Meta:
        verbose_name_plural = "Specialties"
        ordering = ["name_en"]

    def __str__(self):
        return f"{self.name_en} ({self.name_bn})"


class Service(TimeStamped):
    """
    Facility service offering (e.g. ICU, Emergency, Ultrasound) per BACKEND §4.3.
    """
    facility = models.ForeignKey(
        "organizations.Facility",
        on_delete=models.CASCADE,
        related_name="services",
    )
    code = models.CharField(max_length=50)
    name = models.CharField(max_length=100)
    name_bn = models.CharField(max_length=100, blank=True)

    class Meta:
        unique_together = ("facility", "code")

    def __str__(self):
        return f"{self.name} at {self.facility.name}"


class CapacityReport(TimeStamped):
    """
    Capacity report per MASTERPLAN INV-14 and BACKEND §4.3.
    Always includes reported_at timestamp and source; computed is_stale.
    """
    facility = models.ForeignKey(
        "organizations.Facility",
        on_delete=models.CASCADE,
        related_name="capacity_reports",
    )
    service = models.ForeignKey(
        Service,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="capacity_reports",
    )
    reported_value = models.JSONField(default=dict)
    reported_at = models.DateTimeField(auto_now_add=True, db_index=True)
    reported_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
    )
    source = models.CharField(max_length=50, default="manual")

    class Meta:
        ordering = ["-reported_at"]

    @property
    def is_stale(self) -> bool:
        # Default stale threshold: 6 hours (configurable per Q-08)
        threshold = timezone.now() - timedelta(hours=6)
        return self.reported_at < threshold

