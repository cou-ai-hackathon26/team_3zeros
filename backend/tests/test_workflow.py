import pytest
from apps.workflow.engine import Transition, execute_transition, compute_allowed_actions
from apps.workflow.models import OutboxEvent, HistoryEntry
from apps.common.models import TimeStamped
from apps.common.exceptions import (
    TransitionNotAllowedError,
    StaleVersionError,
    PermissionDeniedError,
)
from django.db import models

class MockStatefulModel(TimeStamped):
    state = models.CharField(max_length=50, default="DRAFT")

    class Meta:
        app_label = "workflow"

@pytest.fixture(autouse=True)
def _mock_table(django_db_setup, django_db_blocker):
    """The mock model is defined in this file, so it has no migration: create its table for the test session."""
    from django.db import connection
    with django_db_blocker.unblock():
        if MockStatefulModel._meta.db_table not in connection.introspection.table_names():
            with connection.schema_editor() as editor:
                editor.create_model(MockStatefulModel)
    yield


MOCK_TRANSITIONS = {
    "submit": Transition(
        source={"DRAFT"},
        target="PENDING_REVIEW",
        permission=lambda a, o, p: getattr(a, "can_submit", True),
    ),
    "approve": Transition(
        source={"PENDING_REVIEW"},
        target="APPROVED",
        permission=lambda a, o, p: getattr(a, "is_approver", False),
    ),
}

class MockActor:
    def __init__(self, is_authenticated=True, can_submit=True, is_approver=False, current_role="clinician"):
        self.is_authenticated = is_authenticated
        self.can_submit = can_submit
        self.is_approver = is_approver
        self.current_role = current_role
        self.id = 1

@pytest.mark.django_db
def test_workflow_engine_transition_success():
    obj = MockStatefulModel.objects.create(state="DRAFT")
    obj.TRANSITIONS = MOCK_TRANSITIONS
    actor = MockActor(can_submit=True)

    allowed = compute_allowed_actions(obj, actor)
    assert "submit" in allowed
    assert "approve" not in allowed

    obj, allowed_after = execute_transition(obj, "submit", actor)
    assert obj.state == "PENDING_REVIEW"
    assert obj.version == 2

    # Check OutboxEvent and HistoryEntry
    outbox = OutboxEvent.objects.filter(aggregate_id=obj.public_id).first()
    assert outbox is not None
    assert outbox.event_type == "mockstatefulmodel.state_changed"

    history = HistoryEntry.objects.filter(aggregate_id=obj.public_id).first()
    assert history is not None
    assert history.from_state == "DRAFT"
    assert history.to_state == "PENDING_REVIEW"

@pytest.mark.django_db
def test_workflow_engine_stale_version():
    obj = MockStatefulModel.objects.create(state="DRAFT")
    obj.TRANSITIONS = MOCK_TRANSITIONS
    actor = MockActor()

    with pytest.raises(StaleVersionError):
        execute_transition(obj, "submit", actor, expected_version=99)

@pytest.mark.django_db
def test_workflow_engine_invalid_transition():
    obj = MockStatefulModel.objects.create(state="APPROVED")
    obj.TRANSITIONS = MOCK_TRANSITIONS
    actor = MockActor()

    with pytest.raises(TransitionNotAllowedError):
        execute_transition(obj, "submit", actor)

@pytest.mark.django_db
def test_workflow_engine_permission_denied():
    obj = MockStatefulModel.objects.create(state="PENDING_REVIEW")
    obj.TRANSITIONS = MOCK_TRANSITIONS
    actor = MockActor(is_approver=False)

    with pytest.raises(PermissionDeniedError):
        execute_transition(obj, "approve", actor)

