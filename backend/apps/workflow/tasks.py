"""
Outbox event dispatcher tasks (MASTERPLAN §4.9, §7.1, BACKEND §7.1).
Periodically queries unhandled OutboxEvent entries and routes them to target workers.
"""
import logging
from celery import shared_task
from django.utils import timezone
from apps.workflow.models import OutboxEvent

logger = logging.getLogger(__name__)


@shared_task(name="apps.workflow.tasks.dispatch_outbox_events")
def dispatch_outbox_events(batch_size: int = 50) -> int:
    """
    Claims undispatched OutboxEvent records and dispatches them to their appropriate handlers.
    Returns the count of dispatched events.
    """
    events = (
        OutboxEvent.objects.filter(dispatched_at__isnull=True)
        .order_by("created_at")[:batch_size]
    )

    dispatched_count = 0
    for event in events:
        try:
            if event.event_type == "document.uploaded":
                from apps.ai.tasks import process_document_ocr
                process_document_ocr.delay(str(event.aggregate_id))

            elif event.event_type == "referral.draft_requested":
                from apps.ai.tasks import generate_referral_draft_task
                generate_referral_draft_task.delay(str(event.aggregate_id))

            event.dispatched_at = timezone.now()
            event.save(update_fields=["dispatched_at"])
            dispatched_count += 1

        except Exception as exc:
            event.attempts += 1
            event.last_error = str(exc)
            event.save(update_fields=["attempts", "last_error"])
            logger.error("dispatch_outbox_events: Failed to dispatch event %s: %s", event.id, exc)

    return dispatched_count
