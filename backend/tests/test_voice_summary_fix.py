"""VOICE_SUMMARY_FIX_PLAN: one claim per outbox event, fail closed without a webhook secret, no empty summary."""
import threading

import pytest
from rest_framework.test import APIClient

from apps.triage.services import create_triage_session, process_patient_turn, run_triage_action
from apps.workflow import tasks
from apps.workflow.models import OutboxEvent


# --- step 3: the dispatcher claims each event ---------------------------------------------------------------------

@pytest.mark.django_db(transaction=True)
def test_two_overlapping_dispatchers_handle_an_event_once(monkeypatch):
    from django.db import connection
    OutboxEvent.objects.all().delete()
    ev = OutboxEvent.objects.create(aggregate_type="x", aggregate_id="00000000-0000-0000-0000-000000000001", event_type="noop.event", payload={})
    handled, started, release = [], threading.Event(), threading.Event()

    def slow_route(event):
        handled.append(event.pk)
        started.set()
        assert release.wait(10)

    monkeypatch.setattr(tasks, "_route", slow_route)
    first = {}

    def first_dispatcher():
        try:
            first["n"] = tasks.dispatch_outbox_events()
        finally:
            connection.close()

    t = threading.Thread(target=first_dispatcher)
    t.start()
    assert started.wait(10)
    assert tasks.dispatch_outbox_events() == 0  # the second dispatcher skips the claimed event instead of waiting or repeating it
    release.set()
    t.join(10)
    assert first["n"] == 1 and handled == [ev.pk]
    ev.refresh_from_db()
    assert ev.dispatched_at is not None


@pytest.mark.django_db
def test_a_failing_event_stays_pending_and_is_counted(monkeypatch):
    OutboxEvent.objects.all().delete()
    ev = OutboxEvent.objects.create(aggregate_type="x", aggregate_id="00000000-0000-0000-0000-000000000002", event_type="noop.event", payload={})
    monkeypatch.setattr(tasks, "_route", lambda e: (_ for _ in ()).throw(RuntimeError("boom")))
    assert tasks.dispatch_outbox_events() == 0
    ev.refresh_from_db()
    assert ev.dispatched_at is None and ev.attempts == 1 and "boom" in ev.last_error


def test_a_long_job_does_not_block_the_request_when_tasks_run_eagerly(settings):
    settings.CELERY_TASK_ALWAYS_EAGER = True
    started, release, finished = threading.Event(), threading.Event(), []

    def task(arg):
        started.set()
        release.wait(10)
        finished.append(arg)

    tasks._run_long(task, "doc-1")  # returns at once even though the job is still running
    assert started.wait(5) and finished == []
    release.set()


def test_with_a_real_broker_a_long_job_is_queued(settings):
    settings.CELERY_TASK_ALWAYS_EAGER = False
    queued = []
    tasks._run_long(type("T", (), {"delay": staticmethod(lambda a: queued.append(a))}), "doc-2")
    assert queued == ["doc-2"]


# --- step 2: fail closed -----------------------------------------------------------------------------------------

@pytest.mark.django_db
def test_voice_credentials_are_refused_when_the_webhook_secret_is_missing(settings):
    settings.VOICE_PROVIDER, settings.VAPI_PUBLIC_KEY, settings.VAPI_ASSISTANT_ID, settings.VAPI_WEBHOOK_SECRET = "vapi", "pk", "a", ""
    s = create_triage_session(user=None, language="en", disclosure_version="v1.0")
    r = APIClient().post(f"/api/v1/triage/sessions/{s.public_id}/voice-credentials", {}, format="json")
    assert r.status_code == 503
    assert "provider_unavailable" in str(r.data)


@pytest.mark.django_db
def test_voice_credentials_are_issued_once_the_secret_is_set(settings):
    settings.VOICE_PROVIDER, settings.VAPI_PUBLIC_KEY, settings.VAPI_ASSISTANT_ID, settings.VAPI_WEBHOOK_SECRET = "vapi", "pk", "a", "whsec"
    s = create_triage_session(user=None, language="en", disclosure_version="v1.0")
    r = APIClient().post(f"/api/v1/triage/sessions/{s.public_id}/voice-credentials", {}, format="json")
    assert r.status_code == 200 and r.data["provider"] == "vapi"


# --- step 4: no empty summary ------------------------------------------------------------------------------------

@pytest.mark.django_db
def test_a_summary_with_no_patient_answers_cannot_be_confirmed():
    s = create_triage_session(user=None, language="en", disclosure_version="v1.0")  # only the greeting exists
    run_triage_action(s, "finish_questions")
    r = APIClient().post(f"/api/v1/triage/sessions/{s.public_id}/summary/confirm", {"edits": {}}, format="json")
    assert r.status_code == 400
    s.refresh_from_db()
    assert s.state == "SUMMARY_PENDING_REVIEW"


@pytest.mark.django_db
def test_a_summary_with_an_answer_can_still_be_confirmed(monkeypatch):
    from apps.triage import dialogue
    monkeypatch.setattr(dialogue, "generate_text", lambda *a, **k: "How old are you?")
    s = create_triage_session(user=None, language="en", disclosure_version="v1.0")
    process_patient_turn(s, "I have a cough")
    run_triage_action(s, "finish_questions")
    r = APIClient().post(f"/api/v1/triage/sessions/{s.public_id}/summary/confirm", {"edits": {}}, format="json")
    assert r.status_code == 200
