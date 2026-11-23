"""
Outbox event dispatcher tasks (MASTERPLAN §4.9, §7.1, BACKEND §7.1).
Periodically queries unhandled OutboxEvent entries and routes them to target workers.
"""
import logging
from datetime import timedelta
from celery import shared_task
from django.conf import settings
from django.utils import timezone
from apps.workflow.handlers import HANDLERS
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

            elif event.event_type in HANDLERS:
                HANDLERS[event.event_type](event)

            event.dispatched_at = timezone.now()
            event.save(update_fields=["dispatched_at"])
            dispatched_count += 1

        except Exception as exc:
            event.attempts += 1
            event.last_error = str(exc)
            event.save(update_fields=["attempts", "last_error"])
            logger.error("dispatch_outbox_events: Failed to dispatch event %s: %s", event.id, exc)

    return dispatched_count


# --- Scheduled jobs (BACKEND §7.2). Each does nothing until its policy setting is above zero. ---

def _cutoff(minutes: int):
    return timezone.now() - timedelta(minutes=minutes)


@shared_task(name="apps.workflow.tasks.escalate_unacknowledged_referrals")
def escalate_unacknowledged_referrals() -> int:
    """`escalate` for emergency referrals still in SENT past the facility-approved threshold (Q-06). Never a code default."""
    minutes = settings.REFERRAL_ESCALATION_MINUTES
    if minutes <= 0:
        return 0
    from apps.referrals.models import Referral
    from apps.referrals.services import execute_referral_transition

    done = 0
    for ref in Referral.objects.filter(state="SENT", urgency="emergency", pending_action__isnull=True, sent_at__lt=_cutoff(minutes)):
        try:
            execute_referral_transition(None, ref.public_id, "escalate", as_system=True)
            done += 1
        except Exception as exc:
            logger.error("escalate_unacknowledged_referrals: %s failed: %s", ref.public_id, exc)
    return done


@shared_task(name="apps.workflow.tasks.remind_unacknowledged_referrals")
def remind_unacknowledged_referrals() -> int:
    """Reminder notification (no state change) for non-emergency referrals still in SENT; at most one per interval."""
    minutes = settings.REFERRAL_REMINDER_MINUTES
    if minutes <= 0:
        return 0
    from apps.notifications.models import Notification
    from apps.notifications.services import facility_users, notify
    from apps.referrals.models import Referral

    cutoff, sent = _cutoff(minutes), 0
    for ref in Referral.objects.filter(state="SENT", sent_at__lt=cutoff).exclude(urgency="emergency").select_related("receiver_facility"):
        if Notification.objects.filter(type="referral.reminder", object_ref=ref.public_id, created_at__gte=cutoff).exists():
            continue
        sent += len(notify(facility_users(ref.receiver_facility, permission="referral.acknowledge"), "referral.reminder", ref.public_id))
    return sent


@shared_task(name="apps.workflow.tasks.abandon_idle_triage_sessions")
def abandon_idle_triage_sessions() -> int:
    """`abandon` for open triage sessions with no activity for TRIAGE_IDLE_TIMEOUT_MINUTES."""
    minutes = settings.TRIAGE_IDLE_TIMEOUT_MINUTES
    if minutes <= 0:
        return 0
    from apps.triage.models import TriageSession
    from apps.triage.services import run_triage_action

    cutoff, done = _cutoff(minutes), 0
    for session in TriageSession.objects.filter(state__in=("CREATED", "ACTIVE", "PAUSED", "SUMMARY_PENDING_REVIEW"), updated_at__lt=cutoff):
        last_turn = session.turns.order_by("-at").values_list("at", flat=True).first()
        if last_turn and last_turn >= cutoff:
            continue
        try:
            run_triage_action(session, "abandon")
            done += 1
        except Exception as exc:
            logger.error("abandon_idle_triage_sessions: %s failed: %s", session.public_id, exc)
    return done


@shared_task(name="apps.workflow.tasks.expire_appointment_requests")
def expire_appointment_requests() -> int:
    """`expire` for unanswered appointment requests older than APPOINTMENT_REQUEST_EXPIRY_HOURS (Q-04)."""
    hours = settings.APPOINTMENT_REQUEST_EXPIRY_HOURS
    if hours <= 0:
        return 0
    from apps.scheduling.models import Appointment
    from apps.scheduling.services import execute_appointment_transition

    done = 0
    old = timezone.now() - timedelta(hours=hours)
    for appt in Appointment.objects.filter(state__in=("REQUESTED", "ALTERNATE_SLOT_PROPOSED", "PATIENT_ACCEPTED"), created_at__lt=old):
        try:
            execute_appointment_transition(None, appt.public_id, "expire")
            done += 1
        except Exception as exc:
            logger.error("expire_appointment_requests: %s failed: %s", appt.public_id, exc)
    return done
