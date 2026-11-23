from rest_framework import serializers
from apps.workflow.engine import compute_allowed_actions
from apps.records.models import ClinicalObservation
from .models import EDVisit
from .transitions import ED_VISIT_TRANSITIONS

class ObservationSerializer(serializers.ModelSerializer):
    class Meta:
        model = ClinicalObservation
        fields = [
            "code",
            "display_name",
            "value_string",
            "value_numeric",
            "unit",
            "observed_date",
        ]

class EDVisitCreateSerializer(serializers.Serializer):
    facility_id = serializers.UUIDField(required=False, allow_null=True)
    patient_id = serializers.UUIDField(required=False, allow_null=True)
    patient_name = serializers.CharField(required=False, allow_blank=True)
    patient_name_bn = serializers.CharField(required=False, allow_blank=True)
    patient_phone = serializers.CharField(required=False, allow_blank=True)
    patient_sex = serializers.ChoiceField(choices=["male", "female", "other", "unknown"], required=False, default="unknown")
    chief_complaint = serializers.CharField(required=True, allow_blank=False)
    arrival_mode = serializers.ChoiceField(choices=[c[0] for c in EDVisit.ARRIVAL_MODES], required=False, default="WALK_IN")
    vitals = serializers.DictField(required=False, default=dict)
    notes = serializers.CharField(required=False, allow_blank=True)

class EDVisitSerializer(serializers.ModelSerializer):
    id = serializers.UUIDField(source="public_id", read_only=True)
    facility_id = serializers.UUIDField(source="facility.public_id", read_only=True)
    facility_name = serializers.CharField(source="facility.name", read_only=True)
    facility_name_bn = serializers.CharField(source="facility.name_bn", read_only=True)
    patient_id = serializers.UUIDField(source="patient.public_id", read_only=True)
    patient_name = serializers.SerializerMethodField()
    patient_name_bn = serializers.CharField(source="patient.name_bn", read_only=True)
    patient_phone = serializers.CharField(source="patient.phone", read_only=True)
    patient_sex = serializers.CharField(source="patient.sex", read_only=True)
    encounter_id = serializers.UUIDField(source="encounter.public_id", read_only=True, allow_null=True)
    triaged_by_name = serializers.CharField(source="triaged_by.display_name", read_only=True, allow_null=True)
    transfer_facility_id = serializers.UUIDField(source="transfer_facility.public_id", read_only=True, allow_null=True)
    transfer_facility_name = serializers.CharField(source="transfer_facility.name", read_only=True, allow_null=True)
    observations = serializers.SerializerMethodField()
    allowed_actions = serializers.SerializerMethodField()

    class Meta:
        model = EDVisit
        fields = [
            "id",
            "facility_id",
            "facility_name",
            "facility_name_bn",
            "patient_id",
            "patient_name",
            "patient_name_bn",
            "patient_phone",
            "patient_sex",
            "encounter_id",
            "state",
            "triage_category",
            "chief_complaint",
            "arrival_mode",
            "arrived_at",
            "triaged_at",
            "triaged_by_name",
            "disposition_at",
            "disposition_notes",
            "discharge_summary",
            "transfer_facility_id",
            "transfer_facility_name",
            "observations",
            "version",
            "allowed_actions",
            "created_at",
        ]

    def get_patient_name(self, obj):
        return f"{obj.patient.given_name} {obj.patient.family_name}".strip()

    def get_observations(self, obj):
        if not obj.encounter:
            return []
        obs = obj.encounter.observations.all()
        return ObservationSerializer(obs, many=True).data

    def get_allowed_actions(self, obj):
        request = self.context.get("request")
        user = request.user if request else None
        obj.TRANSITIONS = ED_VISIT_TRANSITIONS
        return compute_allowed_actions(obj, user)

class EDVisitActionSerializer(serializers.Serializer):
    category = serializers.CharField(required=False, allow_blank=True)
    triage_category = serializers.CharField(required=False, allow_blank=True)
    notes = serializers.CharField(required=False, allow_blank=True)
    summary = serializers.CharField(required=False, allow_blank=True)
    discharge_summary = serializers.CharField(required=False, allow_blank=True)
    transfer_facility_id = serializers.UUIDField(required=False, allow_null=True)
    vitals = serializers.DictField(required=False, default=dict)
