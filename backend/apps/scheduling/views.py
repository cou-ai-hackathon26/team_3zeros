from rest_framework import views, permissions, status
from rest_framework.response import Response
from .serializers import (
    SlotSerializer,
    AppointmentSerializer,
    AppointmentCreateSerializer,
    AppointmentActionSerializer,
)
from .selectors import (
    list_practitioner_slots,
    list_appointments,
    get_appointment_by_public_id,
)
from .services import (
    create_appointment_request,
    execute_appointment_transition,
)
from apps.common.pagination import CursorPagination
from apps.common.exceptions import ValidationError

class PractitionerSlotsView(views.APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request, practitioner_id):
        facility_id = request.query_params.get("facility")
        from_date = request.query_params.get("from")
        to_date = request.query_params.get("to")
        queryset = list_practitioner_slots(
            practitioner_id=practitioner_id,
            facility_id=facility_id,
            from_date=from_date,
            to_date=to_date,
        )
        serializer = SlotSerializer(queryset, many=True)
        return Response(serializer.data)


class AppointmentListCreateView(views.APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        state = request.query_params.get("state")
        role_view = request.query_params.get("role_view")
        queryset = list_appointments(request.user, state=state, role_view=role_view)
        paginator = CursorPagination()
        page = paginator.paginate_queryset(queryset, request)
        serializer = AppointmentSerializer(page, many=True, context={"request": request})
        return paginator.get_paginated_response(serializer.data)

    def post(self, request):
        serializer = AppointmentCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        request_id = getattr(request, "request_id", "")
        patient_id = serializer.validated_data.get("patient_id")
        if not patient_id:
            if hasattr(request.user, "patient_account") and request.user.patient_account.patient:
                patient_id = request.user.patient_account.patient.public_id
            else:
                raise ValidationError("patient_id is required.")
        else:
            if hasattr(request.user, "patient_account") and str(request.user.patient_account.patient.public_id) != str(patient_id):
                if not (request.user.is_staff or request.user.memberships.exists() or getattr(request.user, "is_superuser", False)):
                    from apps.common.exceptions import PermissionDeniedError
                    raise PermissionDeniedError("Cannot create appointment for another patient.")

        appointment = create_appointment_request(
            user=request.user,
            patient_id=patient_id,
            slot_id=serializer.validated_data["slot_id"],
            triage_session_id=serializer.validated_data.get("triage_session_id"),
            request_id=request_id,
        )
        return Response(
            AppointmentSerializer(appointment, context={"request": request}).data,
            status=status.HTTP_201_CREATED,
        )


class AppointmentDetailView(views.APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, public_id):
        appointment = get_appointment_by_public_id(request.user, public_id)
        return Response(AppointmentSerializer(appointment, context={"request": request}).data)


class AppointmentActionView(views.APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, public_id, action):
        serializer = AppointmentActionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        if_match_header = request.headers.get("If-Match")
        if_match = None
        if if_match_header:
            try:
                if_match = int(if_match_header.strip('"'))
            except ValueError:
                raise ValidationError("Invalid If-Match version header.")

        request_id = getattr(request, "request_id", "")
        appointment, allowed_actions = execute_appointment_transition(
            user=request.user,
            appointment_public_id=public_id,
            action=action,
            payload=serializer.validated_data,
            if_match=if_match,
            request_id=request_id,
        )
        return Response(AppointmentSerializer(appointment, context={"request": request}).data)

