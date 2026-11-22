from rest_framework import serializers
from .models import TriageSession, Turn, TriageSummary

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
    turns = TurnSerializer(many=True, read_only=True)
    summary = TriageSummarySerializer(read_only=True)

    class Meta:
        model = TriageSession
        fields = [
            "id",
            "state",
            "language",
            "mode",
            "triage_disclosure_version",
            "turns",
            "summary",
            "started_at",
            "ended_at",
        ]


class TriageSessionCreateSerializer(serializers.Serializer):
    language = serializers.ChoiceField(choices=["bn", "en"], default="bn")
    mode = serializers.ChoiceField(choices=["voice", "text"], default="text")
    triage_disclosure_version = serializers.CharField()


class TurnCreateSerializer(serializers.Serializer):
    text = serializers.CharField()


class SummaryConfirmSerializer(serializers.Serializer):
    edits = serializers.DictField(required=False, default=dict)

