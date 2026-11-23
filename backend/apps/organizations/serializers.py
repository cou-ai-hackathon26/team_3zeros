from rest_framework import serializers
from .models import Facility, AccessRequest
from apps.common.exceptions import ValidationError

class AccessRequestCreateSerializer(serializers.ModelSerializer):
    facility_id = serializers.UUIDField(required=False, allow_null=True)

    class Meta:
        model = AccessRequest
        fields = [
            "name",
            "bmdc_registration_number",
            "contact",
            "facility_id",
            "chamber_name",
            "chamber_name_bn",
        ]

    def validate(self, attrs):
        facility_id = attrs.get("facility_id")
        chamber_name = attrs.get("chamber_name", "").strip()
        if not facility_id and not chamber_name:
            raise ValidationError(
                "Either choose an existing facility or provide a private chamber name.",
                field_errors={"facility_id": ["Specify a facility or chamber name."]},
            )
        if facility_id:
            facility = Facility.objects.filter(public_id=facility_id).first()
            if not facility:
                raise ValidationError(
                    "Selected facility does not exist.",
                    field_errors={"facility_id": ["Facility not found."]},
                )
            attrs["facility"] = facility
            attrs.pop("facility_id", None)
        return attrs


class AccessRequestSerializer(serializers.ModelSerializer):
    id = serializers.UUIDField(source="public_id", read_only=True)
    facility_id = serializers.UUIDField(source="facility.public_id", read_only=True, allow_null=True)
    facility_name = serializers.CharField(source="facility.name", read_only=True, allow_null=True)
    facility_name_bn = serializers.CharField(source="facility.name_bn", read_only=True, allow_null=True)

    class Meta:
        model = AccessRequest
        fields = [
            "id",
            "name",
            "bmdc_registration_number",
            "contact",
            "facility_id",
            "facility_name",
            "facility_name_bn",
            "chamber_name",
            "chamber_name_bn",
            "status",
            "rejection_reason",
            "created_at",
            "reviewed_at",
        ]


class AccessRequestRejectSerializer(serializers.Serializer):
    reason = serializers.CharField(required=True, allow_blank=False)
