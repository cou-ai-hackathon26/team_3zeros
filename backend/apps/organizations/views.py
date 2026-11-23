import uuid
from django.conf import settings
from django.utils import timezone
from rest_framework import views, permissions, status
from rest_framework.response import Response
from django.db.models import Q
from .models import Facility, Practitioner, AccessRequest
from .serializers import (
    AccessRequestCreateSerializer,
    AccessRequestSerializer,
    AccessRequestRejectSerializer,
)
from apps.directory.models import CapacityReport
from apps.directory.serializers import FacilityDirectorySerializer, PractitionerDirectorySerializer, CapacityReportSerializer
from apps.common.exceptions import PermissionDeniedError, NotFoundError, ValidationError


def _require_admin_role(user):
    """MASTERPLAN §4.2 & INV-9: Only facility_admin (own facility) or platform_admin may call /admin/*."""
    if hasattr(user, "platform_admin") or getattr(user, "is_superuser", False) or getattr(user, "is_staff", False):
        return None
    now = timezone.now()
    membership = (
        user.memberships.filter(role="facility_admin")
        .filter(Q(active_to__isnull=True) | Q(active_to__gte=now))
        .select_related("facility")
        .first()
    )
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
        scoped_facility = _require_admin_role(request.user)
        from apps.scheduling.models import Schedule
        qs = Schedule.objects.select_related(
            "practitioner_role__practitioner",
            "practitioner_role__specialty",
            "practitioner_role__facility",
        ).all()
        if scoped_facility:
            qs = qs.filter(practitioner_role__facility=scoped_facility)
        results = [
            {
                "id": str(s.public_id),
                "practitioner_id": str(s.practitioner_role.practitioner.public_id),
                "practitioner_name": s.practitioner_role.practitioner.name,
                "specialty": s.practitioner_role.specialty.name_en,
                "facility_id": str(s.practitioner_role.facility.public_id),
                "facility_name": s.practitioner_role.facility.name,
                "slots_count": s.slots.count(),
                "recurrence_rules": s.recurrence_rules,
            }
            for s in qs
        ]
        return Response({"results": results, "next_cursor": None})


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


class AdminPermissionsView(views.APIView):
    """The permission catalogue (MASTERPLAN D-16)."""
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        from apps.accounts.admin_services import require_admin
        from apps.accounts.catalogue import PERMISSIONS
        require_admin(request.user)
        return Response({"results": PERMISSIONS, "next_cursor": None})


class AdminStaffView(views.APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        from apps.accounts.admin_services import membership_row, require_admin
        from apps.accounts.models import Membership
        scoped_facility = require_admin(request.user)
        qs = Membership.objects.select_related("user", "facility").order_by("facility__name", "user__display_name")
        if scoped_facility:
            qs = qs.filter(facility=scoped_facility)
        return Response({"results": [membership_row(m) for m in qs], "next_cursor": None})

    def post(self, request):
        from apps.accounts.admin_services import create_staff, membership_row
        from apps.accounts.admin_services import require_admin
        from apps.accounts.serializers import StaffCreateSerializer
        require_admin(request.user)  # role first, so a non-admin learns nothing from validation errors
        s = StaffCreateSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        out = create_staff(request.user, s.validated_data, request)
        body = {**membership_row(out.pop("membership")), **out}  # one-time secrets are returned here and never again
        return Response(body, status=status.HTTP_201_CREATED)


class AdminStaffDetailView(views.APIView):
    permission_classes = [permissions.IsAuthenticated]

    def patch(self, request, public_id):
        from apps.accounts.admin_services import get_membership, membership_row, update_staff
        from apps.accounts.serializers import StaffUpdateSerializer
        s = StaffUpdateSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        m = update_staff(request.user, get_membership(request.user, public_id), s.validated_data, request)
        return Response(membership_row(m))


class AdminStaffActionView(views.APIView):
    """deactivate, reactivate, reset-password, reset-mfa, revoke-sessions."""
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, public_id, action):
        from apps.accounts import admin_services as svc
        from apps.common.exceptions import NotFoundError
        m = svc.get_membership(request.user, public_id)
        if action == "deactivate":
            return Response(svc.membership_row(svc.deactivate_staff(request.user, m, request)))
        if action == "reactivate":
            return Response(svc.membership_row(svc.reactivate_staff(request.user, m, request)))
        if action == "reset-password":
            return Response({"temporary_password": svc.reset_password(request.user, m, request)})
        if action == "reset-mfa":
            return Response({"totp_uri": svc.reset_mfa(request.user, m, request)})
        if action == "revoke-sessions":
            return Response({"revoked": svc.revoke_sessions(request.user, m, request)})
        raise NotFoundError("Unknown action.")


class FhirIntegrationBoundaryView(views.APIView):
    """Controlled FHIR boundary for approved external systems (MASTERPLAN §6.3, DEPLOYMENT §2)."""
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, resource_path=""):
        _require_admin_role(request.user)
        return Response({"resourceType": "OperationOutcome", "path": resource_path, "status": "controlled_boundary"})


class AccessRequestCreateView(views.APIView):
    """Public access request submission (MASTERPLAN D-19, Q-16)."""
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        s = AccessRequestCreateSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        ar = s.save()
        return Response({
            "reference": str(ar.public_id),
            "status": ar.status,
            "message": "Access request submitted successfully.",
        }, status=status.HTTP_201_CREATED)


class AdminAccessRequestListView(views.APIView):
    """List access requests for platform or facility admin (MASTERPLAN D-19)."""
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        scoped_facility = _require_admin_role(request.user)
        qs = AccessRequest.objects.select_related("facility").all()
        if scoped_facility:
            qs = qs.filter(facility=scoped_facility)
        status_filter = request.query_params.get("status")
        if status_filter:
            qs = qs.filter(status=status_filter.upper())
        return Response({"results": AccessRequestSerializer(qs[:100], many=True).data, "next_cursor": None})


class AdminAccessRequestApproveView(views.APIView):
    """Approve clinician or private chamber access request (MASTERPLAN D-19)."""
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, public_id):
        from apps.accounts import admin_services as svc
        from django.db import transaction

        scoped_facility = _require_admin_role(request.user)
        ar = AccessRequest.objects.filter(public_id=public_id).first()
        if not ar:
            raise NotFoundError("Access request not found.")
        if ar.status != "PENDING":
            raise ValidationError(f"Access request is already {ar.status.lower()}.")

        with transaction.atomic():
            if ar.chamber_name:
                # Private chamber setup requires platform admin
                if scoped_facility:
                    raise PermissionDeniedError("Only platform administrators can approve private chamber registrations.")
                fac = Facility.objects.create(
                    name=ar.chamber_name,
                    name_bn=ar.chamber_name_bn or ar.chamber_name,
                    type="private_chamber",
                )
                target_facility = fac
                email = ar.contact if "@" in ar.contact else None
                phone = ar.contact if "@" not in ar.contact else None
                # Create facility_admin membership
                admin_out = svc.create_staff(
                    actor=request.user,
                    data={
                        "facility_id": str(target_facility.public_id),
                        "role": "facility_admin",
                        "email": email,
                        "phone": phone,
                        "display_name": ar.name,
                        "permissions": ["schedule.manage", "referral.acknowledge", "referral.create", "emergency.create"],
                    },
                    request=request,
                )
                # Create clinician membership + Practitioner with BMDC number
                svc.create_staff(
                    actor=request.user,
                    data={
                        "facility_id": str(target_facility.public_id),
                        "role": "clinician",
                        "email": email,
                        "phone": phone,
                        "display_name": ar.name,
                        "registration_number": ar.bmdc_registration_number,
                        "permissions": ["schedule.manage", "referral.acknowledge", "referral.create", "emergency.create"],
                    },
                    request=request,
                )
                out_details = admin_out
            else:
                if not ar.facility:
                    raise ValidationError("Request has neither a target facility nor a chamber name.")
                if scoped_facility and scoped_facility != ar.facility:
                    raise PermissionDeniedError("Cannot approve access requests for other facilities.")
                target_facility = ar.facility
                email = ar.contact if "@" in ar.contact else None
                phone = ar.contact if "@" not in ar.contact else None
                out_details = svc.create_staff(
                    actor=request.user,
                    data={
                        "facility_id": str(target_facility.public_id),
                        "role": "clinician",
                        "email": email,
                        "phone": phone,
                        "display_name": ar.name,
                        "registration_number": ar.bmdc_registration_number,
                        "permissions": ["schedule.manage", "referral.acknowledge", "referral.create", "emergency.create"],
                    },
                    request=request,
                )

            ar.status = "APPROVED"
            ar.reviewed_by = request.user
            ar.reviewed_at = timezone.now()
            ar.save(update_fields=["status", "reviewed_by", "reviewed_at"])

        return Response({
            "status": "APPROVED",
            "facility_id": str(target_facility.public_id),
            "reference": str(ar.public_id),
            "details": {k: v for k, v in out_details.items() if k != "membership"},
        })


class AdminAccessRequestRejectView(views.APIView):
    """Decline an access request with reason (MASTERPLAN D-19)."""
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, public_id):
        scoped_facility = _require_admin_role(request.user)
        ar = AccessRequest.objects.filter(public_id=public_id).first()
        if not ar:
            raise NotFoundError("Access request not found.")
        if ar.status != "PENDING":
            raise ValidationError(f"Access request is already {ar.status.lower()}.")
        if ar.facility and scoped_facility and scoped_facility != ar.facility:
            raise PermissionDeniedError("Cannot reject access requests for other facilities.")

        s = AccessRequestRejectSerializer(data=request.data)
        s.is_valid(raise_exception=True)

        ar.status = "REJECTED"
        ar.rejection_reason = s.validated_data["reason"]
        ar.reviewed_by = request.user
        ar.reviewed_at = timezone.now()
        ar.save(update_fields=["status", "rejection_reason", "reviewed_by", "reviewed_at"])

        return Response({
            "status": "REJECTED",
            "reference": str(ar.public_id),
            "reason": ar.rejection_reason,
        })
