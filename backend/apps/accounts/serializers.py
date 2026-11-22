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


class LoginSerializer(serializers.Serializer):
    username = serializers.CharField(required=False)
    email = serializers.EmailField(required=False)
    phone = serializers.CharField(required=False)
    password = serializers.CharField(write_only=True)


class MfaVerifySerializer(serializers.Serializer):
    code = serializers.CharField(max_length=10)


class OtpRequestSerializer(serializers.Serializer):
    phone = serializers.CharField(max_length=20)


class OtpVerifySerializer(serializers.Serializer):
    phone = serializers.CharField(max_length=20)
    code = serializers.CharField(max_length=10)


class ActiveFacilitySerializer(serializers.Serializer):
    facility_id = serializers.UUIDField()
