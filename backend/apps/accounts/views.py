from django.contrib.auth import logout
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import csrf_exempt, ensure_csrf_cookie
from rest_framework import views, status, permissions
from rest_framework.response import Response
from .serializers import (
    UserMeSerializer,
    LoginSerializer,
    MfaVerifySerializer,
    ActiveFacilitySerializer,
    RegisterSerializer,
)
from .services import (
    authenticate_and_login,
    register_patient,
    verify_mfa_code,
)
from .selectors import get_user_roles, get_user_permissions
from apps.common.exceptions import ValidationError, NotFoundError

@method_decorator(csrf_exempt, name="dispatch")
class LoginView(views.APIView):
    authentication_classes = []
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


@method_decorator(csrf_exempt, name="dispatch")
class AdminLoginView(views.APIView):
    """Separate admin entrance (MASTERPLAN D-17). Not linked from the UI; MFA is mandatory."""
    authentication_classes = []
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
            admin=True,
        )
        return Response({"message": "Login successful.", "user_id": str(user.public_id)})


@method_decorator(csrf_exempt, name="dispatch")
class MfaVerifyView(views.APIView):
    authentication_classes = []
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        serializer = MfaVerifySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = verify_mfa_code(request, serializer.validated_data["code"])
        return Response({"message": "MFA verification successful.", "user_id": str(user.public_id)})


@method_decorator(csrf_exempt, name="dispatch")
class RegisterView(views.APIView):
    """Patient self-registration with email or username and a password."""
    authentication_classes = []
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        serializer = RegisterSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = register_patient(request, **serializer.validated_data)
        return Response({"message": "Account created.", "user_id": str(user.public_id)}, status=status.HTTP_201_CREATED)


@method_decorator(csrf_exempt, name="dispatch")
class LogoutView(views.APIView):
    authentication_classes = []
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        logout(request)
        return Response({"message": "Logged out successfully."})


@method_decorator(ensure_csrf_cookie, name="dispatch")
class MeView(views.APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        user = request.user
        roles = get_user_roles(user)
        active_facility_id = request.session.get("active_facility_id")

        if not active_facility_id:
            first_membership = user.memberships.select_related("facility").first()
            if first_membership:
                active_facility_id = str(first_membership.facility.public_id)
                request.session["active_facility_id"] = active_facility_id

        active_facility_data = None
        if active_facility_id:
            membership = user.memberships.filter(facility__public_id=active_facility_id).select_related("facility").first()
            if membership:
                active_facility_data = {
                    "id": str(membership.facility.public_id),
                    "name": membership.facility.name,
                    "name_bn": membership.facility.name_bn,
                    "role": membership.role,
                }

        memberships_data = [
            {
                "facility_id": str(m.facility.public_id),
                "facility_name": m.facility.name,
                "facility_name_bn": m.facility.name_bn,
                "role": m.role,
            }
            for m in user.memberships.select_related("facility").all()
        ]

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
            "memberships": memberships_data,
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

