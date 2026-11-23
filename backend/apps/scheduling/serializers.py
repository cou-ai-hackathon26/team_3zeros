from rest_framework import serializers
from .models import Slot, Appointment
from apps.workflow.engine import compute_allowed_actions
from apps.workflow.models import HistoryEntry
from .transitions import APPOINTMENT_TRANSITIONS

class SlotSerializer(serializers.ModelSerializer):
    id = serializers.UUIDField(source="public_id", read_only=True)

    class Meta:
        model = Slot
        fields = ["id", "start", "end", "state"]


class HistoryEntrySerializer(serializers.ModelSerializer):
    actor_user_id = serializers.UUIDField(source="actor_user.public_id", read_only=True, allow_null=True)

    class Meta:
        model = HistoryEntry
        fields = ["from_state", "to_state", "action", "actor_user_id", "actor_role", "reason", "at"]


class AppointmentSerializer(serializers.ModelSerializer):
    id = serializers.UUIDField(source="public_id", read_only=True)
    patient_id = serializers.UUIDField(source="patient.public_id", read_only=True)
    practitioner_id = serializers.UUIDField(source="practitioner.public_id", read_only=True)
    practitioner_name = serializers.CharField(source="practitioner.name", read_only=True)
    facility_id = serializers.UUIDField(source="facility.public_id", read_only=True)
    facility_name = serializers.CharField(source="facility.name", read_only=True)
    slot = SlotSerializer(read_only=True)
    original_slot = SlotSerializer(read_only=True, allow_null=True)
    allowed_actions = serializers.SerializerMethodField()
    history = serializers.SerializerMethodField()

    class Meta:
        model = Appointment
        fields = [
            "id",
            "state",
            "patient_id",
            "practitioner_id",
            "practitioner_name",
            "facility_id",
            "facility_name",
            "slot",
            "original_slot",
            "triage_session_id",
            "decline_reason",
            "expires_at",
            "version",
            "fhir_sync_status",
            "pending_action",
            "allowed_actions",
            "history",
            "created_at",
            "updated_at",
        ]

    def get_allowed_actions(self, obj):
        request = self.context.get("request")
        user = getattr(request, "user", None) if request else None
        obj.TRANSITIONS = APPOINTMENT_TRANSITIONS
        return compute_allowed_actions(obj, user)

    def get_history(self, obj):
        entries = HistoryEntry.objects.filter(
            aggregate_type=obj._meta.model_name,
            aggregate_id=obj.public_id,
        )
        return HistoryEntrySerializer(entries, many=True).data


class AppointmentCreateSerializer(serializers.Serializer):
    patient_id = serializers.UUIDField(required=False, allow_null=True)
    slot_id = serializers.UUIDField()
    triage_session_id = serializers.UUIDField(required=False, allow_null=True)


class AppointmentActionSerializer(serializers.Serializer):
    reason = serializers.CharField(required=False, allow_blank=True)
    alternate_slot_id = serializers.UUIDField(required=False, allow_null=True)

