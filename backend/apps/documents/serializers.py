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
            "created_at",
            "updated_at",
        ]


class ExtractionVerificationSerializer(serializers.Serializer):
    fields = serializers.ListField(child=serializers.DictField())
