import hashlib
import json
import uuid
from django.http import JsonResponse
from django.utils.deprecation import MiddlewareMixin
from .models import IdempotencyRecord
from .exceptions import IdempotencyConflictError

class RequestIdMiddleware(MiddlewareMixin):
    """
    Extracts incoming X-Request-ID or assigns a new UUIDv4 to each request.
    Injects request_id into request and response headers.
    """
    def process_request(self, request):
        request_id = request.headers.get("X-Request-ID")
        if not request_id:
            request_id = str(uuid.uuid4())
        request.request_id = request_id

    def process_response(self, request, response):
        request_id = getattr(request, "request_id", None)
        if request_id:
            response["X-Request-ID"] = request_id
        return response


class IdempotencyMiddleware(MiddlewareMixin):
    """
    Enforces MASTERPLAN §6.1 Idempotency-Key contract:
    - Every POST that mutates or performs a transition can require or check Idempotency-Key.
    - If Idempotency-Key is provided:
        - Same key + same body -> exact cached response replayed.
        - Same key + different body -> 409 idempotency_conflict error.
    """
    IDEMPOTENCY_HEADER = "HTTP_IDEMPOTENCY_KEY"

    def process_request(self, request):
        if request.method not in ("POST", "PUT", "PATCH"):
            return None

        raw_key = request.META.get(self.IDEMPOTENCY_HEADER)
        if not raw_key:
            return None

        try:
            key = uuid.UUID(raw_key)
        except ValueError:
            return JsonResponse(
                {
                    "error": {
                        "code": "validation_error",
                        "message": "Invalid Idempotency-Key header format. Must be UUIDv4.",
                        "field_errors": None,
                        "request_id": getattr(request, "request_id", str(uuid.uuid4())),
                    }
                },
                status=400,
            )

        # Compute request body hash
        body = request.body or b""
        request_hash = hashlib.sha256(body).hexdigest()
        request.idempotency_key = key
        request.idempotency_hash = request_hash

        endpoint = request.path_info
        record = IdempotencyRecord.objects.filter(key=key, endpoint=endpoint).first()
        if record:
            if record.request_hash != request_hash:
                return JsonResponse(
                    {
                        "error": {
                            "code": "idempotency_conflict",
                            "message": "An Idempotency-Key was reused with a different request payload.",
                            "field_errors": None,
                            "request_id": getattr(request, "request_id", str(uuid.uuid4())),
                        }
                    },
                    status=409,
                )
            # Replay stored response
            response = JsonResponse(record.response_body or {}, status=record.response_status, safe=False)
            response["X-Idempotent-Replay"] = "true"
            response["X-Request-ID"] = getattr(request, "request_id", str(uuid.uuid4()))
            return response

        return None

    def process_response(self, request, response):
        key = getattr(request, "idempotency_key", None)
        request_hash = getattr(request, "idempotency_hash", None)

        if key and request_hash and 200 <= response.status_code < 300:
            endpoint = request.path_info
            user = request.user if getattr(request, "user", None) and request.user.is_authenticated else None
            try:
                body_data = json.loads(response.content.decode("utf-8")) if response.content else None
            except Exception:
                body_data = None

            IdempotencyRecord.objects.get_or_create(
                key=key,
                endpoint=endpoint,
                defaults={
                    "user": user,
                    "request_hash": request_hash,
                    "response_status": response.status_code,
                    "response_body": body_data,
                },
            )
        return response
