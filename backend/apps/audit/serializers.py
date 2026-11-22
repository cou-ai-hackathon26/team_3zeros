from rest_framework import serializers
from .models import AuditEvent

class AuditEventSerializer(serializers.ModelSerializer):
    class Meta:
        model = AuditEvent
        fields = [
            "id",
            "at",
            "actor_user",
            "actor_role",
            "actor_facility",
            "action",
            "object_type",
            "object_id",
            "patient_id",
            "outcome",
            "reason",
            "request_id",
        ]

