from django.db import transaction
from django.utils import timezone
from .models import TriageSession, Turn, TriageSummary
from .normalizer import normalize_for_matching, normalize_text
from .policy import (
    PLACEHOLDER_GUIDANCE_SOURCES,
    infer_specialty,
    validate_assistant_output,
)
from .rules.engine import evaluate_session_red_flags
from .transitions import TRIAGE_TRANSITIONS, is_session_patient
from apps.audit.services import record_audit_event
from apps.common.exceptions import (
    ConsentRequiredError,
    NotFoundError,
    TransitionNotAllowedError,
    ValidationError,
)
from apps.workflow.engine import execute_transition
from apps.workflow.models import OutboxEvent


def run_triage_action(session, action, actor=None, payload=None, expected_version=None, request_id=""):
    """Apply a MASTERPLAN §5.3 action. `actor=None` means the system."""
    session.TRANSITIONS = TRIAGE_TRANSITIONS
    return execute_transition(
        session,
        action,
        actor,
        payload=payload,
        expected_version=expected_version,
        request_id=request_id,
    )[0]


def list_patient_triage_sessions(user, states=None):
    """Return triage sessions owned by the authenticated patient, newest first."""
    if not user or not getattr(user, "is_authenticated", False):
        return TriageSession.objects.none()
    account = getattr(user, "patient_account", None)
    if not account or not account.patient_id:
        return TriageSession.objects.none()

    qs = (
        TriageSession.objects.filter(patient_id=account.patient_id)
        .select_related("summary")
        .prefetch_related("turns")
        .order_by("-started_at")
    )
    if states:
        qs = qs.filter(state__in=states)
    return qs


def _clinician_has_appointment_relationship(user, session: TriageSession) -> bool:
    """True when authenticated staff belongs to a facility with an appointment linked to this triage session."""
    if not user or not getattr(user, "is_authenticated", False):
        return False
    facility_ids = list(user.memberships.values_list("facility_id", flat=True))
    if not facility_ids:
        return False
    from apps.scheduling.models import Appointment

    return Appointment.objects.filter(
        triage_session_id=session.public_id,
        facility_id__in=facility_ids,
    ).exists()


def get_triage_session_for_read(user, public_id):
    """
    Fetch a triage session with strict scoping (SECURITY §4.3, INV-9):
    - Patient owner (or guest UUID holder when patient=None) -> (session, False)
    - Care-relationship clinician/staff -> (session, True) [summary only, turns omitted]
    - Any other caller -> 404 not_found (never leak existence)
    """
    session = (
        TriageSession.objects.filter(public_id=public_id)
        .select_related("summary")
        .prefetch_related("turns")
        .first()
    )
    if not session:
        raise NotFoundError("Triage session not found.")

    if is_session_patient(user, session, None):
        return session, False

    if _clinician_has_appointment_relationship(user, session):
        return session, True

    raise NotFoundError("Triage session not found.")


def get_triage_session_for_patient_mutation(user, public_id) -> TriageSession:
    """Fetch a triage session strictly for its owning patient (or guest holder); else 404."""
    session = (
        TriageSession.objects.filter(public_id=public_id)
        .select_related("summary")
        .first()
    )
    if not session or not is_session_patient(user, session, None):
        raise NotFoundError("Triage session not found.")
    return session


def validate_and_claim_triage_session(session_id, patient, actor, request_id="") -> TriageSession:
    """
    Validate that `session_id` exists, is CONFIRMED_BY_PATIENT, and belongs to `patient`
    (or is an unclaimed guest session `patient=None`, which gets claimed atomically).
    Called inside `create_appointment_request`'s atomic transaction.
    """
    session = TriageSession.objects.select_for_update().filter(public_id=session_id).first()
    if not session:
        raise NotFoundError("Triage session not found.")
    if session.patient_id is not None and session.patient_id != patient.id:
        raise NotFoundError("Triage session not found.")
    if session.state != "CONFIRMED_BY_PATIENT":
        raise ValidationError(
            "Triage session summary must be confirmed before attaching to an appointment."
        )

    if session.patient_id is None:
        session.patient = patient
        session.save(update_fields=["patient", "updated_at"])
        record_audit_event(
            action="update",
            object_type="triage_session",
            object_id=str(session.public_id),
            actor_user=actor,
            patient_id=str(patient.public_id),
            reason="Claimed guest triage session on appointment request (Q-03)",
            request_id=request_id,
        )
    return session


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
        )
        run_triage_action(session, "connect", request_id=request_id)  # CREATED -> ACTIVE

        greeting = (
            "Hello, I am the Medi Waypoint automated care guide. What symptoms are you experiencing today?"
            if language == "en"
            else "নমস্কার, আমি মেডি ওয়েপয়েন্ট স্বয়ংক্রিয় স্বাস্থ্য নির্দেশিকা। আজ আপনার কী শারীরিক সমস্যা হচ্ছে বলুন?"
        )
        safe_greeting, policy = validate_assistant_output(greeting, language=language, intended_policy="question")
        Turn.objects.create(
            session=session,
            role="assistant",
            text=safe_greeting,
            language_detected=language,
            response_policy=policy,
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


def _build_clinical_dialogue_and_summary(session: TriageSession, latest_text: str):
    """
    Multi-turn grounded clinical intake progression and TriageSummary draft builder.
    Normalizes Bangla/English input, maps to canonical directory Specialty.code,
    and passes every assistant reply through the INV-7 output validator.
    """
    patient_turns = list(
        session.turns.filter(role="patient").order_by("at").values_list("text", flat=True)
    )
    turn_count = len(patient_turns)
    combined_words = " | ".join(patient_turns)
    norm_all = normalize_for_matching(combined_words)

    specialty = infer_specialty(combined_words)

    if turn_count >= 2:
        duration_val = patient_turns[1]
    elif any(k in norm_all for k in ["day", "days", "week", "weeks", "দিন", "সপ্তাহ"]):
        duration_val = normalize_text(latest_text)
    else:
        duration_val = "উল্লেখ করা হয়নি / Pending"

    if any(k in norm_all for k in ["তীব্র", "বেশি", "প্রচণ্ড", "severe", "high", "strong"]):
        severity_val = "তীব্র / Severe"
    elif any(k in norm_all for k in ["হালকা", "কম", "mild", "light", "slight"]):
        severity_val = "হালকা / Mild"
    else:
        severity_val = "মাঝারি / Moderate"

    summary, _ = TriageSummary.objects.get_or_create(session=session)
    summary.patient_words = combined_words
    summary.structured_fields = {
        "chief_complaint": patient_turns[0] if patient_turns else latest_text,
        "duration": duration_val,
        "severity": severity_val,
        "additional_notes": "; ".join(patient_turns[2:]) if turn_count >= 3 else "",
        "red_flag_check": "No deterministic red flags triggered (INV-8)",
        "suggested_specialty_code": specialty["code"],
        "suggested_specialty_en": specialty["en"],
        "suggested_specialty_bn": specialty["bn"],
        "guidance_sources": PLACEHOLDER_GUIDANCE_SOURCES,
    }
    summary.guidance_given = (
        f"Recommended outpatient consultation in {specialty['en']}. Carry previous reports if available."
        if session.language == "en"
        else f"পরামর্শ: {specialty['bn']} বিভাগে বহির্বিভাগীয় ডাক্তারের পরামর্শ নিন। পূর্ববর্তী রিপোর্ট থাকলে সাথে রাখুন।"
    )
    summary.save()

    if turn_count == 1:
        reply = (
            f"I heard: \"{latest_text}\". How many days have you had this symptom, and is the discomfort mild, moderate, or severe?"
            if session.language == "en"
            else f"আমি শুনেছি: \"{latest_text}\"। এই সমস্যাটি কতদিন ধরে হচ্ছে এবং তীব্রতা কেমন—হালকা, মাঝারি, নাকি বেশি?"
        )
    elif turn_count == 2:
        reply = (
            "Got it. Do you also have fever, nausea, dizziness, or any long-term conditions like diabetes or high blood pressure?"
            if session.language == "en"
            else "বুঝেছি। এর সাথে কি জ্বর, বমি ভাব, মাথা ঘোরা কিংবা ডায়াবেটিস বা উচ্চ রক্তচাপের মতো কোনো পূর্ববর্তী সমস্যা আছে?"
        )
    elif turn_count == 3:
        reply = (
            f"Thank you. Based on your answers, an outpatient visit with {specialty['en']} is appropriate. Are you taking any medicines right now, or would you like to review your summary?"
            if session.language == "en"
            else f"ধন্যবাদ। আপনার লক্ষণ অনুযায়ী {specialty['bn']} বিভাগের ডাক্তার দেখানো উপযুক্ত হবে। আপনি কি বর্তমানে কোনো ওষুধ খাচ্ছেন, নাকি এখনই খসড়া সারাংশ যাচাই করতে চান?"
        )
    else:
        reply = (
            f"Your intake summary for {specialty['en']} is ready. You can share any additional detail, or tap 'Finish & review summary' below."
            if session.language == "en"
            else f"{specialty['bn']} ডাক্তারের জন্য আপনার খসড়া সারাংশ প্রস্তুত। আরও কিছু যোগ করতে চাইলে জানান, অথবা নিচে 'সারাংশ যাচাই করুন' বাটনে চাপুন।"
        )

    return validate_assistant_output(reply, language=session.language, intended_policy="question")


def process_patient_turn(session: TriageSession, text: str, user=None, request_id=""):
    if session.state in ("EMERGENCY_PATHWAY", "CONFIRMED_BY_PATIENT", "ENDED_BY_PATIENT", "ABANDONED"):
        raise TransitionNotAllowedError(f"Session is already closed in state '{session.state}'.")

    cleaned_text = normalize_text(text)
    if not cleaned_text:
        raise ValidationError("Turn text cannot be empty.")

    with transaction.atomic():
        if session.state == "PAUSED":
            run_triage_action(session, "resume", actor=user, request_id=request_id)

        Turn.objects.create(
            session=session,
            role="patient",
            text=cleaned_text,
            language_detected=session.language,
            response_policy="question",
        )

        # Deterministic red-flag check across cumulative patient turns (INV-8, BACKEND §8.2)
        all_patient_turns = list(
            session.turns.filter(role="patient").order_by("at").values_list("text", flat=True)
        )
        is_emergency, hits, instruction = evaluate_session_red_flags(
            all_patient_turns,
            language=session.language,
        )

        if is_emergency:
            session.ended_at = timezone.now()
            run_triage_action(session, "red_flag", request_id=request_id)

            assistant_turn = Turn.objects.create(
                session=session,
                role="assistant",
                text=instruction,
                language_detected=session.language,
                red_flag_hits=hits,
                response_policy="emergency",
            )

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

        next_reply, response_policy = _build_clinical_dialogue_and_summary(session, cleaned_text)
        assistant_turn = Turn.objects.create(
            session=session,
            role="assistant",
            text=next_reply,
            language_detected=session.language,
            response_policy=response_policy,
        )
        return assistant_turn
