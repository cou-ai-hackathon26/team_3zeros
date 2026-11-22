from django.db import transaction
from django.utils import timezone
from .models import TriageSession, Turn, TriageSummary
from .rules.engine import evaluate_red_flags
from apps.audit.services import record_audit_event
from apps.common.exceptions import NotFoundError, ConsentRequiredError, TransitionNotAllowedError
from apps.workflow.models import OutboxEvent

def create_triage_session(user, language="bn", mode="text", disclosure_version="", request_id=""):
    if not disclosure_version:
        raise ConsentRequiredError("Patient must accept triage disclosure before starting triage session.")

    patient = (
        user.patient_account.patient
        if user and getattr(user, "is_authenticated", False) and hasattr(user, "patient_account")
        else None
    )

    with transaction.atomic():
        session = TriageSession.objects.create(
            patient=patient,
            language=language,
            mode=mode,
            triage_disclosure_version=disclosure_version,
            triage_disclosure_accepted_at=timezone.now(),
            state="ACTIVE",  # Starts in ACTIVE on first interaction
        )

        # Initial assistant greeting
        greeting = (
            "Hello, I am the Medi Waypoint health assistant. What symptoms are you experiencing today?"
            if language == "en"
            else "নমস্কার, আমি আপনার মেডি ওয়েপয়েন্ট স্বাস্থ্য সহকারী। আপনার কি শারীরিক সমস্যা হচ্ছে বলুন?"
        )
        Turn.objects.create(
            session=session,
            role="assistant",
            text=greeting,
            language_detected=language,
            response_policy="question",
        )

        record_audit_event(
            action="create",
            object_type="triage_session",
            object_id=str(session.public_id),
            actor_user=user,
            patient_id=str(patient.public_id) if patient else None,
            request_id=request_id,
        )
        return session


def process_patient_turn(session: TriageSession, text: str, user=None, request_id=""):
    if session.state in ("EMERGENCY_PATHWAY", "CONFIRMED_BY_PATIENT", "ENDED_BY_PATIENT", "ABANDONED"):
        raise TransitionNotAllowedError(f"Session is already closed in state '{session.state}'.")

    with transaction.atomic():
        # Record patient utterance turn
        Turn.objects.create(
            session=session,
            role="patient",
            text=text,
            language_detected=session.language,
            response_policy="question",
        )

        # Run deterministic red-flag engine
        is_emergency, hits, instruction = evaluate_red_flags(text, language=session.language)

        if is_emergency:
            session.state = "EMERGENCY_PATHWAY"
            session.ended_at = timezone.now()
            session.save()

            # Record emergency assistant turn
            assistant_turn = Turn.objects.create(
                session=session,
                role="assistant",
                text=instruction,
                language_detected=session.language,
                red_flag_hits=hits,
                response_policy="emergency",
            )

            # Push real-time outbox event
            OutboxEvent.objects.create(
                aggregate_type="triage_session",
                aggregate_id=session.public_id,
                event_type="triage.emergency",
                payload={"session_id": str(session.public_id), "hits": hits},
            )

            record_audit_event(
                action="transition",
                object_type="triage_session",
                object_id=str(session.public_id),
                actor_user=user,
                outcome="emergency_flagged",
                reason=f"Red flag hit: {[h['rule_id'] for h in hits]}",
                request_id=request_id,
            )
            return assistant_turn

        # Otherwise continue question flow or prepare summary draft
        next_reply = (
            "Thank you. How long have you had this symptom, and how severe is it?"
            if session.language == "en"
            else "ধন্যবাদ। লক্ষণটি কতদিন ধরে আছে এবং তীব্রতা কেমন?"
        )
        assistant_turn = Turn.objects.create(
            session=session,
            role="assistant",
            text=next_reply,
            language_detected=session.language,
            response_policy="question",
        )
        return assistant_turn
