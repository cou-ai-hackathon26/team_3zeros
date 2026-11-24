"""Knowledge base: ingestion, hybrid search, approval gate (TRIAGE_RAG_REFERRAL_PLAN §4)."""
import pytest
from django.core.files.uploadedfile import SimpleUploadedFile

from apps.ai import embeddings
from apps.ai.embeddings import EmbeddingError
from apps.common.exceptions import ValidationError
from apps.knowledge import ingest
from apps.knowledge.ingest import chunk_text, ingest_document, store_upload
from apps.knowledge.models import KnowledgeChunk, KnowledgeDocument
from apps.knowledge.search import search
from apps.knowledge.versioning import kb_version
from tests.kb import make_doc, make_pdf

PAGES = [
    "Diabetes mellitus causes thirst and frequent urination. Blood glucose is raised.",
    "Asthma causes wheeze and breathlessness. Inhaled treatment relieves airway narrowing.",
]


@pytest.fixture(autouse=True)
def _media(settings, tmp_path):
    settings.MEDIA_ROOT = str(tmp_path)


def _upload(pages=PAGES, name="book.pdf", **meta):
    return store_upload(SimpleUploadedFile(name, make_pdf(pages), content_type="application/pdf"), title=meta.pop("title", "Test Book"), **meta)


# --- chunking -----------------------------------------------------------------------------------------------------

def test_chunks_overlap_and_stay_near_the_size():
    text = " ".join(f"Sentence number {i} is here." for i in range(200))
    parts = chunk_text(text, size=300, overlap=50)
    assert len(parts) > 3 and all(len(p) < 500 for p in parts)
    assert parts[0][-30:].strip()[:10] in parts[1]  # the next piece starts with the tail of the last


# --- ingestion ----------------------------------------------------------------------------------------------------

@pytest.mark.django_db
def test_an_uploaded_pdf_is_ingested_embedded_and_not_searchable_until_approved():
    doc = _upload()
    assert doc.status == "PROCESSING" and doc.storage_key and len(doc.sha256) == 64 and doc.approved is False
    doc = ingest_document(doc)
    assert (doc.status, doc.page_count) == ("READY", 2)
    assert doc.chunk_count >= 2 and doc.embedded_count == doc.chunk_count
    assert not doc.chunks.filter(search_vector__isnull=True).exists()
    assert search("thirst and frequent urination") == []  # not approved yet
    doc.approved = True
    doc.save()
    assert search("thirst and frequent urination")[0]["page_number"] == 1


@pytest.mark.django_db
def test_a_scanned_pdf_fails_with_a_clear_message():
    doc = ingest_document(_upload(pages=["", ""]))
    assert doc.status == "FAILED" and "scanned" in doc.error.lower()


@pytest.mark.django_db
def test_uploads_are_validated():
    with pytest.raises(ValidationError):
        store_upload(SimpleUploadedFile("x.pdf", b"not a pdf at all"), title="x")
    _upload()
    with pytest.raises(ValidationError):
        _upload()  # same bytes: already uploaded


@pytest.mark.django_db
def test_the_size_limit_is_enforced(settings):
    settings.KNOWLEDGE_MAX_UPLOAD_MB = 0
    with pytest.raises(ValidationError):
        _upload()


@pytest.mark.django_db
def test_a_stopped_embedding_run_resumes_where_it_stopped(monkeypatch):
    doc = _upload(pages=[f"Page {i} text about topic {i}. " * 40 for i in range(1, 6)])
    monkeypatch.setattr(ingest, "EMBED_BATCH", 2)
    real, calls = embeddings.embed_texts, {"n": 0}

    def flaky(texts, task_type="RETRIEVAL_DOCUMENT"):
        calls["n"] += 1
        if calls["n"] == 3:
            raise EmbeddingError("quota")
        return real(texts, task_type)

    monkeypatch.setattr(ingest, "embed_texts", flaky)
    doc = ingest_document(doc)
    assert doc.status == "FAILED" and "Retry" in doc.error and 0 < doc.embedded_count < doc.chunk_count
    done = doc.embedded_count
    monkeypatch.setattr(ingest, "embed_texts", real)
    seen = []
    monkeypatch.setattr(ingest, "embed_texts", lambda texts, t="RETRIEVAL_DOCUMENT": seen.extend(texts) or real(texts, t))
    doc = ingest_document(doc)
    assert doc.status == "READY" and doc.embedded_count == doc.chunk_count
    assert len(seen) == doc.chunk_count - done  # only the missing passages were embedded again


# --- search -------------------------------------------------------------------------------------------------------

@pytest.mark.django_db
def test_only_approved_ready_documents_are_searched():
    make_doc("Approved", approved=True, text="Cough with blood needs chest imaging.")
    make_doc("Draft", approved=False, text="Cough with blood needs chest imaging.")
    make_doc("Processing", approved=True, status="PROCESSING", text="Cough with blood needs chest imaging.")
    make_doc("Failed", approved=True, status="FAILED", text="Cough with blood needs chest imaging.")
    assert {h["document_name"] for h in search("cough with blood")} == {"Approved"}


@pytest.mark.django_db
def test_the_admin_can_try_a_question_against_an_unapproved_book():
    d = make_doc("Draft", approved=False, text="Cough with blood needs chest imaging.")
    assert search("cough with blood") == []
    hits = search("cough with blood", approved_only=False, document=str(d.public_id))
    assert hits and hits[0]["document_name"] == "Draft"
    assert search("cough with blood", approved_only=False, document="00000000-0000-0000-0000-000000000000") == []


@pytest.mark.django_db
def test_results_carry_the_stored_citation_and_passage_id():
    d = make_doc("Davidson's", page=399, text="Incubation period averages two to four days.")
    hit = search("incubation period days")[0]
    assert (hit["document_name"], hit["page_number"]) == ("Davidson's", 399)
    assert hit["id"] == d.chunks.first().pk


@pytest.mark.django_db
def test_a_weak_match_is_not_evidence(settings):
    make_doc(text="Fracture of the femur needs surgical fixation.")
    settings.KNOWLEDGE_MIN_SIMILARITY = 0.9
    assert search("zebra giraffe elephant") == []


@pytest.mark.django_db
def test_full_text_alone_answers_when_embedding_is_unavailable(monkeypatch):
    make_doc(text="Dengue fever shows a falling platelet count after day three.")
    from apps.knowledge import search as search_mod
    monkeypatch.setattr(search_mod, "embed_query", lambda q: None)
    assert search("platelet count dengue")[0]["document_name"] == "Fever Guide"
    assert search("zebra giraffe") == []


@pytest.mark.django_db
def test_the_limit_and_empty_queries():
    make_doc(texts=[f"Cough passage {i} about chest imaging." for i in range(6)])
    assert len(search("cough chest imaging", limit=2)) == 2
    assert search("   ") == []


# --- version ------------------------------------------------------------------------------------------------------

@pytest.mark.django_db
def test_kb_version_changes_with_the_approved_set():
    assert kb_version() == "none"
    d = make_doc(approved=False)
    assert kb_version() == "none"
    d.approved = True
    d.save()
    first = kb_version()
    assert first != "none"
    make_doc("Second", approved=True)
    assert kb_version() != first


@pytest.mark.django_db
def test_a_new_triage_session_records_the_kb_version():
    from apps.triage.services import create_triage_session
    make_doc(approved=True)
    s = create_triage_session(user=None, language="en", disclosure_version="v1.0")
    assert s.kb_version == kb_version() != "1.0.0"


@pytest.mark.django_db
def test_the_assistant_turn_records_the_passages_it_was_given(monkeypatch):
    from apps.triage import dialogue
    from apps.triage.services import create_triage_session, process_patient_turn
    d = make_doc(approved=True, text="Cough with fever for three days needs assessment.")
    s = create_triage_session(user=None, language="en", disclosure_version="v1.0")
    monkeypatch.setattr(dialogue, "generate_text", lambda *a, **k: "How old are you?")
    turn = process_patient_turn(s, "cough with fever for three days")
    assert turn.passage_ids == [d.chunks.first().pk]


# --- command ------------------------------------------------------------------------------------------------------

@pytest.mark.django_db
def test_the_command_ingests_and_approval_needs_a_named_reviewer(tmp_path):
    from django.core.management import call_command
    from django.core.management.base import CommandError
    pdf = tmp_path / "b.pdf"
    pdf.write_bytes(make_pdf(PAGES))
    with pytest.raises(CommandError):
        call_command("ingest_knowledge", str(pdf), "--title", "B", "--approve")
    call_command("ingest_knowledge", str(pdf), "--title", "B", "--approve", "--reviewer", "Dr Rahman")
    d = KnowledgeDocument.objects.get(title="B")
    assert (d.status, d.approved, d.reviewer_name) == ("READY", True, "Dr Rahman") and d.approved_at


def test_a_dropped_connection_is_retried_then_succeeds(settings, monkeypatch):
    import requests
    from apps.ai import embeddings as emb
    settings.EMBEDDING_PROVIDER, settings.GEMINI_API_KEY = "gemini", "k"
    monkeypatch.setattr(emb.time, "sleep", lambda s: None)
    calls = {"n": 0}

    class R:
        status_code = 200
        headers = {}
        def json(self): return {"embeddings": [{"values": [1.0] + [0.0] * 767}]}

    def post(*a, **k):
        calls["n"] += 1
        if calls["n"] < 3:
            raise requests.ConnectionError("dropped")
        return R()

    monkeypatch.setattr(emb.requests, "post", post)
    assert len(emb.embed_texts(["x"])[0]) == 768 and calls["n"] == 3


def test_a_connection_that_never_recovers_fails_with_embedding_error(settings, monkeypatch):
    import requests
    from apps.ai import embeddings as emb
    settings.EMBEDDING_PROVIDER, settings.GEMINI_API_KEY = "gemini", "k"
    monkeypatch.setattr(emb.time, "sleep", lambda s: None)
    monkeypatch.setattr(emb.requests, "post", lambda *a, **k: (_ for _ in ()).throw(requests.ConnectionError("down")))
    with pytest.raises(EmbeddingError):
        emb.embed_texts(["x"])


@pytest.mark.django_db
def test_a_book_embedded_with_another_model_is_searched_by_full_text_only():
    d = make_doc(text="Dengue fever shows a falling platelet count.", embedding_model="gemini:some-older-model")
    hits = search("platelet count dengue")
    assert hits and hits[0]["document_name"] == "Fever Guide"  # full-text still answers
    other = make_doc("Other", text="Cough with blood needs imaging.", embedding_model="gemini:some-older-model")
    assert d.embedding_model != "mock:mock"
    assert search("zebra giraffe", approved_only=False, document=str(other.public_id)) == []
