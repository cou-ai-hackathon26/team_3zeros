"""
Celery asynchronous tasks for AI and OCR processing (MASTERPLAN §7, §10, D-21).
Enforces INV-7: AI never diagnoses or sends independently.
"""
import logging
from celery import shared_task
from django.utils import timezone
from django.core.files.storage import default_storage
from apps.workflow.engine import execute_transition
from apps.workflow.models import OutboxEvent
from apps.ai.adapters import get_ocr_adapter, get_llm_adapter, validate_referral_draft_schema

logger = logging.getLogger(__name__)


@shared_task(name="apps.ai.tasks.process_document_ocr")
def process_document_ocr(document_id: str):
    """
    OCR pipeline Celery task for an uploaded medical document.
    Transitions: OCR_QUEUED -> OCR_RUNNING -> EXTRACTED_UNVERIFIED (or OCR_FAILED).
    """
    from apps.documents.models import Document, ExtractionJob, ExtractedField
    from apps.documents.transitions import DOCUMENT_TRANSITIONS

    doc = Document.objects.filter(public_id=document_id).first()
    if not doc:
        logger.warning("process_document_ocr: Document %s not found", document_id)
        return

    if doc.state != "OCR_QUEUED":
        logger.info("process_document_ocr: Document %s state is %s, skipping", document_id, doc.state)
        return

    doc.TRANSITIONS = DOCUMENT_TRANSITIONS
    execute_transition(doc, "start_ocr", None)

    job = None
    try:
        from apps.ai.report_analysis import (
            extract_document_fields_and_text,
            generate_document_ai_rag_report,
            refresh_patient_report_history,
        )

        adapter = get_ocr_adapter()
        file_bytes = b""
        if default_storage.exists(doc.storage_key):
            with default_storage.open(doc.storage_key, "rb") as f:
                file_bytes = f.read()

        fields, raw_text, engine_name = extract_document_fields_and_text(
            file_bytes=file_bytes,
            content_type=doc.content_type,
            filename=doc.original_filename,
            adapter=adapter,
        )

        ai_report = generate_document_ai_rag_report(doc, raw_text, fields)

        job = ExtractionJob.objects.create(
            document=doc,
            engine=engine_name[:50],
            engine_version=getattr(adapter, "version", "1.0.0"),
            raw_text=raw_text,
            ai_report=ai_report,
        )

        for field in fields:
            ExtractedField.objects.create(
                job=job,
                name=field.get("name", "Unknown")[:100],
                value=str(field.get("value", ""))[:255],
                unit=field.get("unit", "")[:50],
                reference_range=field.get("reference_range", "")[:100],
                interpretation=field.get("interpretation", "unknown")[:20],
                confidence=float(field.get("confidence", 1.0)),
                page=int(field.get("page", 1)),
                bbox=field.get("bbox", {}),
                lab=field.get("lab", "")[:255],
                status="candidate",
            )

        job.finished_at = timezone.now()
        job.save(update_fields=["finished_at"])

        execute_transition(doc, "ocr_succeeded", None)
        refresh_patient_report_history(doc.patient)

        OutboxEvent.objects.create(
            aggregate_type="document",
            aggregate_id=doc.public_id,
            event_type="document.extraction_ready",
            payload={"id": str(doc.public_id), "patient_id": str(doc.patient.public_id)},
        )
        logger.info("process_document_ocr: Successfully processed document %s with %d fields", document_id, len(fields))

    except Exception as exc:
        logger.error("process_document_ocr: Error processing document %s: %s", document_id, exc, exc_info=True)
        if job:
            job.error = str(exc)
            job.finished_at = timezone.now()
            job.save(update_fields=["error", "finished_at"])
        execute_transition(doc, "ocr_failed", None)
        raise


@shared_task(name="apps.ai.tasks.generate_referral_draft_task")
def generate_referral_draft_task(referral_id: str):
    """
    AI summary generation Celery task for DRAFT referrals (INV-7).
    Compiles patient context, queries LLM adapter, validates schema, and saves draft version.
    """
    from apps.referrals.models import Referral, ReferralDraftVersion, compute_content_hash

    referral = Referral.objects.filter(public_id=referral_id).first()
    if not referral:
        logger.warning("generate_referral_draft_task: Referral %s not found", referral_id)
        return

    if referral.state != "DRAFT":
        logger.info("generate_referral_draft_task: Referral %s state is %s (not DRAFT), skipping", referral_id, referral.state)
        return

    from apps.ai.referral_context import build_referral_context
    context_lines, _refs = build_referral_context(referral)

    system_prompt = (
        "You are a clinical referral summarization assistant helping a referring doctor hand over a patient "
        "to a senior specialist. Base your summary strictly on the provided clinical records and analyzed "
        "diagnostic reports. Include a concise section listing prior tests performed, which findings were "
        "positive/abnormal/high/low, and which were negative/normal. "
        "Every clinical statement must include valid source_refs taken only from the [bracketed] references in the input. "
        "Do not invent medical facts or diagnose. Do not use placeholder strings like N/A. "
        "If information is missing, place it in the 'Missing or Uncertain Information' section with empty source_refs."
    )
    user_prompt = "Generate structured referral summary sections for:\n" + "\n".join(context_lines)

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt},
    ]

    adapter = get_llm_adapter()
    draft = adapter.generate(schema={}, messages=messages)
    validate_referral_draft_schema(draft)

    next_version = referral.draft_versions.count() + 1
    referral.summary = draft
    referral.summary_origin = "ai_draft_edited"
    referral.content_hash = compute_content_hash(draft)
    referral.save(increment_version=True)

    ReferralDraftVersion.objects.create(
        referral=referral,
        version_number=next_version,
        summary=draft,
        created_by=None,
        origin="ai_draft",
    )

    OutboxEvent.objects.create(
        aggregate_type="referral",
        aggregate_id=referral.public_id,
        event_type="referral.draft_ready",
        payload={"id": str(referral.public_id), "version": next_version},
    )
    logger.info("generate_referral_draft_task: Generated AI draft v%d for referral %s", next_version, referral_id)
