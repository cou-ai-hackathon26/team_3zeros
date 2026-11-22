"""The backend transition tables must match MASTERPLAN §5 exactly (BACKEND §6.1)."""
import re
from pathlib import Path
import pytest
from apps.documents.transitions import DOCUMENT_TRANSITIONS
from apps.referrals.transitions import REFERRAL_TRANSITIONS
from apps.scheduling.transitions import APPOINTMENT_TRANSITIONS
from apps.triage.transitions import TRIAGE_TRANSITIONS

MASTERPLAN = Path(__file__).resolve().parents[2] / "MASTERPLAN.md"

SECTIONS = {
    "5.1": APPOINTMENT_TRANSITIONS,
    "5.2": REFERRAL_TRANSITIONS,
    "5.3": TRIAGE_TRANSITIONS,
    "5.4": DOCUMENT_TRANSITIONS,
}
# retry_sync's target is the failed action's target, resolved at runtime (§5.8).
RUNTIME_TARGET = {("5.2", "retry_sync")}


def parse(section):
    """Return {action: (sources, target, fhir)} from the §5.x table in MASTERPLAN."""
    text = MASTERPLAN.read_text()
    start = re.search(rf"^### {re.escape(section)} ", text, re.M).start()
    nxt = re.search(r"^#{2,3} ", text[start + 4:], re.M)
    body = text[start: start + 4 + nxt.start()] if nxt else text[start:]
    rows = {}
    for line in body.splitlines():
        m = re.match(r"^\| `([a-z_]+)` \| ([^|]+) \| ([^|]+) \| ([^|]*)\|(?: ([^|]*)\|)?\s*$", line)
        if not m:
            continue
        action, source, target, actor, fhir = m.groups()
        if source.strip().startswith("(new)"):
            continue  # creation, not a transition of an existing object
        sources = {x.strip() for x in source.split(",")}
        is_fhir = (fhir or "").strip() == "yes" or "FHIR: yes" in actor
        rows[action] = (sources, target.strip(), is_fhir)
    return rows


@pytest.mark.parametrize("section", SECTIONS)
def test_transition_table_matches_masterplan(section):
    doc = parse(section)
    code = SECTIONS[section]
    assert doc, f"no rows parsed for §{section}"
    assert set(doc) == set(code), f"§{section} actions differ: only in doc={set(doc)-set(code)}, only in code={set(code)-set(doc)}"
    for action, (sources, target, fhir) in doc.items():
        t = code[action]
        assert t.source == sources, f"§{section} {action}: source {t.source} != {sources}"
        if (section, action) not in RUNTIME_TARGET:
            assert t.target == target, f"§{section} {action}: target {t.target} != {target}"
        assert t.fhir_required == fhir, f"§{section} {action}: fhir_required {t.fhir_required} != {fhir}"


SYSTEM_ONLY = {
    "5.1": {"expire"},
    "5.2": {"consent_granted", "consent_refused", "consent_revoked", "return_outcome", "expire", "escalate", "sync_failed"},
    "5.3": {"connect", "red_flag", "abandon"},
    "5.4": {"queue_ocr", "start_ocr", "ocr_succeeded", "ocr_failed", "quarantine"},
}


@pytest.mark.parametrize("section", SECTIONS)
def test_system_only_actions_reject_every_user(section, django_user_model):
    """Jobs and services act with no actor; no signed-in user may trigger these (INV-6, INV-10)."""
    user = django_user_model(email="anyone@example.com")  # authenticated-like, unsaved
    for action in SYSTEM_ONLY[section]:
        permission = SECTIONS[section][action].permission
        assert permission(None, None, {}) is True, f"{action} must allow the system"
        assert permission(user, None, {}) is False, f"{action} must reject users"
