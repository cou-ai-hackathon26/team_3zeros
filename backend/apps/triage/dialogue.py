"""
LLM-driven triage conversation (MASTERPLAN D-23, D-24, D-08, INV-7, INV-8).

The model only chooses the next question or wording. It runs AFTER the deterministic red-flag
check (which the model can never override), and every reply still passes `validate_assistant_output`.
Facts it may use (reference passages, real doctors, real emergency hospitals) are looked up by the
backend and appended to the prompt (`context.py`); the model has no tools and cannot invent them.
If no model is configured or the call fails, the caller falls back to the scripted reply.

The prompts live in prompt.md and report_prompt.md so clinicians can review them as text.
"""
import json
import re
from pathlib import Path
from typing import Dict, List, Optional, Tuple

from apps.ai.chat import generate_text

from .context import build_context
from .policy import infer_specialty, validate_assistant_output
from .rules.engine import evaluate_session_red_flags

_DIR = Path(__file__).parent
TRIAGE_SYSTEM_PROMPT = (_DIR / "prompt.md").read_text(encoding="utf-8")
REPORT_PROMPT = (_DIR / "report_prompt.md").read_text(encoding="utf-8")

MAX_TURNS = 24

# Interview length (D-27; checklist and numbers are placeholders until Q-06 sign-off):
# at least MIN answers, aim for TARGET (about three to four minutes), never more than MAX.
MIN_ANSWERS, TARGET_ANSWERS, MAX_ANSWERS = 4, 7, 10
DONE_MARKER = "[DONE]"  # the model starts its reply with this when it has enough to summarise
EMERGENCY_MARKER = "[EMERGENCY]"  # the model starts its reply with this to raise an emergency (prompt section 0)
LEVELS = ("LOW", "MODERATE", "HIGH", "EMERGENCY")


def _messages(session) -> List[Dict[str, str]]:
    turns = list(session.turns.filter(role__in=("patient", "assistant")).order_by("at")[:MAX_TURNS])
    messages = [{"role": "user" if t.role == "patient" else "model", "text": t.text} for t in turns]
    while messages and messages[0]["role"] == "model":  # conversation must start with the patient
        messages.pop(0)
    return messages


def _patient_text(session) -> str:
    return " ".join(session.turns.filter(role="patient").order_by("at").values_list("text", flat=True))


def budget_directive(answers: int) -> str:
    """Tells the model how many answers it has and when to stop, so the interview stays short and costs little."""
    base = f"The patient has given {answers} answers so far."
    if answers <= 5:
        return base + " Ask the next missing item from the checklist."
    if answers < MAX_ANSWERS - 1:
        return base + f" Ask only if a required checklist item (main problem, onset, severity, age) is still missing; otherwise reply exactly {DONE_MARKER}."
    return base + f" Reply exactly {DONE_MARKER}."


def llm_next_reply(session) -> Optional[str]:
    """Next assistant reply from the model, or None to use the scripted reply."""
    messages = _messages(session)
    if not messages or messages[-1]["role"] != "user":
        return None
    patient_turns = sum(1 for m in messages if m["role"] == "user")
    specialty = infer_specialty(_patient_text(session))["code"]
    context, passages = build_context(session, specialty, patient_turns)
    session._passage_ids = [p["id"] for p in passages]  # stored on the assistant turn for audit
    hint = f"Session language: {'English' if session.language == 'en' else 'Bangla'} (follow the patient's language if it differs)."
    system = "\n\n".join([TRIAGE_SYSTEM_PROMPT, hint, budget_directive(patient_turns), context])
    return generate_text(messages, system=system, max_tokens=150, purpose="dialogue")  # one short spoken question


DISCLAIMER = {
    "en": "This AI-generated report is intended for healthcare guidance and triage support. It is not a confirmed medical diagnosis and does not replace consultation with a qualified healthcare professional.",
    "bn": "এই এআই-তৈরি প্রতিবেদন স্বাস্থ্যসেবা নির্দেশনা ও ট্রায়াজ সহায়তার জন্য। এটি নিশ্চিত চিকিৎসা রোগ নির্ণয় নয় এবং যোগ্য স্বাস্থ্যসেবা পেশাদারের পরামর্শের বিকল্প নয়।",
}
EMERGENCY_TEXT = {
    "en": "Call 999 or go to the nearest emergency department now. Do not wait for an appointment.",
    "bn": "এখনই ৯৯৯ নম্বরে কল করুন অথবা নিকটস্থ হাসপাতালের জরুরী বিভাগে যান। অ্যাপয়েন্টমেন্টের জন্য অপেক্ষা করবেন না।",
}


def _line(x) -> str:
    """One readable line from a list item. Models sometimes return {"question":…, "answer":…} objects instead of text."""
    if isinstance(x, dict):
        q, a = x.get("question"), x.get("answer")
        return f"{q} — {a}" if q and a else " — ".join(str(v) for v in x.values() if v)
    return str(x)


def _strings(value, limit: int = 20) -> List[str]:
    return [t for t in (_line(x).strip() for x in value) if t][:limit] if isinstance(value, list) else []


def _safe(items: List[str], language: str) -> Tuple[List[str], bool]:
    """Drops any line that gives a dose, a medicine instruction or a diagnosis (INV-7). Returns (kept, dropped_any)."""
    kept = [x for x in items if validate_assistant_output(x, language=language)[1] != "declined"]
    return kept, len(kept) != len(items)


def _alnum(text: str) -> str:
    """Letters and digits only, lower-case, with PDF line-break hyphenation joined, so a quote can be matched exactly
    even when the PDF text has odd spacing, line breaks or punctuation."""
    return re.sub(r"[^a-z0-9]+", "", re.sub(r"\s*-\s*\n\s*", "", text).lower())


def _grounded_explanations(items, passages: List[Dict]) -> Tuple[List[Dict], bool]:
    """Keeps only explanations whose supporting quote really appears in a retrieved passage, and records which one.
    Returns (kept, dropped_any). Anything without a verifiable quote is removed."""
    haystacks = [(p, _alnum(p["relevant_information"])) for p in passages]
    kept = []
    for item in items if isinstance(items, list) else []:
        text = str(item.get("text") or "").strip() if isinstance(item, dict) else ""
        quote = _alnum(str(item.get("supporting_quote") or "")) if isinstance(item, dict) else ""
        match = next((p for p, hay in haystacks if len(quote) >= 25 and quote in hay), None)
        if text and match:
            kept.append({"text": text, "document": match["document_name"], "page": match["page_number"]})
    return kept, len(kept) != len(items if isinstance(items, list) else [])


def _specialty_codes() -> List[str]:
    from apps.directory.models import Specialty
    return list(Specialty.objects.values_list("code", flat=True))


def generate_consultation_report(session) -> Optional[Dict]:
    """Conversation summary and AI health assessment for the patient to review (an AI draft, never a diagnosis).
    Returns None when no model is configured or its answer is unusable. Safety is enforced here, not trusted to the model."""
    turns = list(session.turns.filter(role__in=("patient", "assistant")).order_by("at")[:MAX_TURNS * 2])
    patient_said = [t.text for t in turns if t.role == "patient"]
    if len(patient_said) < 2:
        return None  # too little said to assess; spare the model call
    language = "en" if session.language == "en" else "bn"

    # Facts the report may rest on: fixed red-flag rules, and passages found by retrieval (never by the model).
    rule_hit, hits, _ = evaluate_session_red_flags(patient_said, language=language)
    had_emergency = (
        rule_hit
        or session.state == "EMERGENCY_PATHWAY"
        or any(t.response_policy == "emergency" for t in turns)
    )
    specialty = infer_specialty(" ".join(patient_said))
    _, passages = build_context(session, specialty["code"], 0, all_answers=True)
    summary = getattr(session, "summary", None)
    history = {k: v for k, v in (summary.structured_fields if summary else {}).items() if k in ("chief_complaint", "duration", "severity", "additional_notes")}
    payload = {
        "consultation_id": str(session.public_id),
        "language": language,
        "transcript": [{"role": "patient" if t.role == "patient" else "agent", "text": t.text} for t in turns],
        "structured_symptom_history": history,
        "red_flag_results": [h["rule_id"] for h in hits] or "none triggered",
        "retrieved_passages": [{**p, "relevant_information": p["relevant_information"][:500]} for p in passages],  # shorter input, lower cost
        "suggested_specialty": specialty["en"],
        "specialty_codes": _specialty_codes(),
    }
    raw = generate_text(
        [{"role": "user", "text": json.dumps(payload, ensure_ascii=False)}],
        system=REPORT_PROMPT, max_tokens=1800, temperature=0, timeout=45, purpose="report",
    )
    if not raw:
        return None
    try:
        data = json.loads(re.sub(r"^```(?:json)?|```$", "", raw.strip(), flags=re.M).strip())
        cs, ha = data["conversation_summary"], data["health_assessment"]
    except (ValueError, KeyError, TypeError):
        return None
    if not isinstance(cs, dict) or not isinstance(ha, dict) or ha.get("triage_level") not in LEVELS:
        return None

    review = bool(ha.get("requires_clinician_review"))
    # Rule 8: if the live agent said something unsafe, do not repeat it and flag it for a clinician.
    review |= any(validate_assistant_output(t.text, language=language)[1] == "declined" for t in turns if t.role == "assistant")
    actions, d1 = _safe(_strings(ha.get("recommended_actions")), language)
    # Possible explanations only when each one is backed by a quote found in a retrieved passage.
    explanations, d2 = _grounded_explanations(ha.get("possible_explanations"), passages)
    safe_texts, d2b = _safe([e["text"] for e in explanations], language)
    explanations = [e for e in explanations if e["text"] in safe_texts]
    d2 = d2 or d2b
    advice, d3 = _safe(_strings(cs.get("advice_given")), language)
    review |= d1 or d2 or d3

    level = ha["triage_level"]
    emergency_instructions = ha.get("emergency_instructions") if isinstance(ha.get("emergency_instructions"), str) else None
    if had_emergency or level == "EMERGENCY":
        level, review = "EMERGENCY", True  # never downgraded (INV-8)
        emergency_instructions = EMERGENCY_TEXT[language]  # the fixed instruction, not the model's words
    elif emergency_instructions:
        emergency_instructions = None

    return {
        "conversation_summary": {
            "language": language,
            "overview": str(cs.get("overview") or ""),
            "primary_complaint": str(cs.get("primary_complaint") or ""),
            "reported_symptoms": _strings(cs.get("reported_symptoms")),
            "symptom_duration": str(cs.get("symptom_duration") or ""),
            "severity": str(cs.get("severity") or ""),
            "medical_history": _strings(cs.get("medical_history")),
            "important_questions_and_answers": _strings(cs.get("important_questions_and_answers")),
            "advice_given": advice,
            "referral_information": str(cs.get("referral_information") or ""),
            "missing_information": _strings(cs.get("missing_information")),
        },
        "health_assessment": {
            "primary_concern": str(ha.get("primary_concern") or ""),
            "reported_symptoms": _strings(ha.get("reported_symptoms")),
            "possible_explanations": explanations,
            "triage_level": level,
            "triage_reasoning": str(ha.get("triage_reasoning") or ""),
            # Citations come from retrieval (document, page), never from the model.
            "medical_evidence": [
                {"document": p["document_name"], "page": p["page_number"], "relevant_information": p["relevant_information"]}
                for p in passages
            ],
            "recommended_actions": actions,
            "warning_signs": _strings(ha.get("warning_signs")),
            "recommended_specialization": ha.get("recommended_specialization") or specialty["en"],
            "recommended_specialty_code": ha.get("recommended_specialty_code") if ha.get("recommended_specialty_code") in _specialty_codes() else None,
            "follow_up_guidance": str(ha.get("follow_up_guidance") or ""),
            "emergency_instructions": emergency_instructions,
            "missing_information": _strings(ha.get("missing_information")),
            "requires_clinician_review": review,
            "disclaimer": DISCLAIMER[language],
        },
    }
