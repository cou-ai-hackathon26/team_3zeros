"""Background triage work (BACKEND §7). The report is drafted here, not inside the patient's request."""
import logging

from celery import shared_task

logger = logging.getLogger(__name__)


@shared_task(name="apps.triage.tasks.generate_triage_report")
def generate_triage_report(session_id: str) -> None:
    from .models import TriageSession
    from .services import attach_consultation_report

    session = TriageSession.objects.filter(public_id=session_id).first()
    if not session:
        logger.warning("generate_triage_report: session %s not found", session_id)
        return
    attach_consultation_report(session)
