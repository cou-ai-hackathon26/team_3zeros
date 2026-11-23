from rest_framework import serializers
from .models import User, Membership

class UserMeSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    email = serializers.EmailField(allow_null=True)
    phone = serializers.CharField(allow_null=True)
    display_name = serializers.CharField()
    preferred_language = serializers.CharField()
    roles = serializers.ListField(child=serializers.CharField())
    active_facility = serializers.DictField(allow_null=True)
    permissions = serializers.ListField(child=serializers.CharField())
    is_platform_admin = serializers.BooleanField()
    memberships = serializers.ListField(child=serializers.DictField(), required=False)


class LoginSerializer(serializers.Serializer):
    username = serializers.CharField(required=False)
    email = serializers.EmailField(required=False)
    phone = serializers.CharField(required=False)
    password = serializers.CharField(write_only=True)


class MfaVerifySerializer(serializers.Serializer):
    code = serializers.CharField(max_length=10)


class RegisterSerializer(serializers.Serializer):
    email = serializers.EmailField(required=False, allow_blank=True, allow_null=True)
    username = serializers.CharField(required=False, allow_blank=True, allow_null=True, max_length=150)
    display_name = serializers.CharField(max_length=255)
    password = serializers.CharField(write_only=True, max_length=128)


class ActiveFacilitySerializer(serializers.Serializer):
    facility_id = serializers.UUIDField()


class StaffCreateSerializer(serializers.Serializer):
    email = serializers.EmailField(required=False, allow_null=True, allow_blank=True)
    username = serializers.CharField(required=False, allow_null=True, allow_blank=True, max_length=150)
    phone = serializers.CharField(required=False, allow_null=True, allow_blank=True, max_length=20)
    display_name = serializers.CharField(max_length=255)
    role = serializers.CharField()
    facility_id = serializers.UUIDField()
    permissions = serializers.ListField(child=serializers.CharField(), required=False, default=list)
    registration_number = serializers.CharField(required=False, allow_blank=True, max_length=100)


class StaffUpdateSerializer(serializers.Serializer):
    role = serializers.CharField(required=False)
    permissions = serializers.ListField(child=serializers.CharField(), required=False)
