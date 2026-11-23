from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from apps.common.exceptions import NotFoundError
from .models import EDVisit
from .serializers import (
    EDVisitCreateSerializer,
    EDVisitSerializer,
    EDVisitActionSerializer,
)
from .services import create_ed_visit, execute_ed_visit_transition

class EDVisitListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        membership = user.memberships.first()
        facility = membership.facility if membership else None

        qs = EDVisit.objects.select_related(
            "facility",
            "patient",
            "encounter",
            "triaged_by",
            "transfer_facility",
        ).prefetch_related("encounter__observations")

        if not (hasattr(user, "platform_admin") or getattr(user, "is_platform_admin", False)):
            if facility:
                qs = qs.filter(facility=facility)
            else:
                qs = qs.none()

        state_param = request.query_params.get("state")
        if state_param:
            states = [s.strip() for s in state_param.split(",") if s.strip()]
            qs = qs.filter(state__in=states)

        serializer = EDVisitSerializer(qs, many=True, context={"request": request})
        return Response({"results": serializer.data, "next_cursor": None})

    def post(self, request):
        serializer = EDVisitCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        visit = create_ed_visit(
            user=request.user,
            validated_data=serializer.validated_data,
            request_id=getattr(request, "request_id", ""),
        )
        output = EDVisitSerializer(visit, context={"request": request}).data
        return Response(output, status=status.HTTP_201_CREATED)

class EDVisitDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, id):
        visit = EDVisit.objects.select_related(
            "facility",
            "patient",
            "encounter",
            "triaged_by",
            "transfer_facility",
        ).prefetch_related("encounter__observations").filter(public_id=id).first()

        if not visit:
            raise NotFoundError("Emergency visit not found.")

        output = EDVisitSerializer(visit, context={"request": request}).data
        return Response(output)

class EDVisitActionView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, id, action):
        if_match = request.headers.get("If-Match")
        expected_version = int(if_match) if if_match and if_match.isdigit() else None

        serializer = EDVisitActionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        visit, allowed_actions = execute_ed_visit_transition(
            user=request.user,
            visit_public_id=id,
            action=action,
            payload=serializer.validated_data,
            if_match=expected_version,
            request_id=getattr(request, "request_id", ""),
        )

        output = EDVisitSerializer(visit, context={"request": request}).data
        return Response(output)

