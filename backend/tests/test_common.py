import uuid
import pytest
from django.test import RequestFactory
from django.http import HttpResponse
from rest_framework import status
from apps.common.models import IdempotencyRecord
from apps.common.middleware import IdempotencyMiddleware, RequestIdMiddleware
from apps.common.exceptions import (
    TransitionNotAllowedError,
    StaleVersionError,
    SlotUnavailableError,
    IdempotencyConflictError,
)
from apps.common.exception_handler import custom_exception_handler
from apps.accounts.models import User

@pytest.mark.django_db
def test_request_id_middleware():
    rf = RequestFactory()
    request = rf.get("/api/v1/auth/me")
    middleware = RequestIdMiddleware(lambda r: HttpResponse("OK"))
    response = middleware(request)
    assert hasattr(request, "request_id")
    assert response.headers.get("X-Request-ID") == request.request_id

@pytest.mark.django_db
def test_error_envelope_structure():
    rf = RequestFactory()
    request = rf.get("/test")
    request.request_id = str(uuid.uuid4())
    context = {"request": request}

    exc = TransitionNotAllowedError("Cannot transition from CANCELLED.")
    resp = custom_exception_handler(exc, context)

    assert resp.status_code == status.HTTP_409_CONFLICT
    assert "error" in resp.data
    err = resp.data["error"]
    assert err["code"] == "transition_not_allowed"
    assert err["message"] == "Cannot transition from CANCELLED."
    assert err["request_id"] == request.request_id

@pytest.mark.django_db
def test_idempotency_middleware_replay_and_conflict():
    rf = RequestFactory()
    middleware = IdempotencyMiddleware(lambda r: HttpResponse('{"status":"created"}', content_type="application/json", status=201))

    key = str(uuid.uuid4())
    body1 = b'{"amount": 100}'
    body2 = b'{"amount": 200}'

    # First request
    req1 = rf.post("/api/v1/appointments", data=body1, content_type="application/json", HTTP_IDEMPOTENCY_KEY=key)
    req1.request_id = str(uuid.uuid4())
    resp1 = middleware(req1)
    assert resp1.status_code == 201

    # Second request with identical payload -> should replay
    req2 = rf.post("/api/v1/appointments", data=body1, content_type="application/json", HTTP_IDEMPOTENCY_KEY=key)
    req2.request_id = str(uuid.uuid4())
    resp2 = middleware(req2)
    assert resp2.status_code == 201
    assert resp2.headers.get("X-Idempotent-Replay") == "true"

    # Third request with differing payload -> 409 idempotency_conflict
    req3 = rf.post("/api/v1/appointments", data=body2, content_type="application/json", HTTP_IDEMPOTENCY_KEY=key)
    req3.request_id = str(uuid.uuid4())
    resp3 = middleware(req3)
    assert resp3.status_code == 409
    assert b"idempotency_conflict" in resp3.content
