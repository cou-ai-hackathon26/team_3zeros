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
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from .models import User, PatientAccount
from .selectors import get_user_roles, get_user_permissions

from django.conf import settings
from . import security
from .selectors import is_admin_user

INVALID_CREDENTIALS = "Invalid username, email, phone, or password."


def _client_ip(request) -> str:
    return request.META.get("REMOTE_ADDR", "") if request is not None else ""


def _finish_login(request, user, *, staff: bool):
    login(request, user)
    if staff:
        request.session.set_expiry(settings.STAFF_SESSION_SECONDS)
    record_audit_event(
        action="login",
        object_type="user",
        object_id=str(user.public_id),
        actor_user=user,
        request_id=getattr(request, "request_id", ""),
    )
    return user


def find_user(identifier: str):
    """Sign-in identifier: email or username, case-insensitive."""
    ident = (identifier or "").strip()
    return User.objects.filter(email__iexact=ident).first() or User.objects.filter(username__iexact=ident).first()


def register_patient(request, *, email=None, username=None, display_name="", password=""):
    """
    Patient self-registration with email or username and a password (replaces one-time codes).
    The account gets a `patient` role through a PatientAccount. Attempts are rate limited per client address.
    """
    ip_key = f"register-ip:{_client_ip(request)}"
    security.assert_not_locked(ip_key)
    security.register_failure(ip_key)  # every attempt counts, successful or not
    email = (email or "").strip().lower() or None
    username = (username or "").strip() or None
    if not email and not username:
        raise ValidationError("An email or username is required.", field_errors={"email": ["Provide an email or a username."]})
    try:
        validate_password(password, user=User(email=email, username=username, display_name=display_name))
    except DjangoValidationError as e:
        raise ValidationError("That password is not strong enough.", field_errors={"password": list(e.messages)})
    if (email and User.objects.filter(email__iexact=email).exists()) or (username and User.objects.filter(username__iexact=username).exists()):
        # One message for every clash, so the form cannot be used to probe for accounts.
        raise ValidationError("An account could not be created with those details.")
    from apps.identity.models import Patient
    with transaction.atomic():
        user = User.objects.create_user(email=email, username=username, password=password, display_name=display_name)
        patient = Patient.objects.create(given_name=display_name or (email or username))
        PatientAccount.objects.create(user=user, patient=patient)
    record_audit_event(action="create", object_type="user", object_id=str(user.public_id), actor_user=user, reason="patient registration", request_id=getattr(request, "request_id", ""))
    return _finish_login(request, user, staff=False)


def authenticate_and_login(request, username=None, email=None, phone=None, password=None, admin=False):
    """
    Password sign-in. `admin=True` is the separate admin entrance (MASTERPLAN D-17): only admin accounts pass
    there, and admin accounts are refused at the ordinary staff entrance. Every refusal gives the same error
    as a wrong password, so neither entrance reveals which accounts exist or who is an admin.
    """
    target_identifier = username or email or phone
    if not target_identifier or not password:
        raise ValidationError("Identifier and password are required.")

    ident_key = f"login:{target_identifier.strip().lower()}"
    ip_key = f"login-ip:{_client_ip(request)}"
    security.assert_not_locked(ident_key)
    security.assert_not_locked(ip_key)

    candidate = find_user(target_identifier)
    user = candidate if candidate and candidate.check_password(password) else None

    refusal = None
    if user and user.is_active:
        holds_admin = is_admin_user(user)
        if admin and not holds_admin:
            refusal = "Not an admin account"
        elif not admin and holds_admin:
            refusal = "Admin account used the staff entrance"
        elif admin and not (user.mfa_enabled and user.mfa_secret):
            refusal = "Admin MFA is not enrolled"

    if not user or refusal:
        security.register_failure(ident_key)
        security.register_failure(ip_key)
        record_audit_event(
            action="login_failed",
            object_type="user",
            object_id=target_identifier,
            reason=refusal or "Invalid credentials",
            request_id=getattr(request, "request_id", ""),
        )
        raise NotAuthenticatedError(INVALID_CREDENTIALS)

    if not user.is_active:
        raise PermissionDeniedError("Account is inactive.")

    security.clear_failures(ident_key)

    if user.mfa_enabled:
        request.session["mfa_pending_user_id"] = str(user.public_id)
        raise MfaRequiredError("MFA code required to complete login.")

    return _finish_login(request, user, staff=bool(user.memberships.exists()))


def verify_mfa_code(request, code: str):
    user_id = request.session.get("mfa_pending_user_id")
    if not user_id:
        raise ValidationError("No pending MFA session found.")

    user = User.objects.filter(public_id=user_id).first()
    if not user:
        raise NotFoundError("User not found.")

    key = f"mfa:{user.public_id}"
    security.assert_not_locked(key)
    valid = security.verify_totp(user.mfa_secret, code) or (settings.DEV_FIXED_CODES and code == "123456")
    if not valid:
        security.register_failure(key)
        record_audit_event(
            action="login_failed",
            object_type="user",
            object_id=str(user.public_id),
            reason="Invalid MFA code",
            request_id=getattr(request, "request_id", ""),
        )
        raise ValidationError("Invalid MFA code.")

    security.clear_failures(key)
    del request.session["mfa_pending_user_id"]
    return _finish_login(request, user, staff=True)


