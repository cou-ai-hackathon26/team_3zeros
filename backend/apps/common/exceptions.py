from rest_framework import status
from rest_framework.exceptions import APIException

class BaseAPIException(APIException):
    """Base class for all business and API errors following MASTERPLAN §6.2 envelope."""
    status_code = status.HTTP_400_BAD_REQUEST
    code = "validation_error"
    default_message = "A validation error occurred."

    def __init__(self, message=None, code=None, field_errors=None, status_code=None):
        if message is not None:
            self.message = message
        else:
            self.message = self.default_message
        if code is not None:
            self.code = code
        if field_errors is not None:
            self.field_errors = field_errors
        else:
            self.field_errors = None
        if status_code is not None:
            self.status_code = status_code
        super().__init__(self.message)

class ValidationError(BaseAPIException):
    status_code = status.HTTP_400_BAD_REQUEST
    code = "validation_error"
    default_message = "Validation error."

class NotAuthenticatedError(BaseAPIException):
    status_code = status.HTTP_401_UNAUTHORIZED
    code = "not_authenticated"
    default_message = "Authentication credentials were not provided or are invalid."

class MfaRequiredError(BaseAPIException):
    status_code = status.HTTP_401_UNAUTHORIZED
    code = "mfa_required"
    default_message = "Multi-factor authentication verification is required."

class PermissionDeniedError(BaseAPIException):
    status_code = status.HTTP_403_FORBIDDEN
    code = "permission_denied"
    default_message = "You do not have permission to perform this action."

class ConsentRequiredError(BaseAPIException):
    status_code = status.HTTP_403_FORBIDDEN
    code = "consent_required"
    default_message = "Patient consent is required to access or share this record."

class CsrfFailedError(BaseAPIException):
    status_code = status.HTTP_403_FORBIDDEN
    code = "csrf_failed"
    default_message = "CSRF verification failed."

class NotFoundError(BaseAPIException):
    status_code = status.HTTP_404_NOT_FOUND
    code = "not_found"
    default_message = "The requested resource was not found."

class TransitionNotAllowedError(BaseAPIException):
    status_code = status.HTTP_409_CONFLICT
    code = "transition_not_allowed"
    default_message = "The requested state transition is not allowed from the current state."

class SlotUnavailableError(BaseAPIException):
    status_code = status.HTTP_409_CONFLICT
    code = "slot_unavailable"
    default_message = "The requested appointment slot is no longer available."

class IdempotencyConflictError(BaseAPIException):
    status_code = status.HTTP_409_CONFLICT
    code = "idempotency_conflict"
    default_message = "An Idempotency-Key was reused with a different request payload."

class DuplicateCandidateError(BaseAPIException):
    status_code = status.HTTP_409_CONFLICT
    code = "duplicate_candidate"
    default_message = "Possible duplicate patient record detected."

class StaleVersionError(BaseAPIException):
    status_code = status.HTTP_412_PRECONDITION_FAILED
    code = "stale_version"
    default_message = "The resource has been modified by another request (stale If-Match version)."

class SyncPendingError(BaseAPIException):
    status_code = 423  # Locked
    code = "sync_pending"
    default_message = "The resource is currently pending synchronization with FHIR."

class RateLimitedError(BaseAPIException):
    status_code = status.HTTP_429_TOO_MANY_REQUESTS
    code = "rate_limited"
    default_message = "Request rate limit exceeded."

class FhirUnavailableError(BaseAPIException):
    status_code = status.HTTP_502_BAD_GATEWAY
    code = "fhir_unavailable"
    default_message = "The clinical exchange server (HAPI FHIR) is currently unavailable."

class ProviderUnavailableError(BaseAPIException):
    status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    code = "provider_unavailable"
    default_message = "The external service provider is currently unavailable."

