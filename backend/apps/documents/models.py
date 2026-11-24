from django.db import models
from django.conf import settings
from apps.common.models import TimeStamped

class Document(TimeStamped):
    """
    Document model per MASTERPLAN §5.4 / BACKEND §4.7, §9.
    Original file is immutable in every state.
    """
    STATE_CHOICES = [
        ("UPLOADED", "Uploaded"),
        ("OCR_QUEUED", "OCR Queued"),
        ("OCR_RUNNING", "OCR Running"),
        ("EXTRACTED_UNVERIFIED", "Extracted Unverified"),
        ("OCR_FAILED", "OCR Failed"),
        ("VERIFIED", "Verified"),
        ("REJECTED", "Rejected"),
        ("QUARANTINED", "Quarantined"),
    ]

    patient = models.ForeignKey("identity.Patient", on_delete=models.CASCADE, related_name="documents")
    encounter = models.ForeignKey("records.Encounter", on_delete=models.SET_NULL, null=True, blank=True, related_name="documents")
    uploaded_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True)
    storage_key = models.CharField(max_length=255, unique=True)
    original_filename = models.CharField(max_length=255)
    content_type = models.CharField(max_length=100)
    size = models.PositiveIntegerField()
    sha256 = models.CharField(max_length=64)
    state = models.CharField(max_length=30, choices=STATE_CHOICES, default="UPLOADED", db_index=True)
    fhir_document_reference_id = models.CharField(max_length=100, blank=True, null=True)
    # FHIR-gated `verify` (MASTERPLAN §5.8): state stays until the FHIR write succeeds.
    pending_action = models.CharField(max_length=50, null=True, blank=True)
    fhir_sync_status = models.CharField(max_length=20, default="NOT_REQUIRED")

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"Document({self.public_id}, {self.original_filename}, {self.state})"


class ExtractionJob(TimeStamped):
    document = models.ForeignKey(Document, on_delete=models.CASCADE, related_name="extraction_jobs")
    engine = models.CharField(max_length=50, default="tesseract")
    engine_version = models.CharField(max_length=50, default="1.0.0")
    raw_text = models.TextField(blank=True, default="")
    ai_report = models.JSONField(default=dict, blank=True)
    started_at = models.DateTimeField(auto_now_add=True)
    finished_at = models.DateTimeField(null=True, blank=True)
    error = models.TextField(blank=True)

    def __str__(self):
        return f"ExtractionJob({self.document_id}, engine={self.engine})"


class ExtractedField(TimeStamped):
    STATUS_CHOICES = [
        ("candidate", "Candidate"),
        ("corrected", "Corrected"),
        ("accepted", "Accepted"),
        ("rejected", "Rejected"),
    ]
    INTERPRETATION_CHOICES = [
        ("normal", "Normal"),
        ("abnormal", "Abnormal"),
        ("positive", "Positive"),
        ("negative", "Negative"),
        ("high", "High"),
        ("low", "Low"),
        ("unknown", "Unknown"),
    ]

    job = models.ForeignKey(ExtractionJob, on_delete=models.CASCADE, related_name="fields")
    name = models.CharField(max_length=100)
    value = models.CharField(max_length=255)
    unit = models.CharField(max_length=50, blank=True)
    reference_range = models.CharField(max_length=100, blank=True, default="")
    interpretation = models.CharField(max_length=20, choices=INTERPRETATION_CHOICES, default="unknown")
    observed_date = models.DateTimeField(null=True, blank=True)
    lab = models.CharField(max_length=255, blank=True)
    confidence = models.FloatField(default=1.0)
    page = models.PositiveIntegerField(default=1)
    bbox = models.JSONField(default=dict, blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="candidate")
    verified_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True)
    verified_at = models.DateTimeField(null=True, blank=True)

    def __str__(self):
        return f"ExtractedField({self.name}={self.value} {self.unit}, status={self.status})"


class PatientReportHistory(TimeStamped):
    """
    Persisted longitudinal report summary stored under the patient's database profile
    so treating clinicians and receiving senior doctors can review previous tests,
    positive/abnormal findings, negative/normal findings, and RAG citations at any time (D-27).
    """
    patient = models.OneToOneField(
        "identity.Patient",
        on_delete=models.CASCADE,
        related_name="report_history",
    )
    reports_count = models.PositiveIntegerField(default=0)
    verified_reports_count = models.PositiveIntegerField(default=0)
    concise_summary = models.TextField(blank=True, default="")
    positive_or_abnormal = models.JSONField(default=list, blank=True)
    negative_or_normal = models.JSONField(default=list, blank=True)
    tests_performed = models.JSONField(default=list, blank=True)
    rag_references = models.JSONField(default=list, blank=True)
    documents = models.JSONField(default=list, blank=True)
    disclaimer = models.TextField(blank=True, default="")

    def to_dict(self):
        return {
            "reports_count": self.reports_count,
            "verified_reports_count": self.verified_reports_count,
            "concise_summary": self.concise_summary,
            "positive_or_abnormal": self.positive_or_abnormal or [],
            "negative_or_normal": self.negative_or_normal or [],
            "tests_performed": self.tests_performed or [],
            "rag_references": self.rag_references or [],
            "documents": self.documents or [],
            "disclaimer": self.disclaimer,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }

    def __str__(self):
        return f"PatientReportHistory(patient={self.patient_id}, reports={self.reports_count})"

