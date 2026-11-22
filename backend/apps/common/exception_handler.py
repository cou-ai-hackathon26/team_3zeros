import uuid
from django.core.exceptions import PermissionDenied, ValidationError as DjangoValidationError
from django.http import Http404
from rest_framework import exceptions, status
from rest_framework.response import Response
from rest_framework.views import exception_handler as drf_exception_handler
from .exceptions import BaseAPIException

def custom_exception_handler(exc, context):
    """
    Produces the standard MASTERPLAN §6.2 error envelope for all exceptions:
    {
      "error": {
        "code": "<code_string>",
        "message": "<human_message>",
        "field_errors": { ... } or null,
        "request_id": "<request_id>"
      }
    }
    """
    request = context.get("request")
    request_id = getattr(request, "request_id", str(uuid.uuid4())) if request else str(uuid.uuid4())

    # If it is our domain BaseAPIException
    if isinstance(exc, BaseAPIException):
        payload = {
            "error": {
                "code": exc.code,
                "message": exc.message,
                "field_errors": exc.field_errors,
                "request_id": request_id,
            }
        }
        return Response(payload, status=exc.status_code)

    # Convert Django Http404 and PermissionDenied
    if isinstance(exc, Http404):
        exc = exceptions.NotFound()
    elif isinstance(exc, PermissionDenied):
        exc = exceptions.PermissionDenied()
    elif isinstance(exc, DjangoValidationError):
        if hasattr(exc, "message_dict"):
            exc = exceptions.ValidationError(detail=exc.message_dict)
        elif hasattr(exc, "messages"):
            exc = exceptions.ValidationError(detail=exc.messages)
        else:
            exc = exceptions.ValidationError(detail=str(exc))

    # Standard DRF exception handling
    response = drf_exception_handler(exc, context)

    if response is not None:
        code = "validation_error"
        message = "An error occurred."
        field_errors = None

        if isinstance(exc, exceptions.NotAuthenticated):
            code = "not_authenticated"
            message = "Authentication credentials were not provided."
        elif isinstance(exc, exceptions.AuthenticationFailed):
            code = "not_authenticated"
            message = str(exc.detail) if hasattr(exc, "detail") else "Authentication failed."
        elif isinstance(exc, exceptions.PermissionDenied):
            code = "permission_denied"
            message = str(exc.detail) if hasattr(exc, "detail") else "You do not have permission."
        elif isinstance(exc, exceptions.NotFound):
            code = "not_found"
            message = str(exc.detail) if hasattr(exc, "detail") else "Not found."
        elif isinstance(exc, exceptions.Throttled):
            code = "rate_limited"
            message = f"Request was throttled. Expected available in {exc.wait} seconds."
        elif isinstance(exc, exceptions.ValidationError):
            code = "validation_error"
            message = "Validation error."
            if isinstance(response.data, dict):
                field_errors = response.data
            elif isinstance(response.data, list):
                field_errors = {"non_field_errors": response.data}
        else:
            if hasattr(exc, "detail"):
                message = str(exc.detail)

        payload = {
            "error": {
                "code": code,
                "message": message,
                "field_errors": field_errors,
                "request_id": request_id,
            }
        }
        response.data = payload
        return response

    # Unhandled 500 exceptions
    payload = {
        "error": {
            "code": "server_error",
            "message": "An unexpected server error occurred.",
            "field_errors": None,
            "request_id": request_id,
        }
    }
    return Response(payload, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
