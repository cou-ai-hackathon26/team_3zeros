from rest_framework import serializers
from .models import Document, ExtractionJob, ExtractedField

class ExtractedFieldSerializer(serializers.ModelSerializer):
    id = serializers.UUIDField(source="public_id", read_only=True)

    class Meta:
        model = ExtractedField
        fields = [
            "id",
            "name",
            "value",
            "unit",
            "reference_range",
            "interpretation",
            "observed_date",
            "lab",
            "confidence",
            "page",
            "bbox",
            "status",
        ]


class DocumentSerializer(serializers.ModelSerializer):
    id = serializers.UUIDField(source="public_id", read_only=True)
    patient_id = serializers.UUIDField(source="patient.public_id", read_only=True)
    ai_report = serializers.SerializerMethodField()
    fields_count = serializers.SerializerMethodField()
    positive_count = serializers.SerializerMethodField()
    uploaded_by_role = serializers.SerializerMethodField()

    class Meta:
        model = Document
        fields = [
            "id",
            "patient_id",
            "original_filename",
            "content_type",
            "size",
            "sha256",
            "state",
            "ai_report",
            "fields_count",
            "positive_count",
            "uploaded_by_role",
            "created_at",
            "updated_at",
        ]

    def _latest_job(self, obj):
        return obj.extraction_jobs.order_by("-created_at").first()

    def get_ai_report(self, obj):
        job = self._latest_job(obj)
        if not job or not job.ai_report:
            return None
        return job.ai_report

    def get_fields_count(self, obj):
        job = self._latest_job(obj)
        return job.fields.exclude(status="rejected").count() if job else 0

    def get_positive_count(self, obj):
        job = self._latest_job(obj)
        if not job:
            return 0
        return job.fields.exclude(status="rejected").filter(
            interpretation__in=("positive", "abnormal", "high", "low")
        ).count()

    def get_uploaded_by_role(self, obj):
        user = obj.uploaded_by
        if not user:
            return "system"
        if hasattr(user, "patient_account") and getattr(user.patient_account, "patient_id", None) == obj.patient_id:
            return "patient"
        return "clinician"


class ExtractionVerificationSerializer(serializers.Serializer):
    fields = serializers.ListField(child=serializers.DictField())

