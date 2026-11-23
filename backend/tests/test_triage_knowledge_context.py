import json
import pytest
from django.core.management import call_command
from apps.directory.models import Area, Service, Specialty
from apps.knowledge.models import KnowledgeChunk, KnowledgeDocument
from apps.knowledge.search import chunk_text, reset_index, search
from apps.organizations.models import Facility, Practitioner, PractitionerRole
from apps.triage import dialogue
from apps.triage.models import TriageSummary
from apps.triage.services import create_triage_session, process_patient_turn


@pytest.fixture(autouse=True)
def _fresh_index():
    reset_index()
    yield
    reset_index()


def _doc(approved, title="Fever Guide", text="Fever with severe headache and stiff neck needs urgent assessment by a doctor."):
    d = KnowledgeDocument.objects.create(title=title, approved=approved)
    KnowledgeChunk.objects.create(document=d, page=12, text=text)
    return d


@pytest.mark.django_db
def test_search_returns_only_approved_passages_with_document_and_page():
    _doc(False, "Unapproved", "fever headache fever headache")
    _doc(True)
    hits = search("I have fever and a bad headache")
    assert [h["document_name"] for h in hits] == ["Fever Guide"]
    assert hits[0]["page_number"] == 12
    assert search("zzz qqq") == []


def test_chunk_text_splits_long_pages():
    assert len(chunk_text("Sentence one. " * 200)) > 1


@pytest.mark.django_db
def test_greeting_is_always_the_bangla_one():
    s = create_triage_session(user=None, language="en", disclosure_version="v1.0")
    assert s.turns.first().text.startswith("আসসালামু আলাইকুম")


@pytest.mark.django_db
def test_prompt_gets_real_references_doctors_and_hospitals(monkeypatch):
    _doc(True)
    area = Area.objects.create(level="district", name_en="Dhaka", name_bn="ঢাকা", code="9")
    spec = Specialty.objects.get(code="general_medicine") if Specialty.objects.filter(code="general_medicine").exists() else Specialty.objects.create(code="general_medicine", name_en="General Medicine", name_bn="সাধারণ")
    fac = Facility.objects.create(name="Savar Hospital", area=area, phone="+8801700000999", address="Savar")
    Service.objects.create(facility=fac, code="emergency", name="Emergency")
    doc = Practitioner.objects.create(registration_number="R1", name="Rahman")
    PractitionerRole.objects.create(practitioner=doc, facility=fac, specialty=spec)
    session = create_triage_session(user=None, language="en", disclosure_version="v1.0")
    seen = {}
    monkeypatch.setattr(dialogue, "generate_text", lambda m, system="", **k: seen.update(system=system) or "ok?")
    for text in ("I have fever", "since 3 days", "headache too"):
        process_patient_turn(session, text)
    system = seen["system"]
    assert "[Fever Guide, page 12]" in system
    assert "Dr. Rahman, Savar Hospital" in system
    assert "Savar Hospital, Savar, phone +8801700000999" in system


@pytest.mark.django_db
def test_no_doctor_block_before_enough_history(monkeypatch):
    session = create_triage_session(user=None, language="en", disclosure_version="v1.0")
    seen = {}
    monkeypatch.setattr(dialogue, "generate_text", lambda m, system="", **k: seen.update(system=system) or "ok?")
    process_patient_turn(session, "I have fever")
    assert "DOCTORS ON THE PLATFORM (real" not in seen["system"] and "EMERGENCY HOSPITALS (verified" not in seen["system"] and "DOCTORS: none" not in seen["system"]


@pytest.mark.django_db
def test_ingest_command_loads_a_pdf_unapproved_by_default(tmp_path):
    from pypdf import PdfWriter

    pdf = tmp_path / "ref.pdf"
    w = PdfWriter()
    w.add_blank_page(width=200, height=200)
    w.write(str(pdf))
    call_command("ingest_knowledge", str(pdf), "--title", "Blank")
    assert KnowledgeDocument.objects.get(title="Blank").approved is False


@pytest.mark.django_db
def test_index_follows_approval_changes_without_a_restart():
    d = _doc(False)
    assert search("fever headache stiff neck") == []
    d.approved = True
    d.save()
    assert search("fever headache stiff neck")[0]["document_name"] == "Fever Guide"


@pytest.mark.django_db
def test_bangla_words_are_searched_in_english(monkeypatch):
    from django.core.cache import cache
    from apps.triage import context

    cache.clear()
    _doc(True)
    calls = []
    monkeypatch.setattr(context, "translate_text", lambda t, s, d: calls.append(t) or "I have fever and a severe headache")
    session = create_triage_session(user=None, language="bn", disclosure_version="v1.0")
    process_patient_turn(session, "আমার জ্বর আর তীব্র মাথা ব্যথা")
    hits = context.reference_passages(session)
    assert hits and hits[0]["document_name"] == "Fever Guide"
    context.reference_passages(session)
    assert len(calls) == 1  # translated once, then served from cache


@pytest.mark.django_db
def test_untranslatable_bangla_falls_back_to_the_original_words(monkeypatch):
    from django.core.cache import cache
    from apps.triage import context

    cache.clear()
    monkeypatch.setattr(context, "translate_text", lambda *a: None)
    assert context._english("আমার জ্বর") == "আমার জ্বর"
    assert context._english("I have fever") == "I have fever"
