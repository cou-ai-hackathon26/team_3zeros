from rest_framework import views, permissions, status
from rest_framework.response import Response
from django.utils import timezone
from apps.common.exceptions import NotAuthenticatedError, ValidationError
from apps.common.pagination import CursorPagination
from apps.ai.translate import translate_text
from .models import TriageSession, TriageSummary
from .providers.placeholder import get_voice_provider
from .serializers import (
    TriageSessionSerializer,
    TriageSessionCreateSerializer,
    TurnCreateSerializer,
    TurnSerializer,
    SummaryConfirmSerializer,
)
from .services import (
    attach_consultation_report,
    create_triage_session,
    get_triage_session_for_patient_mutation,
    get_triage_session_for_read,
    list_patient_triage_sessions,
    process_patient_turn,
    run_triage_action,
)


def _parse_if_match(request):
    raw = request.headers.get("If-Match")
    if not raw:
        return None
    try:
        return int(raw.strip('"'))
    except ValueError:
        raise ValidationError("Invalid If-Match version header.")


class TriageSessionCreateView(views.APIView):
    """
    GET /triage/sessions: authenticated patient's own sessions (resolves G-6).
    POST /triage/sessions: create a new triage session (AllowAny per Q-03).
    """
    permission_classes = [permissions.AllowAny]

    def get(self, request):
        if not request.user or not request.user.is_authenticated:
            raise NotAuthenticatedError("Authentication required to list triage sessions.")
        state_param = request.query_params.get("state")
        states = [s.strip() for s in state_param.split(",") if s.strip()] if state_param else None
        qs = list_patient_triage_sessions(request.user, states=states)
        paginator = CursorPagination()
        page = paginator.paginate_queryset(qs, request)
        serializer = TriageSessionSerializer(page, many=True, context={"request": request})
        return paginator.get_paginated_response(serializer.data)

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
        return Response(
            TriageSessionSerializer(session, context={"request": request}).data,
            status=status.HTTP_201_CREATED,
        )


class TriageSessionDetailView(views.APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request, public_id):
        session, is_clinician_view = get_triage_session_for_read(request.user, public_id)
        return Response(
            TriageSessionSerializer(
                session,
                context={"request": request, "clinician_view": is_clinician_view},
            ).data
        )


class TriageTurnCreateView(views.APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request, public_id):
        session = get_triage_session_for_patient_mutation(request.user, public_id)
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


class TriagePauseView(views.APIView):
    """Patient pauses an ACTIVE session (§5.3 pause)."""
    permission_classes = [permissions.AllowAny]

    def post(self, request, public_id):
        session = get_triage_session_for_patient_mutation(request.user, public_id)
        run_triage_action(
            session,
            "pause",
            request.user,
            expected_version=_parse_if_match(request),
            request_id=getattr(request, "request_id", ""),
        )
        return Response(TriageSessionSerializer(session, context={"request": request}).data)


class TriageResumeView(views.APIView):
    """Patient resumes a PAUSED session (§5.3 resume)."""
    permission_classes = [permissions.AllowAny]

    def post(self, request, public_id):
        session = get_triage_session_for_patient_mutation(request.user, public_id)
        run_triage_action(
            session,
            "resume",
            request.user,
            expected_version=_parse_if_match(request),
            request_id=getattr(request, "request_id", ""),
        )
        return Response(TriageSessionSerializer(session, context={"request": request}).data)


class TriageSummaryConfirmView(views.APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request, public_id):
        session = get_triage_session_for_patient_mutation(request.user, public_id)
        serializer = SummaryConfirmSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        session.ended_at = timezone.now()
        run_triage_action(
            session,
            "confirm_summary",
            request.user,
            expected_version=_parse_if_match(request),
            request_id=getattr(request, "request_id", ""),
        )

        summary, _ = TriageSummary.objects.get_or_create(session=session)
        summary.patient_confirmed_at = timezone.now()
        edits = serializer.validated_data.get("edits", {})
        if edits:
            merged_edits = dict(summary.patient_edits or {})
            merged_edits.update(edits)
            summary.patient_edits = merged_edits
        summary.save()

        return Response(TriageSessionSerializer(session, context={"request": request}).data)


class TriageFinishView(views.APIView):
    """Patient says they are done answering; the summary is then ready to review (§5.3 finish_questions)."""
    permission_classes = [permissions.AllowAny]

    def post(self, request, public_id):
        session = get_triage_session_for_patient_mutation(request.user, public_id)
        run_triage_action(
            session,
            "finish_questions",
            request.user,
            expected_version=_parse_if_match(request),
            request_id=getattr(request, "request_id", ""),
        )
        attach_consultation_report(session)
        return Response(TriageSessionSerializer(session, context={"request": request}).data)


class TriageEndView(views.APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request, public_id):
        session = get_triage_session_for_patient_mutation(request.user, public_id)
        session.ended_at = timezone.now()
        run_triage_action(
            session,
            "end",
            request.user,
            expected_version=_parse_if_match(request),
            request_id=getattr(request, "request_id", ""),
        )
        get_voice_provider().end_session(session.provider_session_ref)
        return Response(TriageSessionSerializer(session, context={"request": request}).data)


class TriageVoiceCredentialsView(views.APIView):
    """Issue short-lived single-session provider credentials with random session_ref only (MASTERPLAN §6.3, SECURITY §8.1, Q-05)."""
    permission_classes = [permissions.AllowAny]

    def post(self, request, public_id):
        session = get_triage_session_for_patient_mutation(request.user, public_id)
        creds = get_voice_provider().create_session(session.provider_session_ref, session.language)
        return Response(creds.to_dict())


class TriageProviderEventsView(views.APIView):
    """Server-to-server signed webhook from voice provider (MASTERPLAN §6.3, SECURITY §8.1, Q-05)."""
    permission_classes = [permissions.AllowAny]
    authentication_classes = []

    def post(self, request):
        provider = get_voice_provider()
        event = provider.verify_webhook(request)
        if event.event_type == "transcript" and event.transcript and event.session_ref:
            # Voice turns go through the same orchestrator as text turns (D-08, INV-8).
            session = TriageSession.objects.filter(provider_session_ref=event.session_ref).first()
            if session and session.state in ("ACTIVE", "PAUSED"):
                reply = process_patient_turn(session, event.transcript, request_id=getattr(request, "request_id", ""))
                provider.speak(event.session_ref, reply.text, session.language)
                if reply.response_policy == "emergency":
                    provider.end_session(event.session_ref)  # INV-16
        return Response({"received": True, "type": event.event_type})


class TriageCaptionTranslateView(views.APIView):
    """Machine translation of one caption line for the call screen (MASTERPLAN D-22). Never stored."""
    permission_classes = [permissions.AllowAny]

    def post(self, request, public_id):
        get_triage_session_for_patient_mutation(request.user, public_id)
        text = str(request.data.get("text", "")).strip()[:1000]
        source = request.data.get("source")
        if not text or source not in ("bn", "en"):
            raise ValidationError("text and source (bn|en) are required.")
        target = "en" if source == "bn" else "bn"
        translated = translate_text(text, source, target)
        return Response({"text": translated, "lang": target, "machine": True} if translated else {"text": None, "lang": target, "machine": True})
