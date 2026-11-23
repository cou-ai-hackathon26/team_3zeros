"""Verified facts the triage model may use: reference passages, real doctors, real emergency hospitals.

The model has no tools. The backend looks these up and appends them to the prompt, so the model can
only mention doctors, hospitals and phone numbers that exist in our database (MASTERPLAN D-23)."""
import hashlib
import re
from typing import Dict, List, Tuple

from django.core.cache import cache
from django.utils import timezone

from apps.directory.selectors import list_facilities, list_practitioners
from apps.ai.translate import translate_text
from apps.knowledge.search import search
from apps.scheduling.models import Slot


def _is_bangla(text: str) -> bool:
    return len(re.findall(r"[\u0980-\u09FF]", text)) >= len(re.findall(r"[A-Za-z]", text))


def _english(text: str) -> str:
    """English version of a patient's words (the reference books are English). Cached per sentence,
    so only the newest turn costs a translation call. Falls back to the original if unavailable."""
    if not _is_bangla(text):
        return text
    key = "kb-en:" + hashlib.sha256(text.encode()).hexdigest()
    cached = cache.get(key)
    if cached is None:
        cached = translate_text(text, "bn", "en") or ""
        if cached:
            cache.set(key, cached, 60 * 60 * 24)
    return cached or text


def reference_passages(session) -> List[Dict]:
    turns = session.turns.filter(role="patient").order_by("at").values_list("text", flat=True)
    return search(" ".join(_english(t) for t in turns))


def references_block(passages: List[Dict]) -> str:
    if not passages:
        return "REFERENCES: none found. Do not state medical facts as if they came from a reference."
    lines = [f'[{p["document_name"]}, page {p["page_number"]}] {p["relevant_information"]}' for p in passages]
    return "REFERENCES (cite document name and page if you use one; never cite anything not listed):\n" + "\n".join(lines)


def doctors_block(specialty_code: str, limit: int = 4) -> str:
    now = timezone.now()
    rows = []
    for doc in list_practitioners(specialty_code=specialty_code)[:limit]:
        role = doc.roles.filter(active=True, specialty__code=specialty_code).select_related("facility").first()
        if not role:
            continue
        open_slots = Slot.objects.filter(schedule__practitioner_role=role, state="AVAILABLE", start__gte=now).count()
        rows.append(f"- Dr. {doc.name}, {role.facility.name}, {open_slots} open appointment slots")
    if not rows:
        return "DOCTORS: none registered for this specialty. Say so and suggest the nearest facility instead."
    return "DOCTORS ON THE PLATFORM (real; booking is done by the patient in the app, never promise a slot):\n" + "\n".join(rows)


def hospitals_block(limit: int = 3) -> str:
    rows = [
        f"- {f.name}, {f.address or 'address not listed'}, phone {f.phone or 'not listed'}"
        for f in list_facilities(service_code="emergency")[:limit]
    ]
    if not rows:
        return "EMERGENCY HOSPITALS: none listed. Give only the national emergency number 999."
    return "EMERGENCY HOSPITALS (verified; give only these numbers, plus 999):\n" + "\n".join(rows)


def build_context(session, specialty_code: str, patient_turns: int) -> Tuple[str, List[Dict]]:
    """Text appended to the system prompt, and the reference passages that were offered to the model."""
    passages = reference_passages(session)
    blocks = [references_block(passages)]
    if patient_turns >= 3:  # enough history to point at care
        blocks += [doctors_block(specialty_code), hospitals_block()]
    return "\n\n".join(blocks), passages
