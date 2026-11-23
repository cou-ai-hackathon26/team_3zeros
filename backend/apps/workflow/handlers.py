"""Outbox handlers for `*.state_changed` events (BACKEND §7.1, MASTERPLAN §6.4).

Two effects, both carrying ids and states only, never clinical content:
  1. a WebSocket message to the people who watch the object's queue,
  2. in-app notifications for the transitions MASTERPLAN §5 says notify someone."""
from apps.common.consumers import broadcast_event
from apps.notifications.services import facility_users, notify, patient_user
from apps.referrals.models import Referral
from apps.scheduling.models import Appointment
from apps.workflow.models import HistoryEntry


def _referral(event):
    r = Referral.objects.select_related("sender_facility", "receiver_facility", "patient").filter(public_id=event.aggregate_id).first()
    if not r:
        return
    sender = lambda: facility_users(r.sender_facility)
    receiver = lambda: facility_users(r.receiver_facility, permission="referral.acknowledge")
    action = event.payload.get("action")
    if action == "request_consent":
        notify([patient_user(r.patient)], "referral.consent_requested", r.consent_request.public_id if r.consent_request else r.public_id)
    elif action == "consent_refused":
        notify(sender(), "referral.consent_refused", r.public_id)
    elif action == "send" and event.payload.get("state") == "SENT":  # the FHIR-gated send first records a pending event
        notify(receiver(), "referral.received_emergency" if r.urgency == "emergency" else "referral.received", r.public_id)
    elif action == "escalate":
        notify(receiver() + sender(), "referral.escalated", r.public_id)
    elif action in ("acknowledge", "decline"):
        notify(sender(), f"referral.{'acknowledged' if action == 'acknowledge' else 'declined'}", r.public_id)
    elif action == "return_outcome":
        notify(sender(), "referral.outcome_returned", r.public_id)
    elif action == "sync_failed":
        notify(sender() + facility_users(r.receiver_facility), "referral.sync_failed", r.public_id)
    broadcast_event(f"facility_{r.sender_facility_id}", "referral.state_changed", event.payload)
    broadcast_event(f"facility_{r.receiver_facility_id}", "referral.state_changed", event.payload)


APPOINTMENT_NOTICE = {
    "accept": "appointment.accepted",
    "decline": "appointment.declined",
    "propose_alternate": "appointment.alternate_proposed",
    "expire": "appointment.expired",
}


def _appointment(event):
    a = Appointment.objects.select_related("patient", "facility").filter(public_id=event.aggregate_id).first()
    if not a:
        return
    action = event.payload.get("action")
    patient = patient_user(a.patient)
    kind = APPOINTMENT_NOTICE.get(action)
    if action == "cancel":
        # Tell the patient only when someone else cancelled (a clinician or scheduler), not when they did it themselves.
        last = HistoryEntry.objects.filter(aggregate_type="appointment", aggregate_id=a.public_id, action="cancel").order_by("-id").first()
        if last and last.actor_user_id != getattr(patient, "id", None):
            kind = "appointment.cancelled"
    if kind:
        notify([patient], kind, a.public_id)
    broadcast_event(f"facility_{a.facility_id}", "appointment.state_changed", event.payload)
    if patient:
        broadcast_event(f"user_{patient.id}", "appointment.state_changed", event.payload)


HANDLERS = {"referral.state_changed": _referral, "appointment.state_changed": _appointment}
