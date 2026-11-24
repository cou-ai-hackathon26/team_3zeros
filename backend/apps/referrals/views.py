from rest_framework import views, permissions, status
from rest_framework.response import Response
from .serializers import (
    ReferralSerializer,
    ReferralCreateSerializer,
    ReferralUpdateSerializer,
    EmergencyReferralCreateSerializer,
    PartialReferralIntakeSerializer,
    ReferralActionSerializer,
)
from .selectors import (
    list_referrals,
    get_referral_by_public_id,
    get_referral_by_code,
)
from .services import (
    create_referral_draft,
    update_referral_draft,
    create_emergency_referral,
    create_partial_referral_intake,
    execute_referral_transition,
)
from apps.common.idempotency import resolve_idempotent_replay, persist_idempotent_response
from apps.common.pagination import CursorPagination
from apps.common.exceptions import PermissionDeniedError, ValidationError
from .transitions import is_sender_clinician

class ReferralListCreateView(views.APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        direction = request.query_params.get("direction")
        state = request.query_params.get("state")
        queryset = list_referrals(request.user, direction=direction, state=state)
        paginator = CursorPagination()
        page = paginator.paginate_queryset(queryset, request)
        serializer = ReferralSerializer(page, many=True, context={"request": request})
        return paginator.get_paginated_response(serializer.data)

    def post(self, request):
        serializer = ReferralCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        request_id = getattr(request, "request_id", "")
        header_idempotency_key = request.headers.get("Idempotency-Key")
        referral = create_referral_draft(
            request.user,
            serializer.validated_data,
            request_id=request_id,
            idempotency_key=header_idempotency_key,
            active_facility_id=request.session.get("active_facility_id"),
        )
        http_status = (
            status.HTTP_200_OK
            if getattr(referral, "_idempotency_replayed", False)
            else status.HTTP_201_CREATED
        )
        return Response(
            ReferralSerializer(referral, context={"request": request}).data,
            status=http_status,
        )


class ReferralDetailView(views.APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, public_id):
        referral = get_referral_by_public_id(request.user, public_id)
        return Response(ReferralSerializer(referral, context={"request": request}).data)

    def patch(self, request, public_id):
        serializer = ReferralUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        request_id = getattr(request, "request_id", "")
        if_match = request.headers.get("If-Match")
        try:
            version = int(if_match.strip('"')) if if_match else None
        except ValueError:
            raise ValidationError("Invalid If-Match version header.")
        referral = update_referral_draft(request.user, public_id, serializer.validated_data, request_id=request_id, if_match=version)
        return Response(ReferralSerializer(referral, context={"request": request}).data)


class ReferralActionView(views.APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, public_id, action):
        replayed = resolve_idempotent_replay(request)
        if replayed is not None:
            return replayed

        serializer = ReferralActionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        if_match_header = request.headers.get("If-Match")
        if_match = None
        if if_match_header:
            try:
                if_match = int(if_match_header.strip('"'))
            except ValueError:
                raise ValidationError("Invalid If-Match version header.")

        request_id = getattr(request, "request_id", "")
        referral, allowed_actions = execute_referral_transition(
            user=request.user,
            referral_public_id=public_id,
            action=action,
            payload=serializer.validated_data,
            if_match=if_match,
            request_id=request_id,
        )
        # 202: the action is accepted but its FHIR write is still pending (INV-12).
        http_status = status.HTTP_202_ACCEPTED if referral.pending_action else status.HTTP_200_OK
        response = Response(ReferralSerializer(referral, context={"request": request}).data, status=http_status)
        persist_idempotent_response(request, response)
        return response


class EmergencyReferralView(views.APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        serializer = EmergencyReferralCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        request_id = getattr(request, "request_id", "")
        referral = create_emergency_referral(request.user, serializer.validated_data, request_id=request_id, active_facility_id=request.session.get("active_facility_id"))
        return Response(
            ReferralSerializer(referral, context={"request": request}).data,
            status=status.HTTP_201_CREATED,
        )


class PartialReferralIntakeView(views.APIView):
    """Receiving-facility intake when a patient arrives before the full referral has synced (Phase 3B)."""
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        serializer = PartialReferralIntakeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        request_id = getattr(request, "request_id", "")
        header_key = request.headers.get("Idempotency-Key")
        referral = create_partial_referral_intake(
            request.user,
            serializer.validated_data,
            request_id=request_id,
            idempotency_key=header_key,
        )
        http_status = (
            status.HTTP_200_OK
            if getattr(referral, "_idempotency_replayed", False)
            else status.HTTP_201_CREATED
        )
        return Response(
            ReferralSerializer(referral, context={"request": request}).data,
            status=http_status,
        )


class ReferralByReferenceView(views.APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, code):
        referral = get_referral_by_code(request.user, code)
        return Response(ReferralSerializer(referral, context={"request": request}).data)


class ReferralGenerateDraftView(views.APIView):
    """Queue AI summary draft generation for a DRAFT referral (MASTERPLAN §6.3, INV-7)."""
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, public_id):
        from apps.workflow.models import OutboxEvent
        referral = get_referral_by_public_id(request.user, public_id)
        if not is_sender_clinician(request.user, referral, None):
            raise PermissionDeniedError("Only a clinician at the sending facility can request an AI draft.")
        if referral.state != "DRAFT":
            raise ValidationError("AI draft can only be generated while referral is in DRAFT state.")
        OutboxEvent.objects.create(
            aggregate_type="referral",
            aggregate_id=referral.public_id,
            event_type="referral.draft_requested",
            payload={"id": str(referral.public_id)},
        )
        return Response(
            {"referral_id": str(referral.public_id), "status": "queued"},
            status=status.HTTP_202_ACCEPTED,
        )


