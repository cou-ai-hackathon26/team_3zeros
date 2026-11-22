from django.contrib.auth import logout
from rest_framework import views, status, permissions
from rest_framework.response import Response
from .serializers import (
    UserMeSerializer,
    LoginSerializer,
    MfaVerifySerializer,
    OtpRequestSerializer,
    OtpVerifySerializer,
    ActiveFacilitySerializer,
)
from .services import (
    authenticate_and_login,
    verify_mfa_code,
    request_phone_otp,
    verify_phone_otp_and_login,
)
from .selectors import get_user_roles, get_user_permissions
from apps.common.exceptions import ValidationError, NotFoundError

class LoginView(views.APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        serializer = LoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = authenticate_and_login(
            request,
            username=serializer.validated_data.get("username"),
            email=serializer.validated_data.get("email"),
            phone=serializer.validated_data.get("phone"),
            password=serializer.validated_data["password"],
        )
        return Response({"message": "Login successful.", "user_id": str(user.public_id)})


class MfaVerifyView(views.APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        serializer = MfaVerifySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = verify_mfa_code(request, serializer.validated_data["code"])
        return Response({"message": "MFA verification successful.", "user_id": str(user.public_id)})


class OtpRequestView(views.APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        serializer = OtpRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        msg = request_phone_otp(serializer.validated_data["phone"])
        return Response({"message": msg})


class OtpVerifyView(views.APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        serializer = OtpVerifySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = verify_phone_otp_and_login(
            request,
            serializer.validated_data["phone"],
            serializer.validated_data["code"],
        )
        return Response({"message": "OTP verification successful.", "user_id": str(user.public_id)})


class LogoutView(views.APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        logout(request)
        return Response({"message": "Logged out successfully."})


class MeView(views.APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        user = request.user
        roles = get_user_roles(user)
        active_facility_id = request.session.get("active_facility_id")

        active_facility_data = None
        if active_facility_id:
            membership = user.memberships.filter(facility__public_id=active_facility_id).first()
            if membership:
                active_facility_data = {
                    "id": str(membership.facility.public_id),
                    "name": membership.facility.name,
                    "name_bn": membership.facility.name_bn,
                    "role": membership.role,
                }

        permissions_list = get_user_permissions(user, active_facility_id)

        data = {
            "id": user.public_id,
            "email": user.email,
            "phone": user.phone,
            "display_name": user.display_name,
            "preferred_language": user.preferred_language,
            "roles": roles,
            "active_facility": active_facility_data,
            "permissions": permissions_list,
            "is_platform_admin": hasattr(user, "platform_admin"),
        }
        serializer = UserMeSerializer(data)
        return Response(serializer.data)


class ActiveFacilityView(views.APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        serializer = ActiveFacilitySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        facility_id = str(serializer.validated_data["facility_id"])

        # Validate that the user is a member of this facility
        membership = request.user.memberships.filter(facility__public_id=facility_id).first()
        if not membership and not hasattr(request.user, "platform_admin"):
            raise ValidationError("You are not a member of the requested facility.")

        request.session["active_facility_id"] = facility_id
        return Response({
            "message": "Active facility updated.",
            "active_facility_id": facility_id,
        })
