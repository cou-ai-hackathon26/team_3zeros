from rest_framework import views, permissions, status
from rest_framework.response import Response
from .serializers import (
    ReferralSerializer,
    ReferralCreateSerializer,
    ReferralUpdateSerializer,
    EmergencyReferralCreateSerializer,
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
    execute_referral_transition,
)
from apps.common.pagination import CursorPagination
from apps.common.exceptions import ValidationError

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
        referral = create_referral_draft(request.user, serializer.validated_data, request_id=request_id)
        return Response(
            ReferralSerializer(referral, context={"request": request}).data,
            status=status.HTTP_201_CREATED,
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
        referral = update_referral_draft(request.user, public_id, serializer.validated_data, request_id=request_id)
        return Response(ReferralSerializer(referral, context={"request": request}).data)


class ReferralActionView(views.APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, public_id, action):
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
        return Response(ReferralSerializer(referral, context={"request": request}).data)


class EmergencyReferralView(views.APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        serializer = EmergencyReferralCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        request_id = getattr(request, "request_id", "")
        referral = create_emergency_referral(request.user, serializer.validated_data, request_id=request_id)
        return Response(
            ReferralSerializer(referral, context={"request": request}).data,
            status=status.HTTP_201_CREATED,
        )


class ReferralByReferenceView(views.APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, code):
        referral = get_referral_by_code(request.user, code)
        return Response(ReferralSerializer(referral, context={"request": request}).data)
