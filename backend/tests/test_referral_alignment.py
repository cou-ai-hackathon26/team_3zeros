"""Referral system against MASTERPLAN §4.2, §5, §6.4 and BACKEND §7: who may act, who is told, scheduled jobs,
and how triage reaches the clinician."""
from datetime import timedelta
from unittest import mock

import pytest
from django.utils import timezone

from apps.accounts.models import Membership, PlatformAdmin, User
from apps.common.exceptions import PermissionDeniedError
from apps.notifications.models import Notification
from apps.workflow import tasks
from apps.workflow.models import OutboxEvent
from apps.referrals.models import Referral

from tests.test_referral_lifecycle import act, to_ready, world  # noqa: F401  (shared fixtures)


def _send(w):
    r = to_ready(w)
    r = act(w["sender"], r, "approve")
    return act(w["sender"], r, "send")


def _dispatch():
    return tasks.dispatch_outbox_events(batch_size=500)


# --- §4.2 who may act -------------------------------------------------------------------------------------------

@pytest.mark.django_db
def test_platform_admin_and_facility_admin_cannot_act_on_referrals(world):  # noqa: F811
    w = world
    r = _send(w)
    admin = User.objects.create_user(email="pa@example.com", password="x")
    PlatformAdmin.objects.create(user=admin)
    fac_admin = User.objects.create_user(email="fa@example.com", password="x")
    Membership.objects.create(user=fac_admin, facility=r.receiver_facility, role="facility_admin")
    for who in (admin, fac_admin):
        with pytest.raises(PermissionDeniedError):
            act(who, r, "acknowledge")


@pytest.mark.django_db
def test_expired_membership_stops_acting(world):  # noqa: F811
    w = world
    r = _send(w)
    Membership.objects.filter(user=w["receiver"]).update(active_to=timezone.now() - timedelta(minutes=1))
    with pytest.raises(PermissionDeniedError):
        act(w["receiver"], r, "acknowledge")


@pytest.mark.django_db
def test_staff_acknowledge_needs_the_permission(world):  # noqa: F811
    w = world
    r = _send(w)
    staff = User.objects.create_user(email="st@example.com", password="x")
    Membership.objects.create(user=staff, facility=r.receiver_facility, role="facility_staff", permissions=[])
    with pytest.raises(PermissionDeniedError):
        act(staff, r, "acknowledge")
    Membership.objects.filter(user=staff).update(permissions=["referral.acknowledge"])
    assert act(staff, r, "acknowledge").state == "ACKNOWLEDGED_BY_RECEIVER"


# --- §5.2 / §6.4 who is told ------------------------------------------------------------------------------------

@pytest.mark.django_db
def test_the_right_people_are_notified_through_the_lifecycle(world):  # noqa: F811
    w = world
    r = act(w["sender"], w["referral"], "request_consent")
    _dispatch()
    assert Notification.objects.filter(recipient=w["patient_user"], type="referral.consent_requested").count() == 1

    from apps.consent.services import grant_consent_request
    grant_consent_request(w["patient_user"], r.consent_request.public_id)
    r.refresh_from_db()
    r = act(w["sender"], r, "approve")
    r = act(w["sender"], r, "send")
    _dispatch()
    assert Notification.objects.filter(recipient=w["receiver"], type="referral.received").count() == 1
    assert not Notification.objects.filter(recipient=w["sender"], type="referral.received").exists()

    r = act(w["receiver"], r, "acknowledge")
    r = act(w["receiver"], r, "start")
    r = act(w["receiver"], r, "record_outcome", payload={"outcome": {"summary": "done"}})
    _dispatch()
    assert Notification.objects.filter(recipient=w["sender"], type="referral.acknowledged").exists()
    assert Notification.objects.filter(recipient=w["sender"], type="referral.outcome_returned").exists()


@pytest.mark.django_db
def test_notifications_use_the_recipients_language_and_carry_no_clinical_content(world):  # noqa: F811
    w = world
    User.objects.filter(pk=w["receiver"].pk).update(preferred_language="en")
    _send(w)
    _dispatch()
    n = Notification.objects.get(recipient=w["receiver"], type="referral.received")
    assert n.title == "New referral received" and "Cardiac" not in n.body and "chest" not in n.body
    assert n.object_ref is not None


@pytest.mark.django_db
def test_state_changes_are_broadcast_with_ids_and_states_only(world):  # noqa: F811
    w = world
    _send(w)
    with mock.patch("apps.workflow.handlers.broadcast_event") as bc:
        _dispatch()
    groups = {c.args[0] for c in bc.mock_calls}
    r = Referral.objects.get(pk=w["referral"].pk)
    assert {f"facility_{r.sender_facility_id}", f"facility_{r.receiver_facility_id}"} <= groups
    for c in bc.mock_calls:
        assert set(c.args[2]) == {"id", "state", "version", "action"}


@pytest.mark.django_db
def test_every_outbox_event_is_marked_dispatched(world):  # noqa: F811
    _send(world)
    _dispatch()
    assert not OutboxEvent.objects.filter(dispatched_at__isnull=True).exists()


# --- BACKEND §7.2 scheduled jobs ---------------------------------------------------------------------------------

@pytest.mark.django_db
def test_jobs_do_nothing_until_their_policy_is_set(world, settings):  # noqa: F811
    r = _send(world)
    Referral.objects.filter(pk=r.pk).update(urgency="emergency", sent_at=timezone.now() - timedelta(days=3))
    assert tasks.escalate_unacknowledged_referrals() == 0
    assert tasks.remind_unacknowledged_referrals() == 0
    assert tasks.abandon_idle_triage_sessions() == 0
    assert tasks.expire_appointment_requests() == 0
    r.refresh_from_db()
    assert r.state == "SENT"


@pytest.mark.django_db
def test_emergency_referral_escalates_after_the_threshold_only(world, settings):  # noqa: F811
    settings.REFERRAL_ESCALATION_MINUTES = 10
    r = _send(world)
    Referral.objects.filter(pk=r.pk).update(urgency="emergency", sent_at=timezone.now() - timedelta(minutes=5))
    assert tasks.escalate_unacknowledged_referrals() == 0
    Referral.objects.filter(pk=r.pk).update(sent_at=timezone.now() - timedelta(minutes=11))
    assert tasks.escalate_unacknowledged_referrals() == 1
    r.refresh_from_db()
    assert r.state == "ESCALATED" and r.escalated_at is not None
    _dispatch()
    assert Notification.objects.filter(recipient=world["receiver"], type="referral.escalated").exists()
    assert Notification.objects.filter(recipient=world["sender"], type="referral.escalated").exists()


@pytest.mark.django_db
def test_routine_referrals_are_never_escalated_only_reminded_once(world, settings):  # noqa: F811
    settings.REFERRAL_ESCALATION_MINUTES = 1
    settings.REFERRAL_REMINDER_MINUTES = 10
    r = _send(world)
    Referral.objects.filter(pk=r.pk).update(sent_at=timezone.now() - timedelta(minutes=30))
    assert tasks.escalate_unacknowledged_referrals() == 0
    assert tasks.remind_unacknowledged_referrals() == 1
    assert tasks.remind_unacknowledged_referrals() == 0  # not again within the interval
    r.refresh_from_db()
    assert r.state == "SENT"


@pytest.mark.django_db
def test_idle_triage_sessions_are_abandoned(settings):
    from apps.triage.models import TriageSession
    from apps.triage.services import create_triage_session

    settings.TRIAGE_IDLE_TIMEOUT_MINUTES = 30
    old = create_triage_session(user=None, language="en", disclosure_version="v1.0")
    fresh = create_triage_session(user=None, language="en", disclosure_version="v1.0")
    stale = timezone.now() - timedelta(minutes=90)
    TriageSession.objects.filter(pk=old.pk).update(updated_at=stale)
    old.turns.update(at=stale)
    assert tasks.abandon_idle_triage_sessions() == 1
    old.refresh_from_db(); fresh.refresh_from_db()
    assert old.state == "ABANDONED" and fresh.state == "ACTIVE"


def test_beat_schedule_runs_the_outbox_and_every_job(settings):
    names = {v["task"].rsplit(".", 1)[1] for v in settings.CELERY_BEAT_SCHEDULE.values()}
    assert {"dispatch_outbox_events", "escalate_unacknowledged_referrals", "remind_unacknowledged_referrals",
            "abandon_idle_triage_sessions", "expire_appointment_requests"} <= names
