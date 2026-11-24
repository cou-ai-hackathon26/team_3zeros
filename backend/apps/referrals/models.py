import random
import string
import hashlib
import json
from django.db import models
from django.conf import settings
from apps.common.models import TimeStamped

# Crockford Base32 alphabet (no I, L, O, U to avoid confusion)
CROCKFORD_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"

def generate_reference_code(length=8) -> str:
    return "".join(random.choices(CROCKFORD_ALPHABET, k=length))

def compute_content_hash(summary: dict, record_refs: list = None) -> str:
    canonical = {
        "summary": summary or {},
        "record_refs": sorted(record_refs or []),
    }
    dumped = json.dumps(canonical, sort_keys=True)
    return hashlib.sha256(dumped.encode("utf-8")).hexdigest()


class Referral(TimeStamped):
    """
    Referral model per MASTERPLAN §5.2, §7 / BACKEND §4.8.
    """
    STATE_CHOICES = [
        ("DRAFT", "Draft"),
        ("AWAITING_PATIENT_CONSENT", "Awaiting Patient Consent"),
        ("READY_FOR_SENDER_APPROVAL", "Ready for Sender Approval"),
        ("APPROVED_BY_SENDER", "Approved by Sender"),
        ("SENT", "Sent"),
        ("ESCALATED", "Escalated"),
        ("ACKNOWLEDGED_BY_RECEIVER", "Acknowledged by Receiver"),
        ("IN_PROGRESS", "In Progress"),
        ("OUTCOME_RECORDED", "Outcome Recorded"),
        ("OUTCOME_RETURNED", "Outcome Returned"),
        ("CLOSED", "Closed"),
        ("DECLINED", "Declined"),
        ("CANCELLED", "Cancelled"),
        ("EXPIRED", "Expired"),
        ("FAILED_TO_SYNC", "Failed to Sync"),
    ]

    URGENCY_CHOICES = [
        ("routine", "Routine"),
        ("urgent", "Urgent"),
        ("emergency", "Emergency"),
    ]

    patient = models.ForeignKey("identity.Patient", on_delete=models.CASCADE, related_name="referrals")
    encounter = models.ForeignKey("records.Encounter", on_delete=models.SET_NULL, null=True, blank=True, related_name="referrals")
    sender_practitioner = models.ForeignKey("organizations.Practitioner", on_delete=models.CASCADE, null=True, blank=True, related_name="sent_referrals")  # empty for emergency referrals sent by staff
    sender_facility = models.ForeignKey("organizations.Facility", on_delete=models.CASCADE, related_name="sent_referrals")
    receiver_facility = models.ForeignKey("organizations.Facility", on_delete=models.CASCADE, related_name="received_referrals")
    receiver_practitioner = models.ForeignKey(
        "organizations.Practitioner",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="received_referrals",
    )
    urgency = models.CharField(max_length=20, choices=URGENCY_CHOICES, default="routine", db_index=True)
    emergency_mode = models.BooleanField(default=False, db_index=True)
    reason = models.TextField()
    state = models.CharField(max_length=30, choices=STATE_CHOICES, default="DRAFT", db_index=True)
    pending_action = models.CharField(max_length=50, null=True, blank=True)
    pending_since = models.DateTimeField(null=True, blank=True)
    summary = models.JSONField(default=dict, blank=True)
    content_hash = models.CharField(max_length=64, blank=True)
    summary_origin = models.CharField(max_length=30, default="manual")
    consent = models.ForeignKey(
        "consent.Consent",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="referrals",
    )
    # The consent request currently awaiting the patient's decision (MASTERPLAN §5.6).
    consent_request = models.OneToOneField(
        "consent.ConsentRequest",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="referral",
    )
    reference_code = models.CharField(max_length=12, unique=True, default=generate_reference_code, db_index=True)
    provisional_code = models.CharField(max_length=50, null=True, blank=True, db_index=True)
    outcome = models.JSONField(default=dict, blank=True)
    decline_reason = models.TextField(blank=True)
    sent_at = models.DateTimeField(null=True, blank=True)
    acknowledged_at = models.DateTimeField(null=True, blank=True)
    escalated_at = models.DateTimeField(null=True, blank=True)
    fhir_service_request_id = models.CharField(max_length=100, blank=True, null=True)
    fhir_task_id = models.CharField(max_length=100, blank=True, null=True)
    fhir_sync_status = models.CharField(max_length=20, default="NOT_REQUIRED")

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"Referral({self.reference_code}, {self.state}, urgency={self.urgency})"


class EmergencyReferral(TimeStamped):
    """
    Five-field minimum emergency referral extension per MASTERPLAN INV-16, §6.3, §7 / BACKEND §4.8, §13.
    """
    referral = models.OneToOneField(Referral, on_delete=models.CASCADE, related_name="emergency_details")
    idempotency_key = models.UUIDField(unique=True, db_index=True)
    created_at_device = models.DateTimeField()
    unverified_identity_description = models.TextField(blank=True)
    vitals = models.JSONField(default=dict)
    treatment_given = models.TextField(blank=True)

    def __str__(self):
        return f"EmergencyReferral({self.idempotency_key} for {self.referral.reference_code})"


class ReferralDraftVersion(TimeStamped):
    referral = models.ForeignKey(Referral, on_delete=models.CASCADE, related_name="draft_versions")
    version_number = models.PositiveIntegerField()
    summary = models.JSONField()
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
    )
    origin = models.CharField(max_length=30, default="clinician_edit")

    class Meta:
        ordering = ["version_number"]

    def __str__(self):
        return f"DraftVersion({self.referral.reference_code} v{self.version_number})"

