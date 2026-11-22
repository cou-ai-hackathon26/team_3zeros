from rest_framework import serializers
from .models import Area, Specialty, Service, CapacityReport
from apps.organizations.models import Facility, Practitioner, PractitionerRole

class AreaSerializer(serializers.ModelSerializer):
    id = serializers.UUIDField(source="public_id", read_only=True)
    parent_id = serializers.UUIDField(source="parent.public_id", read_only=True, allow_null=True)

    class Meta:
        model = Area
        fields = ["id", "level", "parent_id", "name_en", "name_bn", "code"]


class SpecialtySerializer(serializers.ModelSerializer):
    id = serializers.UUIDField(source="public_id", read_only=True)

    class Meta:
        model = Specialty
        fields = ["id", "code", "name_en", "name_bn"]


class ServiceSerializer(serializers.ModelSerializer):
    id = serializers.UUIDField(source="public_id", read_only=True)

    class Meta:
        model = Service
        fields = ["id", "code", "name", "name_bn"]


class CapacityReportSerializer(serializers.ModelSerializer):
    id = serializers.UUIDField(source="public_id", read_only=True)
    service_code = serializers.CharField(source="service.code", read_only=True, allow_null=True)
    service_name = serializers.CharField(source="service.name", read_only=True, allow_null=True)
    is_stale = serializers.BooleanField(read_only=True)

    class Meta:
        model = CapacityReport
        fields = ["id", "service_code", "service_name", "reported_value", "reported_at", "source", "is_stale"]


class FacilityDirectorySerializer(serializers.ModelSerializer):
    id = serializers.UUIDField(source="public_id", read_only=True)
    area_name = serializers.CharField(source="area.name_en", read_only=True, allow_null=True)
    area_name_bn = serializers.CharField(source="area.name_bn", read_only=True, allow_null=True)
    services = ServiceSerializer(many=True, read_only=True)
    latest_capacity = serializers.SerializerMethodField()

    class Meta:
        model = Facility
        fields = ["id", "name", "name_bn", "type", "area_name", "area_name_bn", "address", "phone", "services", "latest_capacity"]

    def get_latest_capacity(self, obj):
        latest = obj.capacity_reports.first()
        if latest:
            return CapacityReportSerializer(latest).data
        return None


class PractitionerDirectorySerializer(serializers.ModelSerializer):
    id = serializers.UUIDField(source="public_id", read_only=True)
    specialties = serializers.SerializerMethodField()
    facilities = serializers.SerializerMethodField()

    class Meta:
        model = Practitioner
        fields = ["id", "registration_number", "name", "name_bn", "specialties", "facilities"]

    def get_specialties(self, obj):
        roles = obj.roles.filter(active=True).select_related("specialty")
        return [
            {"id": str(r.specialty.public_id), "code": r.specialty.code, "name_en": r.specialty.name_en, "name_bn": r.specialty.name_bn}
            for r in roles
        ]

    def get_facilities(self, obj):
        roles = obj.roles.filter(active=True).select_related("facility")
        return [
            {"id": str(r.facility.public_id), "name": r.facility.name, "name_bn": r.facility.name_bn, "type": r.facility.type}
            for r in roles
        ]

