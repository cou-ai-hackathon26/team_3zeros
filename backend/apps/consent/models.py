from django.db import models
from apps.common.models import TimeStamped

class ConsentRequest(TimeStamped):
    """
    Consent request per MASTERPLAN §5.6 / BACKEND §4.8.
    States: PENDING | GRANTED | REFUSED | EXPIRED | SUPERSEDED
    """
    STATE_CHOICES = [
        ("PENDING", "Pending"),
        ("GRANTED", "Granted"),
        ("REFUSED", "Refused"),
        ("EXPIRED", "Expired"),
        ("SUPERSEDED", "Superseded"),
    ]

    patient = models.ForeignKey("identity.Patient", on_delete=models.CASCADE, related_name="consent_requests")
    recipient_facility = models.ForeignKey("organizations.Facility", on_delete=models.CASCADE, related_name="received_consent_requests")
    recipient_practitioner = models.ForeignKey(
        "organizations.Practitioner",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="received_consent_requests",
    )
    purpose = models.CharField(max_length=100, default="referral_treatment")
    categories = models.JSONField(default=list)  # e.g. ["demographics", "observations", "conditions"]
    content_hash = models.CharField(max_length=64)  # SHA-256 of referral content
    state = models.CharField(max_length=20, choices=STATE_CHOICES, default="PENDING", db_index=True)
    expires_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"ConsentRequest({self.public_id}, {self.state}, patient={self.patient_id})"


class Consent(TimeStamped):
    """
    Active or revoked patient consent per MASTERPLAN §5.6, §7 / BACKEND §4.8.
    States: ACTIVE | REVOKED | EXPIRED
    """
    STATE_CHOICES = [
        ("ACTIVE", "Active"),
        ("REVOKED", "Revoked"),
        ("EXPIRED", "Expired"),
    ]

    request = models.OneToOneField(
        ConsentRequest,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="granted_consent",
    )
    patient = models.ForeignKey("identity.Patient", on_delete=models.CASCADE, related_name="consents")
    recipient_facility = models.ForeignKey("organizations.Facility", on_delete=models.CASCADE, related_name="active_consents")
    recipient_practitioner = models.ForeignKey(
        "organizations.Practitioner",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="active_consents",
    )
    purpose = models.CharField(max_length=100)
    categories = models.JSONField(default=list)
    content_hash = models.CharField(max_length=64)
    method = models.CharField(max_length=30, default="web_app")  # web_app | assisted_web_app
    verification_context = models.JSONField(default=dict, blank=True)
    state = models.CharField(max_length=20, choices=STATE_CHOICES, default="ACTIVE", db_index=True)
    revoked_at = models.DateTimeField(null=True, blank=True)
    fhir_id = models.CharField(max_length=100, blank=True, null=True, db_index=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"Consent({self.public_id}, {self.state}, patient={self.patient_id})"
