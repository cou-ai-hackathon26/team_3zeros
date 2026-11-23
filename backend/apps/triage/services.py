from django.db import transaction
from django.utils import timezone
from .models import TriageSession, Turn, TriageSummary
from .rules.engine import evaluate_red_flags
from apps.audit.services import record_audit_event
from apps.common.exceptions import NotFoundError, ConsentRequiredError, TransitionNotAllowedError
from apps.workflow.models import OutboxEvent
from apps.workflow.engine import execute_transition
from .transitions import TRIAGE_TRANSITIONS


def run_triage_action(session, action, actor=None, payload=None, request_id=""):
    """Apply a MASTERPLAN §5.3 action. `actor=None` means the system."""
    session.TRANSITIONS = TRIAGE_TRANSITIONS
    return execute_transition(session, action, actor, payload=payload, request_id=request_id)[0]

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


def _build_clinical_dialogue_and_summary(session: TriageSession, latest_text: str):
    """
    Multi-turn grounded clinical intake progression and TriageSummary draft builder.
    Tracks patient turns to ask progressive, non-repetitive clinical wayfinding questions
    and keeps TriageSummary updated on every turn.
    """
    patient_turns = list(
        session.turns.filter(role="patient").order_by("at").values_list("text", flat=True)
    )
    turn_count = len(patient_turns)
    combined_words = " | ".join(patient_turns)
    lower_all = combined_words.lower()

    # Infer specialty from symptoms
    specialty_en = "Internal Medicine"
    specialty_bn = "মেডিসিন (Internal Medicine)"
    if any(k in lower_all for k in ["শিশু", " বাচ্চা", "child", "baby", "pediatric"]):
        specialty_en = "Pediatrics"
        specialty_bn = "শিশুরোগ (Pediatrics)"
    elif any(k in lower_all for k in ["চর্ম", "চুলকানি", "র‍্যাশ", "skin", "rash", "itch"]):
        specialty_en = "Dermatology"
        specialty_bn = "চর্মরোগ (Dermatology)"
    elif any(k in lower_all for k in ["গর্ভ", "মাসিক", "প্রসূতি", "pregnancy", "gyne", "period"]):
        specialty_en = "Gynecology & Obstetrics"
        specialty_bn = "স্ত্রীরোগ ও প্রসূতিবিদ্যা (Gynecology)"
    elif any(k in lower_all for k in ["হাড়", "কোমর", "হাঁটু", "জয়েন্ট", "joint", "knee", "back pain"]):
        specialty_en = "Orthopedics"
        specialty_bn = "অর্থোপেডিকস (Orthopedics)"

    # Infer duration if mentioned
    duration_val = (
        patient_turns[1]
        if turn_count >= 2
        else ("৩ দিন / 3 days" if any(k in lower_all for k in ["৩", "3", "দিন", "day"]) else "উল্লেখ করা হয়নি / Pending")
    )

    # Infer severity if mentioned
    if any(k in lower_all for k in ["তীব্র", "বেশি", "প্রচণ্ড", "severe", "high", "strong"]):
        severity_val = "তীব্র / Severe"
    elif any(k in lower_all for k in ["হালকা", "কম", "mild", "light", "slight"]):
        severity_val = "হালকা / Mild"
    else:
        severity_val = "মাঝারি / Moderate"

    summary, _ = TriageSummary.objects.get_or_create(session=session)
    summary.patient_words = combined_words
    summary.structured_fields = {
        "chief_complaint": patient_turns[0] if patient_turns else latest_text,
        "duration": duration_val,
        "severity": severity_val,
        "additional_notes": patient_turns[2] if turn_count >= 3 else "",
        "red_flag_check": "No deterministic red flags triggered (INV-8)",
        "suggested_specialty_en": specialty_en,
        "suggested_specialty_bn": specialty_bn,
    }
    summary.guidance_given = (
        f"Recommended outpatient consultation in {specialty_en}. Carry previous reports if available."
        if session.language == "en"
        else f"পরামর্শ: {specialty_bn} বিভাগে বহির্বিভাগীয় ডাক্তারের পরামর্শ নিন। পূর্ববর্তী রিপোর্ট থাকলে সাথে রাখুন।"
    )
    summary.save()

    if turn_count == 1:
        return (
            f"I heard: \"{latest_text}\". How many days have you had this symptom, and is the discomfort mild, moderate, or severe?"
            if session.language == "en"
            else f"আমি শুনেছি: \"{latest_text}\"। এই সমস্যাটি কতদিন ধরে হচ্ছে এবং তীব্রতা কেমন—হালকা, মাঝারি, নাকি বেশি?"
        )
    if turn_count == 2:
        return (
            "Got it. Do you also have fever, nausea, dizziness, or any long-term conditions like diabetes or high blood pressure?"
            if session.language == "en"
            else "বুঝেছি। এর সাথে কি জ্বর, বমি ভাব, মাথা ঘোরা কিংবা ডায়াবেটিস বা উচ্চ রক্তচাপের মতো কোনো পূর্ববর্তী সমস্যা আছে?"
        )
    if turn_count == 3:
        return (
            f"Thank you. Based on your answers, an outpatient visit with {specialty_en} is appropriate. Are you taking any medicines right now, or would you like to review your summary?"
            if session.language == "en"
            else f"ধন্যবাদ। আপনার লক্ষণ অনুযায়ী {specialty_bn} বিভাগের ডাক্তার দেখানো উপযুক্ত হবে। আপনি কি বর্তমানে কোনো ওষুধ খাচ্ছেন, নাকি এখনই খসড়া সারাংশ যাচাই করতে চান?"
        )
    return (
        f"Your clinical intake summary for {specialty_en} is ready. You can share any additional detail by voice, or tap 'Finish & review summary' below."
        if session.language == "en"
        else f"{specialty_bn} ডাক্তারের জন্য আপনার খসড়া সারাংশ প্রস্তুত। আরও কিছু যোগ করতে চাইলে বলুন, অথবা নিচে 'সারাংশ যাচাই করুন' বাটনে চাপুন।"
    )


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
            session.ended_at = timezone.now()
            run_triage_action(session, "red_flag", request_id=request_id)

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

        # Otherwise continue progressive clinical question flow and update TriageSummary draft
        next_reply = _build_clinical_dialogue_and_summary(session, text)
        assistant_turn = Turn.objects.create(
            session=session,
            role="assistant",
            text=next_reply,
            language_detected=session.language,
            response_policy="question",
        )
        return assistant_turn
