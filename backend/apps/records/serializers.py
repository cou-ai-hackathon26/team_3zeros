from rest_framework import serializers
from .models import Encounter, ClinicalObservation

class ClinicalObservationSerializer(serializers.ModelSerializer):
    id = serializers.UUIDField(source="public_id", read_only=True)

    class Meta:
        model = ClinicalObservation
        fields = ["id", "code", "display_name", "value_string", "value_numeric", "unit", "observed_date", "fhir_id"]


class EncounterSerializer(serializers.ModelSerializer):
    id = serializers.UUIDField(source="public_id", read_only=True)
    patient_id = serializers.UUIDField(source="patient.public_id", read_only=True)
    facility_id = serializers.UUIDField(source="facility.public_id", read_only=True)
    facility_name = serializers.CharField(source="facility.name", read_only=True)
    practitioner_name = serializers.CharField(source="practitioner.name", read_only=True, allow_null=True)
    observations = ClinicalObservationSerializer(many=True, read_only=True)

    class Meta:
        model = Encounter
        fields = [
            "id",
            "patient_id",
            "facility_id",
            "facility_name",
            "practitioner_name",
            "period_start",
            "period_end",
            "encounter_type",
            "reason",
            "observations",
            "fhir_id",
            "fhir_sync_status",
            "created_at",
        ]


class EncounterCreateSerializer(serializers.Serializer):
    facility_id = serializers.UUIDField()
    practitioner_id = serializers.UUIDField(required=False, allow_null=True)
    period_start = serializers.DateTimeField()
    period_end = serializers.DateTimeField(required=False, allow_null=True)
    encounter_type = serializers.ChoiceField(choices=Encounter.ENCOUNTER_TYPES, default="outpatient")
    reason = serializers.CharField(required=False, allow_blank=True)


class ObservationCreateSerializer(serializers.Serializer):
    code = serializers.CharField(max_length=100)
    display_name = serializers.CharField(max_length=255)
    value_string = serializers.CharField(required=False, allow_blank=True)
    value_numeric = serializers.FloatField(required=False, allow_null=True)
    unit = serializers.CharField(required=False, allow_blank=True)
    observed_date = serializers.DateTimeField(required=False, allow_null=True)

