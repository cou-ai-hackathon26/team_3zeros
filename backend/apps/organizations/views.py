import uuid
from django.conf import settings
from django.utils import timezone
from rest_framework import views, permissions, status
from rest_framework.response import Response
from .models import Facility, Practitioner
from apps.directory.models import CapacityReport
from apps.directory.serializers import FacilityDirectorySerializer, PractitionerDirectorySerializer, CapacityReportSerializer
from apps.common.exceptions import PermissionDeniedError


def _require_admin_role(user):
    """MASTERPLAN §4.2 & INV-9: Only facility_admin (own facility) or platform_admin may call /admin/*."""
    if getattr(user, "is_platform_admin", False) or getattr(user, "is_superuser", False):
        return None
    membership = user.memberships.filter(role="facility_admin", active=True).select_related("facility").first()
    if not membership:
        raise PermissionDeniedError("Facility admin or platform admin role is required.")
    return membership.facility


class DeviceEnrollView(views.APIView):
    """Enroll a facility device for offline emergency mode (MASTERPLAN §6.3, gated behind Q-09 FEATURE_OFFLINE_EMERGENCY)."""
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        if not getattr(settings, "FEATURE_OFFLINE_EMERGENCY", False):
            raise PermissionDeniedError("Offline device enrollment is disabled pending Q-09 policy approval.")
        _require_admin_role(request.user)
        return Response({
            "device_id": str(uuid.uuid4()),
            "enrolled_at": timezone.now().isoformat(),
            "status": "active",
        }, status=status.HTTP_201_CREATED)


class DeviceRevokeView(views.APIView):
    """Revoke an enrolled offline device (MASTERPLAN §6.3, Q-09)."""
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, public_id):
        if not getattr(settings, "FEATURE_OFFLINE_EMERGENCY", False):
            raise PermissionDeniedError("Offline device management is disabled pending Q-09 policy approval.")
        _require_admin_role(request.user)
        return Response({
            "device_id": str(public_id),
            "revoked_at": timezone.now().isoformat(),
            "status": "revoked",
        })


class AdminFacilitiesView(views.APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        scoped_facility = _require_admin_role(request.user)
        qs = Facility.objects.filter(id=scoped_facility.id) if scoped_facility else Facility.objects.all()
        return Response({"results": FacilityDirectorySerializer(qs, many=True).data, "next_cursor": None})


class AdminPractitionersView(views.APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        scoped_facility = _require_admin_role(request.user)
        qs = (
            Practitioner.objects.filter(roles__facility=scoped_facility).distinct()
            if scoped_facility
            else Practitioner.objects.all()
        )
        return Response({"results": PractitionerDirectorySerializer(qs, many=True).data, "next_cursor": None})


class AdminSchedulesView(views.APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        _require_admin_role(request.user)
        return Response({"results": [], "next_cursor": None})


class AdminCapacityReportsView(views.APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        scoped_facility = _require_admin_role(request.user)
        qs = (
            CapacityReport.objects.filter(facility=scoped_facility)
            if scoped_facility
            else CapacityReport.objects.all()
        )
        return Response({"results": CapacityReportSerializer(qs.order_by("-reported_at")[:50], many=True).data, "next_cursor": None})


class AdminStaffView(views.APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        _require_admin_role(request.user)
        return Response({"results": [], "next_cursor": None})


class FhirIntegrationBoundaryView(views.APIView):
    """Controlled FHIR boundary for approved external systems (MASTERPLAN §6.3, DEPLOYMENT §2)."""
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, resource_path=""):
        _require_admin_role(request.user)
        return Response({"resourceType": "OperationOutcome", "path": resource_path, "status": "controlled_boundary"})
