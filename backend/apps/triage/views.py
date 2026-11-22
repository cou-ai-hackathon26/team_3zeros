from rest_framework import views, permissions, status
from rest_framework.response import Response
from django.utils import timezone
from .models import TriageSession, TriageSummary
from .serializers import (
    TriageSessionSerializer,
    TriageSessionCreateSerializer,
    TurnCreateSerializer,
    TurnSerializer,
    SummaryConfirmSerializer,
)
from .services import create_triage_session, process_patient_turn
from apps.common.exceptions import NotFoundError, TransitionNotAllowedError
from apps.audit.services import record_audit_event

class TriageSessionCreateView(views.APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        serializer = TriageSessionCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        request_id = getattr(request, "request_id", "")
        session = create_triage_session(
            user=request.user,
            language=serializer.validated_data["language"],
            mode=serializer.validated_data["mode"],
            disclosure_version=serializer.validated_data["triage_disclosure_version"],
            request_id=request_id,
        )
        return Response(TriageSessionSerializer(session).data, status=status.HTTP_201_CREATED)


class TriageSessionDetailView(views.APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request, public_id):
        session = TriageSession.objects.filter(public_id=public_id).prefetch_related("turns").first()
        if not session:
            raise NotFoundError("Triage session not found.")
        return Response(TriageSessionSerializer(session).data)


class TriageTurnCreateView(views.APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request, public_id):
        session = TriageSession.objects.filter(public_id=public_id).first()
        if not session:
            raise NotFoundError("Triage session not found.")

        serializer = TurnCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        request_id = getattr(request, "request_id", "")
        reply_turn = process_patient_turn(
            session=session,
            text=serializer.validated_data["text"],
            user=request.user,
            request_id=request_id,
        )
        return Response(TurnSerializer(reply_turn).data)


class TriageSummaryConfirmView(views.APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request, public_id):
        session = TriageSession.objects.filter(public_id=public_id).first()
        if not session:
            raise NotFoundError("Triage session not found.")

        serializer = SummaryConfirmSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        session.state = "CONFIRMED_BY_PATIENT"
        session.ended_at = timezone.now()
        session.save()

        summary, _ = TriageSummary.objects.get_or_create(session=session)
        summary.patient_confirmed_at = timezone.now()
        summary.patient_edits = serializer.validated_data.get("edits", {})
        summary.save()

        return Response(TriageSessionSerializer(session).data)


class TriageEndView(views.APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request, public_id):
        session = TriageSession.objects.filter(public_id=public_id).first()
        if not session:
            raise NotFoundError("Triage session not found.")

        session.state = "ENDED_BY_PATIENT"
        session.ended_at = timezone.now()
        session.save()
        return Response(TriageSessionSerializer(session).data)
