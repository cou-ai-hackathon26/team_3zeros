"""Interview length, closing and the background report (TRIAGE_RAG_REFERRAL_PLAN §3, §5)."""
import json

import pytest
from django.db import connection
from rest_framework.test import APIClient

from apps.directory.models import Specialty
from apps.triage import dialogue
from apps.triage.dialogue import DONE_MARKER, MAX_ANSWERS, MIN_ANSWERS, budget_directive
from apps.triage.models import TriageSession, TriageSummary
from apps.triage.services import attach_consultation_report, create_triage_session, process_patient_turn


def _session(lang="en"):
    return create_triage_session(user=None, language=lang, disclosure_version="v1.0")


def _answer(s, n, model_says=None, monkeypatch=None):
    if monkeypatch is not None:
        monkeypatch.setattr(dialogue, "generate_text", lambda *a, **k: model_says)
    return process_patient_turn(s, f"answer {n} about my cough")


def test_budget_directive_tightens_as_answers_grow():
    assert "next missing item" in budget_directive(2)
    assert DONE_MARKER in budget_directive(6) and "only if a required" in budget_directive(6)
    assert budget_directive(MAX_ANSWERS - 1).endswith(f"exactly {DONE_MARKER}.")


@pytest.mark.django_db
def test_done_before_the_minimum_is_ignored_and_another_question_is_asked(monkeypatch):
    s = _session()
    turn = _answer(s, 1, f"{DONE_MARKER}", monkeypatch)
    assert turn.response_policy == "question" and "start" in turn.text.lower()
    s.refresh_from_db()
    assert s.state == "ACTIVE"


@pytest.mark.django_db
def test_done_after_the_minimum_closes_with_the_fixed_line_and_queues_the_report(monkeypatch):
    s = _session()
    for n in range(1, MIN_ANSWERS):
        _answer(s, n, "Next question?", monkeypatch)
    turn = _answer(s, MIN_ANSWERS, DONE_MARKER, monkeypatch)
    assert turn.response_policy == "closing" and "summary is ready" in turn.text
    s.refresh_from_db()
    assert s.state == "SUMMARY_PENDING_REVIEW"
    from apps.workflow.models import OutboxEvent
    assert OutboxEvent.objects.filter(aggregate_id=s.public_id, event_type="triage.report_requested").exists()
    assert TriageSummary.objects.get(session=s).structured_fields["report_status"] in ("pending", "unavailable")


@pytest.mark.django_db
def test_the_hard_stop_closes_without_calling_the_model(monkeypatch):
    s = _session()
    calls = []
    monkeypatch.setattr(dialogue, "generate_text", lambda *a, **k: calls.append(1) or "Another question?")
    for n in range(1, MAX_ANSWERS):
        process_patient_turn(s, f"answer {n}")
    before = len(calls)
    turn = process_patient_turn(s, "the last one")
    assert turn.response_policy == "closing" and len(calls) == before  # no model call at the hard stop
    s.refresh_from_db()
    assert s.state == "SUMMARY_PENDING_REVIEW"


@pytest.mark.django_db
def test_an_emergency_still_wins_inside_the_interview(monkeypatch):
    s = _session()
    monkeypatch.setattr(dialogue, "generate_text", lambda *a, **k: "Next?")
    process_patient_turn(s, "I have fever")
    turn = process_patient_turn(s, "and a stiff neck")
    assert turn.response_policy == "emergency"


@pytest.mark.django_db
def test_the_scripted_fallback_runs_the_checklist_and_ends_by_itself(monkeypatch):
    s = _session()
    monkeypatch.setattr(dialogue, "generate_text", lambda *a, **k: None)
    policies = []
    for n in range(1, 9):
        s.refresh_from_db()
        if s.state != "ACTIVE":
            break
        policies.append(process_patient_turn(s, f"answer {n}").response_policy)
    assert policies[-1] == "closing" and len(policies) <= MAX_ANSWERS


@pytest.mark.django_db
def test_the_turn_response_tells_the_client_the_session_state(monkeypatch):
    s = _session()
    monkeypatch.setattr(dialogue, "generate_text", lambda *a, **k: "Next?")
    r = APIClient().post(f"/api/v1/triage/sessions/{s.public_id}/turns", {"text": "cough"}, format="json")
    assert r.status_code == 200 and r.data["session_state"] == "ACTIVE"
    detail = APIClient().get(f"/api/v1/triage/sessions/{s.public_id}")
    assert detail.data["interview"] == {"target": 7, "max": MAX_ANSWERS}


@pytest.mark.django_db
def test_the_greeting_states_the_length():
    assert "৩ মিনিট" in _session("bn").turns.first().text


# --- background report -------------------------------------------------------------------------------------------

def _report_raw(level="MODERATE", code="cardiology"):
    return {
        "conversation_summary": {"overview": "o", "primary_complaint": "chest tightness", "reported_symptoms": ["tight chest"], "symptom_duration": "2 days",
                                 "severity": "quite bad", "medical_history": ["high blood pressure"], "advice_given": [], "missing_information": []},
        "health_assessment": {"primary_concern": "chest tightness", "reported_symptoms": [], "possible_explanations": [], "triage_level": level,
                              "triage_reasoning": "r", "recommended_actions": ["See a doctor"], "warning_signs": [], "recommended_specialization": "Cardiology",
                              "recommended_specialty_code": code, "follow_up_guidance": "", "emergency_instructions": None, "missing_information": [], "requires_clinician_review": False},
    }


@pytest.mark.django_db
def test_the_report_fills_the_summary_fields_level_and_specialty(monkeypatch):
    Specialty.objects.get_or_create(code="cardiology", defaults={"name_en": "Cardiology", "name_bn": "হৃদরোগ"})
    s = _session()
    monkeypatch.setattr(dialogue, "generate_text", lambda *a, **k: "Next?")
    process_patient_turn(s, "my chest feels tight"); process_patient_turn(s, "for two days")
    monkeypatch.setattr(dialogue, "generate_text", lambda *a, **k: json.dumps(_report_raw()))
    attach_consultation_report(s)
    f = TriageSummary.objects.get(session=s).structured_fields
    assert (f["report_status"], f["triage_level"]) == ("ready", "MODERATE")
    assert (f["chief_complaint"], f["duration"], f["severity"], f["additional_notes"]) == ("chest tightness", "2 days", "quite bad", "high blood pressure")
    assert f["suggested_specialty_code"] == "cardiology" and f["suggested_specialty_en"] == "Cardiology"


@pytest.mark.django_db
def test_an_invented_specialty_code_is_ignored(monkeypatch):
    s = _session()
    monkeypatch.setattr(dialogue, "generate_text", lambda *a, **k: "Next?")
    process_patient_turn(s, "cough"); process_patient_turn(s, "two days")
    monkeypatch.setattr(dialogue, "generate_text", lambda *a, **k: json.dumps(_report_raw(code="made_up_specialty")))
    attach_consultation_report(s)
    f = TriageSummary.objects.get(session=s).structured_fields
    assert f["suggested_specialty_code"] != "made_up_specialty"


@pytest.mark.django_db
def test_no_model_means_unavailable_with_the_heuristic_fields_kept(monkeypatch):
    s = _session()
    monkeypatch.setattr(dialogue, "generate_text", lambda *a, **k: None)
    process_patient_turn(s, "cough"); process_patient_turn(s, "two days")
    attach_consultation_report(s)
    f = TriageSummary.objects.get(session=s).structured_fields
    assert f["report_status"] == "unavailable" and f["triage_level"] is None and f["chief_complaint"] == "cough"


@pytest.mark.django_db
def test_a_ready_report_is_not_generated_twice(monkeypatch):
    s = _session()
    monkeypatch.setattr(dialogue, "generate_text", lambda *a, **k: "Next?")
    process_patient_turn(s, "cough"); process_patient_turn(s, "two days")
    calls = []
    monkeypatch.setattr(dialogue, "generate_text", lambda *a, **k: calls.append(1) or json.dumps(_report_raw()))
    attach_consultation_report(s); attach_consultation_report(s)
    assert len(calls) == 1


@pytest.mark.django_db
def test_finishing_through_the_api_queues_the_report_and_the_outbox_builds_it(monkeypatch):
    from apps.workflow.tasks import dispatch_outbox_events
    s = _session()
    monkeypatch.setattr(dialogue, "generate_text", lambda *a, **k: "Next?")
    process_patient_turn(s, "cough"); process_patient_turn(s, "two days")
    monkeypatch.setattr(dialogue, "generate_text", lambda *a, **k: json.dumps(_report_raw()))
    r = APIClient().post(f"/api/v1/triage/sessions/{s.public_id}/finish", {}, format="json")
    assert r.status_code == 200
    dispatch_outbox_events(batch_size=100)
    assert TriageSummary.objects.get(session=s).structured_fields["report_status"] == "ready"
