"""
Phase 3C.2 (F-1): View-level user-scoped idempotency helpers for DRF views.

Medi Waypoint's production authentication is SessionAuthentication (first-party HttpOnly cookies),
where Django's AuthenticationMiddleware populates request.user before IdempotencyMiddleware.
However, any caller authenticated at the DRF layer (e.g., APIClient.force_authenticate or future
DRF authenticators) populates request.user inside APIView.initial() — AFTER middleware.

Calling resolve_idempotent_replay(request) and persist_idempotent_response(request, response)
inside DRF views guarantees consistent, user-scoped idempotency replay and atomic persistence
across ALL Django and DRF authentication layers without weakening user isolation.
"""

import hashlib
import uuid
from rest_framework.response import Response
from .exceptions import IdempotencyConflictError, ValidationError
from .models import IdempotencyRecord


def _extract_idempotency_key_and_hash(request):
    raw_key = request.headers.get("Idempotency-Key")
    if not raw_key or not str(raw_key).strip():
        return None, None
    try:
        key = uuid.UUID(str(raw_key).strip())
    except ValueError:
        raise ValidationError("Invalid Idempotency-Key header format. Must be UUIDv4.")
    body = request.body or b""
    request_hash = hashlib.sha256(body).hexdigest()
    return key, request_hash


def resolve_idempotent_replay(request):
    """
    If request carries an Idempotency-Key already recorded for (key, endpoint, request.user):
    - Raises IdempotencyConflictError (409) on payload hash mismatch.
    - Returns a DRF Response with X-Idempotent-Replay: true on exact match.
    Otherwise returns None.
    """
    key, request_hash = _extract_idempotency_key_and_hash(request)
    if key is None:
        return None

    user = getattr(request, "user", None)
    if not user or not getattr(user, "is_authenticated", False):
        return None

    record = IdempotencyRecord.objects.filter(
        key=key,
        endpoint=request.path_info,
        user=user,
    ).first()
    if not record:
        return None

    if record.request_hash != request_hash:
        raise IdempotencyConflictError(
            "An Idempotency-Key was reused with a different request payload."
        )

    return Response(
        record.response_body if record.response_body is not None else {},
        status=record.response_status,
        headers={"X-Idempotent-Replay": "true"},
    )


def persist_idempotent_response(request, response):
    """
    Atomically persist a successful (2xx) view response for (key, endpoint, request.user).
    Safe to call inside transaction.atomic().
    """
    if not (200 <= response.status_code < 300):
        return
    key, request_hash = _extract_idempotency_key_and_hash(request)
    if key is None:
        return

    user = getattr(request, "user", None)
    if not user or not getattr(user, "is_authenticated", False):
        return

    IdempotencyRecord.objects.get_or_create(
        key=key,
        endpoint=request.path_info,
        defaults={
            "user": user,
            "request_hash": request_hash,
            "response_status": response.status_code,
            "response_body": response.data,
        },
    )
