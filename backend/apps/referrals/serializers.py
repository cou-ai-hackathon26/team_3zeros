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
    patient_system_id = serializers.SerializerMethodField()
    patient_has_account = serializers.SerializerMethodField()
    initiated_by_id = serializers.UUIDField(source="initiated_by.public_id", read_only=True, allow_null=True)
    consent_request_id = serializers.UUIDField(source="consent_request.public_id", read_only=True, allow_null=True)
    sender_facility_id = serializers.UUIDField(source="sender_facility.public_id", read_only=True, allow_null=True)
    sender_facility_name = serializers.CharField(source="sender_facility.name", read_only=True, allow_null=True)
    sender_practitioner_id = serializers.UUIDField(source="sender_practitioner.public_id", read_only=True, allow_null=True)
    sender_practitioner_name = serializers.CharField(source="sender_practitioner.name", read_only=True, allow_null=True)
    receiver_facility_id = serializers.UUIDField(source="receiver_facility.public_id", read_only=True)
    receiver_facility_name = serializers.CharField(source="receiver_facility.name", read_only=True)
    receiver_practitioner_id = serializers.UUIDField(source="receiver_practitioner.public_id", read_only=True, allow_null=True)
    consent_state = serializers.SerializerMethodField()
    allowed_actions = serializers.SerializerMethodField()
    history = serializers.SerializerMethodField()
    report_history = serializers.SerializerMethodField()

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
            "patient_system_id",
            "patient_has_account",
            "initiated_by_id",
            "consent_request_id",
            "idempotency_key",
            "is_partial",
            "completeness_status",
            "missing_fields",
            "reconciled_at",
            "reconciliation_metadata",
            "sender_facility_id",
            "sender_facility_name",
            "sender_practitioner_id",
            "sender_practitioner_name",
            "receiver_facility_id",
            "receiver_facility_name",
            "receiver_practitioner_id",
            "summary",
            "report_history",
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

    def get_patient_system_id(self, obj):
        ident = obj.patient.identifiers.filter(system="system_id").first()
        return ident.value if ident else None

    def get_patient_has_account(self, obj):
        return hasattr(obj.patient, "account") and obj.patient.account is not None

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

    def get_report_history(self, obj):
        from apps.ai.report_analysis import get_or_build_patient_report_history

        return get_or_build_patient_report_history(obj.patient)


class ReferralCreateSerializer(serializers.Serializer):
    patient_id = serializers.UUIDField()
    encounter_id = serializers.UUIDField(required=False, allow_null=True)
    receiver_facility_id = serializers.UUIDField()
    receiver_practitioner_id = serializers.UUIDField(required=False, allow_null=True)
    urgency = serializers.ChoiceField(choices=Referral.URGENCY_CHOICES, default="routine")
    reason = serializers.CharField()
    summary = serializers.DictField(required=False, default=dict)
    provisional_code = serializers.CharField(max_length=50, required=False, allow_blank=True, allow_null=True)
    idempotency_key = serializers.UUIDField(required=False, allow_null=True)


class PartialReferralIntakeSerializer(serializers.Serializer):
    """Minimum viable payload for receiving-facility partial intake when full referral has not synced."""
    provisional_code = serializers.CharField(max_length=50)
    reason = serializers.CharField()
    urgency = serializers.ChoiceField(choices=Referral.URGENCY_CHOICES, default="urgent")
    receiver_facility_id = serializers.UUIDField(required=False, allow_null=True)

    # Optional patient identification (no phone, email, or account required)
    patient_id = serializers.UUIDField(required=False, allow_null=True)
    patient_system_id = serializers.CharField(max_length=50, required=False, allow_blank=True, allow_null=True)
    patient_name = serializers.CharField(max_length=150, required=False, allow_blank=True, allow_null=True)
    patient_name_bn = serializers.CharField(max_length=255, required=False, allow_blank=True, allow_null=True)
    unverified_identity_description = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    estimated_age = serializers.IntegerField(required=False, allow_null=True, min_value=0, max_value=150)
    birth_date = serializers.DateField(required=False, allow_null=True)
    sex = serializers.ChoiceField(choices=["male", "female", "other", "unknown"], required=False, default="unknown")

    # Optional slip / clinical details (never fabricated if omitted)
    sender_facility_id = serializers.UUIDField(required=False, allow_null=True)
    referring_worker_name = serializers.CharField(max_length=255, required=False, allow_blank=True, allow_null=True)
    referred_at_device = serializers.DateTimeField(required=False, allow_null=True)
    presenting_symptoms = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    vitals = serializers.DictField(required=False, allow_null=True)
    allergies = serializers.ListField(child=serializers.CharField(), required=False, allow_null=True)
    treatment_given = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    idempotency_key = serializers.UUIDField(required=False, allow_null=True)


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

