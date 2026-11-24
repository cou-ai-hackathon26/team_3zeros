from django.conf import settings
from django.db import transaction
from django.utils import timezone
from apps.knowledge.versioning import kb_version
from .dialogue import DONE_MARKER, EMERGENCY_MARKER, MAX_ANSWERS, MIN_ANSWERS, TARGET_ANSWERS, generate_consultation_report, llm_next_reply
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
    """True when authenticated clinical staff has an active membership at a facility with a linked appointment."""
    if not user or not getattr(user, "is_authenticated", False):
        return False
    from apps.accounts.selectors import active_memberships

    facility_ids = list(
        active_memberships(user)
        .filter(role__in=("clinician", "facility_staff"))
        .values_list("facility_id", flat=True)
    )
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
            kb_version=kb_version(),
            model_version=getattr(settings, "LLM_MODEL", "") or "v1",
        )
        run_triage_action(session, "connect", request_id=request_id)  # CREATED -> ACTIVE

        # The first message is always Bangla (agent prompt §2).
        greeting = (
            "আসসালামু আলাইকুম। আমি আপনার স্বাস্থ্যসংক্রান্ত সমস্যাগুলো বুঝতে এবং সঠিক চিকিৎসাসেবা খুঁজে পেতে সাহায্য করব। "
            "আপনার কী সমস্যা হচ্ছে? কী কারণে আজ আমাদের সাথে যোগাযোগ করেছেন? "
            f"এতে প্রায় ৩ মিনিট সময় লাগবে, আনুমানিক {_bn_digits(TARGET_ANSWERS)}টি প্রশ্ন।"
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


MODEL_EMERGENCY_INSTRUCTION = {
    False: "PLACEHOLDER — NOT CLINICALLY APPROVED: আপনার লক্ষণ জরুরী হতে পারে। অবিলম্বে ৯৯৯ নম্বরে কল করুন অথবা নিকটস্থ হাসপাতালের জরুরী বিভাগে যান।",
    True: "PLACEHOLDER — NOT CLINICALLY APPROVED: Your symptoms may be an emergency. Call 999 or go to the nearest emergency department immediately.",
}


def _bn_digits(n: int) -> str:
    return str(n).translate(str.maketrans("0123456789", "০১২৩৪৫৬৭৮৯"))


SCRIPTED_QUESTIONS = [  # follows the interview checklist; used when no model is available
    ("When did it start, and is it getting better or worse?", "কবে থেকে শুরু, আর কি বাড়ছে না কমছে?"),
    ("How bad is it, and where exactly?", "কতটা তীব্র, আর ঠিক কোথায়?"),
    ("Any fever, vomiting or trouble breathing?", "জ্বর, বমি বা শ্বাসকষ্ট আছে কি?"),
    ("How old are you?", "আপনার বয়স কত?"),
    ("Any long-term illness, regular medicine or allergy?", "কোনো দীর্ঘমেয়াদি রোগ, নিয়মিত ওষুধ বা এলার্জি আছে কি?"),
]


def _scripted_reply(session, turn_count: int, latest_text: str, specialty: dict) -> str:
    """Fixed fallback dialogue, used when no language model is available. Never echoes what the patient said."""
    if turn_count > len(SCRIPTED_QUESTIONS):
        return DONE_MARKER
    en, bn = SCRIPTED_QUESTIONS[turn_count - 1]
    return en if session.language == "en" else bn


CLOSING = {
    "en": "Thank you. Your summary is ready. Please check it on the screen.",
    "bn": "ধন্যবাদ। আপনার সারাংশ প্রস্তুত। অনুগ্রহ করে পর্দায় দেখে নিন।",
}


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

    if turn_count >= MAX_ANSWERS:
        return CLOSING[session.language == "en" and "en" or "bn"], "closing"  # hard stop: no model call

    reply = llm_next_reply(session) or _scripted_reply(session, turn_count, latest_text, specialty)
    if reply.lstrip().startswith(EMERGENCY_MARKER):
        # The model judged this an emergency: use the fixed official instruction, never the model's own words (INV-8, INV-16).
        return MODEL_EMERGENCY_INSTRUCTION[session.language == "en"], "emergency"
    if reply.lstrip().startswith(DONE_MARKER):
        if turn_count >= MIN_ANSWERS:
            return CLOSING[session.language == "en" and "en" or "bn"], "closing"
        # Too early to stop: ignore the marker and ask the next scripted question instead.
        reply = _scripted_reply(session, turn_count, latest_text, specialty)
        if reply.startswith(DONE_MARKER):
            reply = SCRIPTED_QUESTIONS[-1][0 if session.language == "en" else 1]

    return validate_assistant_output(reply, language=session.language, intended_policy="question")


def _escalate_emergency(session: TriageSession, instruction: str, hits: list, user, request_id: str):
    """Move the session to the emergency pathway and record the official instruction (INV-8, INV-16)."""
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


def _close_interview(session: TriageSession, text: str, user, request_id: str):
    """The interview is complete: say the fixed closing line, move to summary review, and queue the report."""
    turn = Turn.objects.create(session=session, role="assistant", text=text, language_detected=session.language, response_policy="closing")
    run_triage_action(session, "finish_questions", request_id=request_id)  # system action (§5.3)
    request_report(session)
    return turn


def process_patient_turn(session: TriageSession, text: str, user=None, request_id=""):
    cleaned_text = normalize_text(text)
    if not cleaned_text:
        raise ValidationError("Turn text cannot be empty.")

    with transaction.atomic():
        # One turn at a time per session: two transcript fragments must not produce two replies.
        locked = TriageSession.objects.select_for_update().get(pk=session.pk)
        session.state, session.version = locked.state, locked.version
        if session.state not in ("ACTIVE", "PAUSED"):
            raise TransitionNotAllowedError(f"Session cannot accept turns in state '{session.state}'.")
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
            return _escalate_emergency(session, instruction, hits, user, request_id)

        next_reply, response_policy = _build_clinical_dialogue_and_summary(session, cleaned_text)
        if response_policy == "emergency":
            hits = [{"rule_id": "MODEL-EMERGENCY", "symptom": "model_judgement", "matched_keyword": "", "language_detected": session.language}]
            return _escalate_emergency(session, next_reply, hits, user, request_id)
        if response_policy == "closing":
            return _close_interview(session, next_reply, user, request_id)
        assistant_turn = Turn.objects.create(
            session=session,
            role="assistant",
            text=next_reply,
            language_detected=session.language,
            response_policy=response_policy,
            passage_ids=getattr(session, "_passage_ids", []),
        )
        return assistant_turn


def request_report(session: TriageSession) -> None:
    """Queue the consultation report (BACKEND §7.1). The patient's summary page shows "preparing" until it is ready."""
    summary, _ = TriageSummary.objects.get_or_create(session=session)
    summary.structured_fields = {**summary.structured_fields, "report_status": "pending"}
    summary.save(update_fields=["structured_fields", "updated_at"])
    OutboxEvent.objects.create(
        aggregate_type="triage_session",
        aggregate_id=session.public_id,
        event_type="triage.report_requested",
        payload={"session_id": str(session.public_id)},
    )

    def kick():
        from apps.workflow.tasks import dispatch_outbox_events
        dispatch_outbox_events.delay()  # beat also runs it every 2 s as the safety net

    transaction.on_commit(kick)


def attach_consultation_report(session: TriageSession) -> None:
    """Draft the report, then fill the editable summary fields from it (an AI draft the patient reviews, INV-7).
    With no model, or an unusable answer, the heuristic fields stay and the status is "unavailable"."""
    from apps.directory.models import Specialty
    from apps.knowledge.models import KnowledgeDocument

    summary, _ = TriageSummary.objects.get_or_create(session=session)
    if summary.structured_fields.get("report_status") == "ready":
        return  # already done: the queue may deliver the request twice
    report = generate_consultation_report(session)
    fields = dict(summary.structured_fields)
    if not report:
        fields["report_status"] = "unavailable"
        fields.setdefault("triage_level", None)  # not assessed: routed as "see a doctor"
        summary.structured_fields = fields
        summary.save(update_fields=["structured_fields", "updated_at"])
        return
    cs, ha = report["conversation_summary"], report["health_assessment"]
    fields.update({"report": report, "report_status": "ready", "triage_level": ha["triage_level"]})
    for key, value in (("chief_complaint", cs["primary_complaint"]), ("duration", cs["symptom_duration"]),
                       ("severity", cs["severity"]), ("additional_notes", "; ".join(cs["medical_history"]))):
        if value:
            fields[key] = value
    code = ha.get("recommended_specialty_code")
    spec = Specialty.objects.filter(code=code).first() if code else None
    if spec:
        fields.update({"suggested_specialty_code": spec.code, "suggested_specialty_en": spec.name_en, "suggested_specialty_bn": spec.name_bn})
    titles = {e["document"] for e in ha["medical_evidence"]}
    if titles:
        fields["guidance_sources"] = [
            {"title": d.title, "publisher": d.publisher, "version": d.version} for d in KnowledgeDocument.objects.filter(title__in=titles)
        ]
    summary.structured_fields = fields
    summary.save(update_fields=["structured_fields", "updated_at"])
