from django.contrib.auth import authenticate, login, logout
from django.db import transaction
from apps.common.exceptions import (
    ValidationError,
    NotAuthenticatedError,
    MfaRequiredError,
    PermissionDeniedError,
    NotFoundError,
)
from apps.audit.services import record_audit_event
from .models import User, PatientAccount
from .selectors import get_user_roles, get_user_permissions

# Mock OTP cache in memory for local/testing
_OTP_STORE = {}

def authenticate_and_login(request, username=None, email=None, phone=None, password=None):
    user = None
    target_identifier = username or email or phone
    if not target_identifier or not password:
        raise ValidationError("Identifier and password are required.")

    # Try lookup by email or phone
    candidate = User.objects.filter(email=target_identifier).first() or User.objects.filter(phone=target_identifier).first()
    if candidate and candidate.check_password(password):
        user = candidate

    if not user:
        record_audit_event(
            action="login_failed",
            object_type="user",
            object_id=target_identifier,
            reason="Invalid credentials",
            request_id=getattr(request, "request_id", ""),
        )
        raise NotAuthenticatedError("Invalid username, email, phone, or password.")

    if not user.is_active:
        raise PermissionDeniedError("Account is inactive.")

    if user.mfa_enabled:
        # Request MFA verification
        request.session["mfa_pending_user_id"] = str(user.public_id)
        raise MfaRequiredError("MFA code required to complete login.")

    login(request, user)
    record_audit_event(
        action="login",
        object_type="user",
        object_id=str(user.public_id),
        actor_user=user,
        request_id=getattr(request, "request_id", ""),
    )
    return user


def verify_mfa_code(request, code: str):
    user_id = request.session.get("mfa_pending_user_id")
    if not user_id:
        raise ValidationError("No pending MFA session found.")

    user = User.objects.filter(public_id=user_id).first()
    if not user:
        raise NotFoundError("User not found.")

    # In development/testing, accept '123456'
    if code != "123456":
        record_audit_event(
            action="login_failed",
            object_type="user",
            object_id=str(user.public_id),
            reason="Invalid MFA code",
            request_id=getattr(request, "request_id", ""),
        )
        raise ValidationError("Invalid MFA code.")

    del request.session["mfa_pending_user_id"]
    login(request, user)
    record_audit_event(
        action="login",
        object_type="user",
        object_id=str(user.public_id),
        actor_user=user,
        request_id=getattr(request, "request_id", ""),
    )
    return user


def request_phone_otp(phone: str) -> str:
    """Sends OTP to phone. In mock/local, stores '123456'."""
    _OTP_STORE[phone] = "123456"
    return "OTP sent successfully."


def verify_phone_otp_and_login(request, phone: str, code: str):
    expected_code = _OTP_STORE.get(phone, "123456")
    if code != expected_code:
        raise ValidationError("Invalid or expired OTP.")

    # Find or create patient user
    user = User.objects.filter(phone=phone).first()
    if not user:
        with transaction.atomic():
            user = User.objects.create_user(phone=phone, display_name=f"Patient {phone[-4:]}")
            # Patient record is linked when profile is created in identity app
    login(request, user)
    record_audit_event(
        action="login",
        object_type="user",
        object_id=str(user.public_id),
        actor_user=user,
        request_id=getattr(request, "request_id", ""),
    )
    return user
