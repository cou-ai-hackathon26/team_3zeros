from rest_framework import serializers
from apps.workflow.engine import compute_allowed_actions
from .models import TriageSession, Turn, TriageSummary
from .transitions import TRIAGE_TRANSITIONS


class TurnSerializer(serializers.ModelSerializer):
    id = serializers.UUIDField(source="public_id", read_only=True)

    class Meta:
        model = Turn
        fields = [
            "id",
            "role",
            "text",
            "language_detected",
            "red_flag_hits",
            "response_policy",
            "at",
        ]


class TriageSummarySerializer(serializers.ModelSerializer):
    class Meta:
        model = TriageSummary
        fields = [
            "patient_words",
            "structured_fields",
            "guidance_given",
            "patient_confirmed_at",
            "patient_edits",
        ]


class TriageSessionSerializer(serializers.ModelSerializer):
    id = serializers.UUIDField(source="public_id", read_only=True)
    turns = serializers.SerializerMethodField()
    summary = TriageSummarySerializer(read_only=True)
    allowed_actions = serializers.SerializerMethodField()
    interview = serializers.SerializerMethodField()

    class Meta:
        model = TriageSession
        fields = [
            "id",
            "state",
            "allowed_actions",
            "version",
            "language",
            "mode",
            "triage_disclosure_version",
            "ruleset_version",
            "interview",
            "turns",
            "summary",
            "started_at",
            "ended_at",
        ]

    def get_interview(self, obj):
        from .dialogue import MAX_ANSWERS, TARGET_ANSWERS
        return {"target": TARGET_ANSWERS, "max": MAX_ANSWERS}

    def get_turns(self, obj):
        if self.context.get("clinician_view"):
            return []
        return TurnSerializer(obj.turns.all(), many=True).data

    def get_allowed_actions(self, obj):
        if self.context.get("clinician_view"):
            return []
        request = self.context.get("request")
        actor = request.user if request is not None else None
        obj.TRANSITIONS = TRIAGE_TRANSITIONS
        return compute_allowed_actions(obj, actor)


class TriageSessionCreateSerializer(serializers.Serializer):
    language = serializers.ChoiceField(choices=["bn", "en"], default="bn")
    mode = serializers.ChoiceField(choices=["voice", "text"], default="text")
    triage_disclosure_version = serializers.CharField()


class TurnCreateSerializer(serializers.Serializer):
    text = serializers.CharField()


class SummaryConfirmSerializer(serializers.Serializer):
    edits = serializers.DictField(required=False, default=dict)
