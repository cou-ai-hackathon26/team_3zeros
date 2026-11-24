from rest_framework import serializers
from .models import ConsentRequest, Consent

class ConsentRequestSerializer(serializers.ModelSerializer):
    id = serializers.UUIDField(source="public_id", read_only=True)
    patient_id = serializers.UUIDField(source="patient.public_id", read_only=True)
    recipient_facility_id = serializers.UUIDField(source="recipient_facility.public_id", read_only=True)
    recipient_facility_name = serializers.CharField(source="recipient_facility.name", read_only=True)
    recipient_practitioner_name = serializers.CharField(source="recipient_practitioner.name", read_only=True, allow_null=True)

    class Meta:
        model = ConsentRequest
        fields = [
            "id",
            "patient_id",
            "recipient_facility_id",
            "recipient_facility_name",
            "recipient_practitioner_name",
            "purpose",
            "categories",
            "content_hash",
            "state",
            "expires_at",
            "created_at",
        ]


class ConsentSerializer(serializers.ModelSerializer):
    id = serializers.UUIDField(source="public_id", read_only=True)
    patient_id = serializers.UUIDField(source="patient.public_id", read_only=True)
    recipient_facility_id = serializers.UUIDField(source="recipient_facility.public_id", read_only=True)
    recipient_facility_name = serializers.CharField(source="recipient_facility.name", read_only=True)

    class Meta:
        model = Consent
        fields = [
            "id",
            "patient_id",
            "recipient_facility_id",
            "recipient_facility_name",
            "purpose",
            "categories",
            "content_hash",
            "method",
            "verification_context",
            "state",
            "revoked_at",
            "created_at",
        ]


class AssistedConsentRecordSerializer(serializers.Serializer):
    method = serializers.CharField(max_length=30)
    patient_confirmed_in_person = serializers.BooleanField()
    witness_name = serializers.CharField(max_length=255, required=False, allow_blank=True, default="")
    notes = serializers.CharField(required=False, allow_blank=True, default="")
    consent_language = serializers.ChoiceField(choices=["bn", "en"], required=False, default="bn")

