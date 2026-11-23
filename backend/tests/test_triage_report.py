import json
import pytest
from apps.knowledge.models import KnowledgeChunk, KnowledgeDocument
from apps.knowledge.search import reset_index
from apps.triage import dialogue
from apps.triage.models import Turn, TriageSummary
from apps.triage.services import attach_consultation_report, create_triage_session, process_patient_turn


@pytest.fixture(autouse=True)
def _fresh_index():
    reset_index()
    yield
    reset_index()


def _raw(level="MODERATE", **ha):
    base = {
        "conversation_summary": {"overview": "o", "primary_complaint": "fever", "reported_symptoms": ["fever"], "symptom_duration": "3 days",
                                 "advice_given": ["See a doctor"], "missing_information": ["age"]},
        "health_assessment": {"primary_concern": "fever", "reported_symptoms": ["fever"], "possible_explanations": [{"text": "a viral infection", "supporting_quote": "Fever with headache is often caused by viral infection"}],
                              "triage_level": level, "triage_reasoning": "r", "recommended_actions": ["See a doctor soon"],
                              "warning_signs": ["stiff neck"], "recommended_specialization": "General Medicine",
                              "follow_up_guidance": "if worse", "emergency_instructions": None, "requires_clinician_review": False,
                              "medical_evidence": [{"document": "MADE UP", "page": 1}], **ha},
    }
    return base


def _session(monkeypatch, said="fever and headache", approved=True):
    d = KnowledgeDocument.objects.create(title="Fever Guide", approved=approved)
    KnowledgeChunk.objects.create(document=d, page=12, text="Fever with headache is often caused by viral infection and needs assessment.")
    s = create_triage_session(user=None, language="en", disclosure_version="v1.0")
    monkeypatch.setattr(dialogue, "generate_text", lambda *a, **k: "How long?")
    process_patient_turn(s, said)
    return s


def _report(s, monkeypatch, raw):
    monkeypatch.setattr(dialogue, "generate_text", lambda *a, **k: "```json\n" + json.dumps(raw) + "\n```")
    attach_consultation_report(s)
    return TriageSummary.objects.get(session=s).structured_fields.get("report")


def test_prompt_keeps_the_report_rules():
    p = dialogue.REPORT_PROMPT
    for must in ("TWO separate outputs", "Do NOT name medicines", "Never downgrade an emergency", "Do not invent medical evidence"):
        assert must in p


@pytest.mark.django_db
def test_report_has_both_outputs_and_citations_from_retrieval_only(monkeypatch):
    r = _report(_session(monkeypatch), monkeypatch, _raw())
    assert r["conversation_summary"]["primary_complaint"] == "fever"
    ha = r["health_assessment"]
    assert ha["triage_level"] == "MODERATE"
    assert ha["possible_explanations"] == [{"text": "a viral infection", "document": "Fever Guide", "page": 12}]
    assert [(e["document"], e["page"]) for e in ha["medical_evidence"]] == [("Fever Guide", 12)]  # not "MADE UP"
    assert ha["disclaimer"].startswith("This AI-generated report is intended for healthcare guidance")


@pytest.mark.django_db
def test_no_retrieved_evidence_means_no_possible_explanations(monkeypatch):
    r = _report(_session(monkeypatch, approved=False), monkeypatch, _raw())
    assert r["health_assessment"]["possible_explanations"] == [] and r["health_assessment"]["medical_evidence"] == []


@pytest.mark.django_db
def test_unsafe_lines_are_dropped_and_flagged_for_clinician_review(monkeypatch):
    r = _report(_session(monkeypatch), monkeypatch, _raw(recommended_actions=["Take 500 mg paracetamol", "See a doctor soon"]))
    ha = r["health_assessment"]
    assert ha["recommended_actions"] == ["See a doctor soon"] and ha["requires_clinician_review"] is True


@pytest.mark.django_db
def test_unsafe_live_agent_advice_is_flagged_not_repeated(monkeypatch):
    s = _session(monkeypatch)
    Turn.objects.create(session=s, role="assistant", text="Take 500 mg paracetamol now", language_detected="en", response_policy="question")
    r = _report(s, monkeypatch, _raw())
    assert r["health_assessment"]["requires_clinician_review"] is True


@pytest.mark.django_db
def test_emergency_is_never_downgraded_when_a_fixed_rule_fired(monkeypatch):
    s = _session(monkeypatch, said="I have fever and my neck is stiff")  # fixed rule RF-MENING-01
    r = _report(s, monkeypatch, _raw(level="LOW", emergency_instructions="Rest at home"))
    ha = r["health_assessment"]
    assert ha["triage_level"] == "EMERGENCY" and "999" in ha["emergency_instructions"] and "Rest" not in ha["emergency_instructions"]
    assert ha["requires_clinician_review"] is True


@pytest.mark.django_db
def test_model_emergency_gets_the_fixed_instruction_and_non_emergency_has_none(monkeypatch):
    r = _report(_session(monkeypatch), monkeypatch, _raw(level="EMERGENCY", emergency_instructions="my own words"))
    assert "999" in r["health_assessment"]["emergency_instructions"] and "own words" not in r["health_assessment"]["emergency_instructions"]
    s2 = _session(monkeypatch, said="mild cold")
    r2 = _report(s2, monkeypatch, _raw(level="LOW", emergency_instructions="go now"))
    assert r2["health_assessment"]["emergency_instructions"] is None


@pytest.mark.django_db
def test_junk_or_missing_model_output_stores_nothing(monkeypatch):
    s = _session(monkeypatch)
    for raw in ("not json", json.dumps({"conversation_summary": {}}), json.dumps(_raw(level="URGENT")), None):
        monkeypatch.setattr(dialogue, "generate_text", lambda *a, **k: raw)
        attach_consultation_report(s)
    assert "report" not in TriageSummary.objects.get(session=s).structured_fields


@pytest.mark.django_db
def test_the_model_never_receives_patient_identity(monkeypatch):
    s = _session(monkeypatch)
    seen = {}
    monkeypatch.setattr(dialogue, "generate_text", lambda m, **k: seen.update(body=m[0]["text"]) or None)
    attach_consultation_report(s)
    body = json.loads(seen["body"])
    assert set(body) == {"consultation_id", "language", "transcript", "structured_symptom_history", "red_flag_results", "retrieved_passages", "suggested_specialty"}


@pytest.mark.django_db
def test_question_answer_objects_become_readable_lines(monkeypatch):
    raw = _raw()
    raw["conversation_summary"]["important_questions_and_answers"] = [{"question": "Age?", "answer": "30"}, "free text"]
    r = _report(_session(monkeypatch), monkeypatch, raw)
    assert r["conversation_summary"]["important_questions_and_answers"] == ["Age? — 30", "free text"]


@pytest.mark.django_db
def test_explanations_without_a_real_quote_are_removed_and_flagged(monkeypatch):
    items = [
        {"text": "viral infection", "supporting_quote": "fever with HEADACHE is often caused by viral  infection and needs assessment"},  # case/spacing differences are fine
        {"text": "strep throat", "supporting_quote": "streptococcal pharyngitis is the commonest bacterial cause of sore throat"},  # not in any passage
        {"text": "covid", "supporting_quote": "viral"},  # too short to prove anything
        {"text": "no quote at all"},
        "a plain string",
    ]
    r = _report(_session(monkeypatch), monkeypatch, _raw(possible_explanations=items))
    ha = r["health_assessment"]
    assert [e["text"] for e in ha["possible_explanations"]] == ["viral infection"]
    assert ha["requires_clinician_review"] is True


def test_quote_matching_survives_pdf_line_breaks_and_hyphenation():
    from apps.triage.dialogue import _grounded_explanations

    passages = [{"document_name": "D", "page_number": 3, "relevant_information": "guidelines for the manage\n-\nment of infection\nare issued by the WHO"}]
    kept, dropped = _grounded_explanations([{"text": "t", "supporting_quote": "guidelines for the management of infection are issued by the WHO"}], passages)
    assert kept and kept[0]["page"] == 3 and dropped is False
