"""
LLM-driven triage conversation (MASTERPLAN D-23, D-24, D-08, INV-7, INV-8).

The model only chooses the next question or wording. It runs AFTER the deterministic red-flag
check (which the model can never override), and every reply still passes `validate_assistant_output`.
Facts it may use (reference passages, real doctors, real emergency hospitals) are looked up by the
backend and appended to the prompt (`context.py`); the model has no tools and cannot invent them.
If no model is configured or the call fails, the caller falls back to the scripted reply.

The prompts live in prompt.md and triage_result_prompt.md so clinicians can review them as text.
"""
import json
import re
from pathlib import Path
from typing import Dict, List, Optional

from apps.ai.chat import generate_text

from .context import build_context
from .policy import infer_specialty

_DIR = Path(__file__).parent
TRIAGE_SYSTEM_PROMPT = (_DIR / "prompt.md").read_text(encoding="utf-8")
TRIAGE_RESULT_PROMPT = (_DIR / "triage_result_prompt.md").read_text(encoding="utf-8")

MAX_TURNS = 24
LEVELS = ("LOW", "MODERATE", "HIGH", "EMERGENCY")
CONFIDENCE = ("LOW", "MEDIUM", "HIGH")


def _messages(session) -> List[Dict[str, str]]:
    turns = list(session.turns.filter(role__in=("patient", "assistant")).order_by("at")[:MAX_TURNS])
    messages = [{"role": "user" if t.role == "patient" else "model", "text": t.text} for t in turns]
    while messages and messages[0]["role"] == "model":  # conversation must start with the patient
        messages.pop(0)
    return messages


def _patient_text(session) -> str:
    return " ".join(session.turns.filter(role="patient").order_by("at").values_list("text", flat=True))


def llm_next_reply(session) -> Optional[str]:
    """Next assistant reply from the model, or None to use the scripted reply."""
    messages = _messages(session)
    if not messages or messages[-1]["role"] != "user":
        return None
    patient_turns = sum(1 for m in messages if m["role"] == "user")
    specialty = infer_specialty(_patient_text(session))["code"]
    context, _ = build_context(session, specialty, patient_turns)
    hint = f"Session language: {'English' if session.language == 'en' else 'Bangla'} (follow the patient's language if it differs)."
    system = "\n\n".join([TRIAGE_SYSTEM_PROMPT, hint, context])
    return generate_text(messages, system=system, max_tokens=260)


def generate_triage_result(session) -> Optional[Dict]:
    """Structured result for the summary the patient reviews (never a diagnosis). None if no model."""
    messages = _messages(session)
    if not messages:
        return None
    raw = generate_text(messages + [{"role": "user", "text": "Return the JSON triage result now."}], system=TRIAGE_RESULT_PROMPT, max_tokens=700, temperature=0)
    if not raw:
        return None
    try:
        data = json.loads(re.sub(r"^```(?:json)?|```$", "", raw.strip(), flags=re.M).strip())
    except ValueError:
        return None
    if not isinstance(data, dict) or data.get("triage_level") not in LEVELS:
        return None
    result = {
        "triage_level": data["triage_level"],
        "primary_complaint": str(data.get("primary_complaint") or ""),
        "reported_symptoms": [str(x) for x in data.get("reported_symptoms") or []][:20],
        "relevant_history": data.get("relevant_history") if isinstance(data.get("relevant_history"), dict) else {},
        "red_flags": [str(x) for x in data.get("red_flags") or []][:20],
        "reasoning_summary": str(data.get("reasoning_summary") or ""),
        "recommended_action": str(data.get("recommended_action") or ""),
        "doctor_specialization": data.get("doctor_specialization") or None,
        "emergency_required": bool(data.get("emergency_required")),
        "missing_information": [str(x) for x in data.get("missing_information") or []][:20],
        "confidence": data.get("confidence") if data.get("confidence") in CONFIDENCE else "LOW",
    }
    if result["emergency_required"] or result["red_flags"]:
        result["triage_level"], result["emergency_required"] = "EMERGENCY", True  # never downgraded (INV-8)
    # Citations come from what retrieval really returned, not from the model.
    _, passages = build_context(session, "", 0)
    result["knowledge_base_evidence"] = passages
    return result
