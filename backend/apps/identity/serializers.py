from rest_framework import serializers
from .models import Patient, PatientIdentifier, DuplicateCandidate

class PatientIdentifierSerializer(serializers.ModelSerializer):
    id = serializers.UUIDField(source="public_id", read_only=True)

    class Meta:
        model = PatientIdentifier
        fields = ["id", "system", "value", "verified"]


class PatientSerializer(serializers.ModelSerializer):
    id = serializers.UUIDField(source="public_id", read_only=True)
    area_id = serializers.UUIDField(source="area.public_id", read_only=True, allow_null=True)
    identifiers = PatientIdentifierSerializer(many=True, read_only=True)

    class Meta:
        model = Patient
        fields = [
            "id",
            "given_name",
            "family_name",
            "name_bn",
            "birth_date",
            "estimated_age",
            "sex",
            "phone",
            "area_id",
            "identifiers",
            "fhir_id",
            "fhir_version",
            "version",
            "created_at",
            "updated_at",
        ]


class PatientCreateSerializer(serializers.Serializer):
    given_name = serializers.CharField(max_length=150)
    family_name = serializers.CharField(max_length=150, required=False, allow_blank=True)
    name_bn = serializers.CharField(max_length=255, required=False, allow_blank=True)
    birth_date = serializers.DateField(required=False, allow_null=True)
    estimated_age = serializers.IntegerField(required=False, allow_null=True)
    sex = serializers.ChoiceField(choices=Patient.SEX_CHOICES, default="unknown")
    phone = serializers.CharField(max_length=20, required=False, allow_blank=True)
    area_id = serializers.UUIDField(required=False, allow_null=True)
    identifiers = serializers.ListField(
        child=serializers.DictField(),
        required=False,
        default=list,
    )


class DuplicateCandidateSerializer(serializers.ModelSerializer):
    id = serializers.UUIDField(source="public_id", read_only=True)
    patient_a_id = serializers.UUIDField(source="patient_a.public_id", read_only=True)
    patient_b_id = serializers.UUIDField(source="patient_b.public_id", read_only=True)
    resolved_by_name = serializers.CharField(source="resolved_by.display_name", read_only=True, allow_null=True)

    class Meta:
        model = DuplicateCandidate
        fields = [
            "id",
            "patient_a_id",
            "patient_b_id",
            "score",
            "reasons",
            "status",
            "resolved_by_name",
            "resolved_at",
        ]


class ResolveDuplicateSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=["same_person", "different"])
    notes = serializers.CharField(required=False, allow_blank=True)

