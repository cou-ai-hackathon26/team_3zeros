import json
import pytest
from apps.directory.models import Area, Service, Specialty
from apps.knowledge.models import KnowledgeDocument
from apps.knowledge.search import search
from tests.kb import make_doc
from apps.organizations.models import Facility, Practitioner, PractitionerRole
from apps.triage import dialogue
from apps.triage.models import TriageSummary
from apps.triage.services import create_triage_session, process_patient_turn


def _doc(approved, title="Fever Guide", text="Fever with severe headache and stiff neck needs urgent assessment by a doctor."):
    return make_doc(title=title, approved=approved, text=text)


@pytest.mark.django_db
def test_search_returns_only_approved_passages_with_document_and_page():
    _doc(False, "Unapproved", "fever headache fever headache")
    _doc(True)
    hits = search("I have fever and a bad headache")
    assert [h["document_name"] for h in hits] == ["Fever Guide"]
    assert hits[0]["page_number"] == 12
    assert search("zzz qqq") == []


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
