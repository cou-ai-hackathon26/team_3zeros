import logging

from celery import shared_task

logger = logging.getLogger(__name__)


@shared_task(name="apps.knowledge.tasks.ingest_knowledge_document", queue="ai")
def ingest_knowledge_document(document_id: str) -> None:
    from .ingest import ingest_document
    from .models import KnowledgeDocument

    doc = KnowledgeDocument.objects.filter(public_id=document_id).first()
    if not doc:
        logger.warning("ingest_knowledge_document: %s not found", document_id)
        return
    ingest_document(doc)
