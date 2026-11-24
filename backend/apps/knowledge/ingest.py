"""Loading a reference book into the knowledge base (MASTERPLAN D-28, D-29).

One service used by the upload API's background task and by the `ingest_knowledge` command:
store the file -> read pages -> chunk -> full-text vectors -> embeddings -> READY. Resumable: a run that stops
(rate limit, outage) can be retried and continues where it stopped. A document is never searchable until approved."""
import hashlib
import io
import logging
import re
from typing import List

from django.conf import settings
from django.core.files.base import ContentFile
from django.core.files.storage import default_storage
from django.db import connection, transaction
from pypdf import PdfReader

from apps.ai.embeddings import EmbeddingError, embed_texts
from apps.common.exceptions import ValidationError
from apps.workflow.models import OutboxEvent
from .models import KnowledgeChunk, KnowledgeDocument

logger = logging.getLogger(__name__)

CHUNK_SIZE, CHUNK_OVERLAP = 1200, 150
EMBED_BATCH = 100


def chunk_text(text: str, size: int = CHUNK_SIZE, overlap: int = CHUNK_OVERLAP) -> List[str]:
    """Split a page into pieces of about `size` characters on sentence boundaries, each starting with the tail of the previous."""
    sentences = [s for s in re.split(r"(?<=[.!?।])\s+", text.strip()) if s]
    parts, cur = [], ""
    for sent in sentences:
        if cur and len(cur) + len(sent) > size:
            parts.append(cur.strip())
            cur = cur[-overlap:] if overlap else ""
        cur += sent + " "
    if cur.strip():
        parts.append(cur.strip())
    return parts


def store_upload(file, *, title, publisher="", version="", language="en", rights_statement="", user=None) -> KnowledgeDocument:
    """Validate and save an uploaded PDF, create the document in PROCESSING, and queue ingestion."""
    head = file.read(5)
    if head != b"%PDF-":
        raise ValidationError("Only PDF files can be uploaded.")
    file.seek(0)
    sha, size = hashlib.sha256(), 0
    for block in iter(lambda: file.read(1024 * 1024), b""):
        sha.update(block)
        size += len(block)
    if size > settings.KNOWLEDGE_MAX_UPLOAD_MB * 1024 * 1024:
        raise ValidationError(f"The file is larger than {settings.KNOWLEDGE_MAX_UPLOAD_MB} MB.")
    digest = sha.hexdigest()
    if KnowledgeDocument.objects.filter(sha256=digest).exists():
        raise ValidationError("This file has already been uploaded.")
    file.seek(0)

    doc = KnowledgeDocument.objects.create(
        title=title, publisher=publisher, version=version, language=language, rights_statement=rights_statement,
        sha256=digest, size=size, uploaded_by=user, status="PROCESSING", embedding_model=settings.EMBEDDING_MODEL,
    )
    doc.storage_key = default_storage.save(f"knowledge/{doc.public_id}.pdf", file)
    doc.save(update_fields=["storage_key"])
    queue_ingestion(doc)
    return doc


def queue_ingestion(doc: KnowledgeDocument) -> None:
    OutboxEvent.objects.create(
        aggregate_type="knowledge_document", aggregate_id=doc.public_id, event_type="knowledge.document_uploaded",
        payload={"id": str(doc.public_id)},
    )

    def kick():
        from apps.workflow.tasks import dispatch_outbox_events
        dispatch_outbox_events.delay()

    transaction.on_commit(kick)


def _fail(doc: KnowledgeDocument, message: str) -> None:
    doc.status, doc.error = "FAILED", message[:1000]
    doc.save(update_fields=["status", "error"])
    logger.warning("knowledge ingest failed for %s: %s", doc.public_id, message)


def _fill_search_vectors(doc: KnowledgeDocument) -> None:
    # One text-search configuration for every document, matching the query side: English stemming helps English books and
    # leaves Bangla words unchanged.
    with connection.cursor() as cur:
        cur.execute(
            "UPDATE knowledge_knowledgechunk SET search_vector = to_tsvector('english'::regconfig, text) WHERE document_id = %s AND search_vector IS NULL",
            [doc.pk],
        )


def _extract_chunks(doc: KnowledgeDocument) -> bool:
    """Read the PDF and store its passages. Returns False (and marks the document FAILED) if there is nothing to store."""
    with default_storage.open(doc.storage_key, "rb") as f:
        try:
            reader = PdfReader(io.BytesIO(f.read()))
        except Exception as exc:
            _fail(doc, f"Cannot read the PDF: {exc}")
            return False
    doc.page_count = len(reader.pages)
    batch, empty_pages = [], 0
    for number, page in enumerate(reader.pages, start=1):
        try:
            text = page.extract_text() or ""
        except Exception as exc:  # image-heavy pages can exceed pypdf's safety limits
            logger.info("skipped page %s of %s: %s", number, doc.public_id, exc)
            empty_pages += 1
            continue
        pieces = chunk_text(text)
        if not pieces:
            empty_pages += 1
        batch += [KnowledgeChunk(document=doc, page=number, ordinal=i, text=piece) for i, piece in enumerate(pieces)]
        if len(batch) >= 500:
            KnowledgeChunk.objects.bulk_create(batch)
            batch = []
    KnowledgeChunk.objects.bulk_create(batch)
    doc.chunk_count = doc.chunks.count()
    doc.save(update_fields=["page_count", "chunk_count"])
    if doc.chunk_count == 0:
        _fail(doc, "No text found: this looks like a scanned PDF. OCR it first.")
        return False
    if empty_pages:
        logger.info("%s: %d pages had no readable text", doc.public_id, empty_pages)
    return True


def ingest_document(doc: KnowledgeDocument) -> KnowledgeDocument:
    """Run ingestion to the end, or until it fails. Safe to run again: existing passages and vectors are kept."""
    doc.status, doc.error = "PROCESSING", ""
    doc.save(update_fields=["status", "error"])
    if not doc.chunks.exists() and not _extract_chunks(doc):
        return doc
    _fill_search_vectors(doc)

    while True:
        pending = list(doc.chunks.filter(embedding__isnull=True).order_by("id")[:EMBED_BATCH])
        if not pending:
            break
        try:
            vectors = embed_texts([c.text for c in pending], "RETRIEVAL_DOCUMENT")
        except EmbeddingError as exc:
            doc.embedded_count = doc.chunks.filter(embedding__isnull=False).count()
            doc.save(update_fields=["embedded_count"])
            _fail(doc, f"Embedding stopped at {doc.embedded_count}/{doc.chunk_count}: {exc}. Retry to continue.")
            return doc
        for chunk, vec in zip(pending, vectors):
            chunk.embedding = vec
        KnowledgeChunk.objects.bulk_update(pending, ["embedding"])
        doc.embedded_count = doc.chunks.filter(embedding__isnull=False).count()
        doc.save(update_fields=["embedded_count"])

    doc.status = "READY"
    doc.save(update_fields=["status"])
    return doc
