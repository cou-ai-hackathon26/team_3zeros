from rest_framework import serializers
from .models import Referral, EmergencyReferral, ReferralDraftVersion
from apps.workflow.engine import compute_allowed_actions
from apps.workflow.models import HistoryEntry
from apps.scheduling.serializers import HistoryEntrySerializer
from .transitions import REFERRAL_TRANSITIONS

class ReferralSerializer(serializers.ModelSerializer):
    id = serializers.UUIDField(source="public_id", read_only=True)
    patient_id = serializers.UUIDField(source="patient.public_id", read_only=True)
    patient_name = serializers.CharField(source="patient.given_name", read_only=True)
    sender_facility_id = serializers.UUIDField(source="sender_facility.public_id", read_only=True)
    sender_facility_name = serializers.CharField(source="sender_facility.name", read_only=True)
    sender_practitioner_id = serializers.UUIDField(source="sender_practitioner.public_id", read_only=True, allow_null=True)
    sender_practitioner_name = serializers.CharField(source="sender_practitioner.name", read_only=True, allow_null=True)
    receiver_facility_id = serializers.UUIDField(source="receiver_facility.public_id", read_only=True)
    receiver_facility_name = serializers.CharField(source="receiver_facility.name", read_only=True)
    receiver_practitioner_id = serializers.UUIDField(source="receiver_practitioner.public_id", read_only=True, allow_null=True)
    consent_state = serializers.SerializerMethodField()
    allowed_actions = serializers.SerializerMethodField()
    history = serializers.SerializerMethodField()

    class Meta:
        model = Referral
        fields = [
            "id",
            "reference_code",
            "provisional_code",
            "state",
            "urgency",
            "emergency_mode",
            "reason",
            "patient_id",
            "patient_name",
            "sender_facility_id",
            "sender_facility_name",
            "sender_practitioner_id",
            "sender_practitioner_name",
            "receiver_facility_id",
            "receiver_facility_name",
            "receiver_practitioner_id",
            "summary",
            "content_hash",
            "summary_origin",
            "consent_state",
            "outcome",
            "decline_reason",
            "version",
            "fhir_sync_status",
            "pending_action",
            "allowed_actions",
            "history",
            "created_at",
            "updated_at",
            "sent_at",
            "acknowledged_at",
            "escalated_at",
        ]

    def get_consent_state(self, obj):
        if obj.emergency_mode and not obj.consent:
            return "emergency_exception_pending_policy"
        if not obj.consent:
            return "not_requested"
        return obj.consent.state.lower()

    def get_allowed_actions(self, obj):
        request = self.context.get("request")
        user = getattr(request, "user", None) if request else None
        obj.TRANSITIONS = REFERRAL_TRANSITIONS
        return compute_allowed_actions(obj, user)

    def get_history(self, obj):
        entries = HistoryEntry.objects.filter(
            aggregate_type=obj._meta.model_name,
            aggregate_id=obj.public_id,
        )
        return HistoryEntrySerializer(entries, many=True).data


class ReferralCreateSerializer(serializers.Serializer):
    patient_id = serializers.UUIDField()
    encounter_id = serializers.UUIDField(required=False, allow_null=True)
    receiver_facility_id = serializers.UUIDField()
    receiver_practitioner_id = serializers.UUIDField(required=False, allow_null=True)
    urgency = serializers.ChoiceField(choices=Referral.URGENCY_CHOICES, default="routine")
    reason = serializers.CharField()
    summary = serializers.DictField(required=False, default=dict)


class ReferralUpdateSerializer(serializers.Serializer):
    reason = serializers.CharField(required=False)
    urgency = serializers.ChoiceField(choices=Referral.URGENCY_CHOICES, required=False)
    summary = serializers.DictField(required=False)


class EmergencyReferralCreateSerializer(serializers.Serializer):
    patient_id = serializers.UUIDField(required=False, allow_null=True)
    unverified_description = serializers.CharField(required=False, allow_blank=True)
    reason = serializers.CharField()
    urgency = serializers.ChoiceField(choices=["emergency", "urgent"])
    vitals = serializers.DictField(required=False, default=dict)
    treatment_given = serializers.CharField(required=False, allow_blank=True)
    facility_id = serializers.UUIDField()
    provisional_code = serializers.CharField(required=False, allow_blank=True)
    idempotency_key = serializers.UUIDField()
    created_at_device = serializers.DateTimeField()


class ReferralActionSerializer(serializers.Serializer):
    reason = serializers.CharField(required=False, allow_blank=True)
    outcome = serializers.DictField(required=False)

